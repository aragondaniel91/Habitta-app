-- HAB-427: give a resident an authoritative, per-unit financial picture, and fix the temporal
-- window that decides who may submit a payment.
--
-- Two changes, both narrow.

-- ------------------------------------------------------------------ payable window

-- `can_submit_payment` asked only for `ends_at is null`, while `can_read_financial_unit` -- the
-- function that decides whether the same person may *see* that unit's money -- asks for the full
-- window. The two disagreed in both directions:
--
--   an ownership starting tomorrow already qualified, because its end date is null;
--   an ownership active today with a scheduled end next month did not, because its end date is not.
--
-- The second is the one that bites: closing a sale on a future date silently removes the owner's
-- ability to pay in the meantime. HAB-427 needs "payable unit" to mean something, so the window is
-- now stated the same way in both functions.
--
-- Only the window changes. The restricted-resident guard, the occupancy-type allowlist, the active
-- unit requirement and the staff escape are exactly as they were: family members and authorized
-- occupants still cannot submit, and the tenant pilot is untouched.
create or replace function public.can_submit_payment(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_manage_people(u.condominium_id)
    or (
      not public.is_restricted_resident_only_for_condominium(u.condominium_id)
      and (
        exists (
          select 1
          from public.unit_owners o
          join public.people p on p.id = o.person_id
          where o.unit_id = target_unit
            and o.starts_at <= current_date
            and (o.ends_at is null or o.ends_at >= current_date)
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.unit_occupancies o
          join public.people p on p.id = o.person_id
          where o.unit_id = target_unit
            and o.starts_at <= current_date
            and (o.ends_at is null or o.ends_at >= current_date)
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
            -- Being somebody's family is not a financial standing. Unchanged from HAB-418.
            and o.occupancy_type in ('owner_occupant', 'tenant')
        )
      )
    )
  from public.units u
  where u.id = target_unit
    and u.status = 'active';
$$;

-- ------------------------------------------------------------------ per-unit financial context

-- What the resident dashboard needs to stop doing arithmetic it has no business doing.
--
-- A balance is not the sum of open receivables. Credits, overpayments and adjustments live in the
-- ledger, so a unit can owe nothing while its receivables still list amounts, or be in credit
-- while every receivable is settled. `get_receivables_summary` already derives the consolidated
-- figure from `debit - credit`; this does the same thing one unit at a time, so the two can never
-- disagree about what a balance is.
--
-- Scope is the caller's own units and nothing else: every row passes through
-- `can_read_financial_unit`, the same gate the receivables and ledger policies use. Deliberately
-- *not* `can_read_board_aggregates` -- this answers "what do my units owe", never "what does the
-- condominium owe", and a board member asking it gets their own units like anyone else.
--
-- Currencies stay apart. One row per unit per currency, never a converted total: USD 50 and
-- VES 1000 are two facts, and adding them would invent a third that is not true in either.
--
-- A unit with no movement still appears, once, with a null currency and zeros. Owning something
-- that owes nothing is information; dropping the row would make the unit look like it was never
-- there.
create or replace function public.get_resident_financial_units(target uuid)
returns table (
  unit_id uuid,
  can_submit_payment boolean,
  currency_code text,
  total_debits text,
  total_credits text,
  net_outstanding text,
  overdue_amount text,
  upcoming_amount text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with visible_units as (
    select u.id
    from public.units u
    where u.condominium_id = target
      and u.status = 'active'
      and public.can_read_financial_unit(u.id)
  ), ledger as (
    select
      e.unit_id,
      e.currency_code,
      sum(e.amount) filter (where e.direction = 'debit') as debits,
      sum(e.amount) filter (where e.direction = 'credit') as credits
    from public.receivable_ledger_entries e
    join visible_units v on v.id = e.unit_id
    where e.condominium_id = target
    group by e.unit_id, e.currency_code
  ), aged as (
    -- The same aging rule the consolidated summary uses, called rather than restated. Two
    -- definitions of "overdue" in one product is a bug waiting for a month boundary.
    select
      b.unit_id,
      b.currency_code,
      sum(b.outstanding_amount::numeric) filter (
        where public.receivable_aging_date(b.due_date, b.issue_date, i.item_type) < current_date
          and b.status not in ('settled', 'reversed')
      ) as overdue,
      sum(b.outstanding_amount::numeric) filter (
        where (
            public.receivable_aging_date(b.due_date, b.issue_date, i.item_type) is null
            or public.receivable_aging_date(b.due_date, b.issue_date, i.item_type) >= current_date
          )
          and b.status not in ('settled', 'reversed')
      ) as upcoming
    from public.receivable_balances b
    join public.receivable_items i on i.id = b.id
    join visible_units v on v.id = b.unit_id
    where b.condominium_id = target
    group by b.unit_id, b.currency_code
  ), unit_currencies as (
    select l.unit_id, l.currency_code from ledger l
    union
    select a.unit_id, a.currency_code from aged a
  )
  select
    v.id,
    public.can_submit_payment(v.id),
    c.currency_code,
    to_char(coalesce(l.debits, 0), 'FM999999999999990.00'),
    to_char(coalesce(l.credits, 0), 'FM999999999999990.00'),
    to_char(coalesce(l.debits, 0) - coalesce(l.credits, 0), 'FM999999999999990.00'),
    to_char(coalesce(a.overdue, 0), 'FM999999999999990.00'),
    to_char(coalesce(a.upcoming, 0), 'FM999999999999990.00')
  from visible_units v
  left join unit_currencies c on c.unit_id = v.id
  left join ledger l on l.unit_id = v.id and l.currency_code is not distinct from c.currency_code
  left join aged a on a.unit_id = v.id and a.currency_code is not distinct from c.currency_code
  order by v.id, c.currency_code;
$$;

revoke all on function public.get_resident_financial_units(uuid) from public, anon;
grant execute on function public.get_resident_financial_units(uuid) to authenticated, service_role;
