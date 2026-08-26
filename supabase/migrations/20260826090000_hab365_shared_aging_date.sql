-- HAB-365: the aging date had two definitions, and they disagreed.
--
-- `get_receivables_aging` aged an item from its due date, falling back to the issue date for an
-- opening balance. `get_receivables_summary` used the raw due date with no fallback at all. So for
-- every opening balance the two RPCs contradicted each other on the same screen: the aging panel
-- put a six-month-old legacy balance in the 90+ bucket while the summary card counted it as
-- upcoming. One rule now serves both.
--
-- The rule itself is extended in exactly one place: late fees. They are posted with
-- `due_date = null` because the penalty is already incurred -- there is nothing left to fall due --
-- so they sat in the current bucket forever, and a fee charged eight months ago was reported as
-- money nobody owed yet.
--
-- HAB-344's invariant is preserved deliberately: an ordinary charge or adjustment with no due date
-- keeps its current/no-due semantics. That was a stated decision about charges still awaiting a
-- due date, and this migration does not reopen it. Only the two item types that represent debt
-- already incurred age from their issue date.

create or replace function public.receivable_aging_date(
  item_due date,
  item_issue date,
  item_type public.receivable_item_type
)
returns date
language sql
immutable
parallel safe
as $$
  select coalesce(
    item_due,
    case when item_type in ('opening_balance', 'late_fee') then item_issue end
  );
$$;

comment on function public.receivable_aging_date(date, date, public.receivable_item_type) is
  'The date an outstanding item starts aging from. Debt already incurred (an opening balance, a late fee) ages from its issue date when it carries no due date; an ordinary charge without a due date is not yet due.';

grant execute on function public.receivable_aging_date(date, date, public.receivable_item_type)
  to authenticated, service_role;
create or replace function public.get_receivables_summary(target uuid)
returns table(
  currency_code text,
  total_debits text,
  total_credits text,
  net_outstanding text,
  units_with_debit_balance bigint,
  units_with_credit_balance bigint,
  overdue_amount text,
  upcoming_amount text
)
language sql
stable
security definer
set search_path=public
set row_security=off
as $$
  with allowed_entries as (
    select e.*
    from public.receivable_ledger_entries e
    where e.condominium_id = target
      and (
        public.can_read_board_aggregates(target)
        or public.can_read_financial_unit(e.unit_id)
      )
  ), unit_totals as (
    select e.currency_code, e.unit_id,
      sum(case e.direction when 'debit' then e.amount else -e.amount end) balance
    from allowed_entries e
    group by e.currency_code, e.unit_id
  ), totals as (
    select e.currency_code,
      sum(e.amount) filter(where e.direction='debit') debits,
      sum(e.amount) filter(where e.direction='credit') credits
    from allowed_entries e
    group by e.currency_code
  ), allowed_balances as (
    select b.*, public.receivable_aging_date(b.due_date, b.issue_date, i.item_type) as aging_date
    from public.receivable_balances b
    join public.receivable_items i on i.id = b.id
    where b.condominium_id = target
      and (
        public.can_read_board_aggregates(target)
        or public.can_read_financial_unit(b.unit_id)
      )
  ), due as (
    select currency_code,
      sum(outstanding_amount::numeric)
        filter(where aging_date < current_date and status not in ('settled','reversed')) overdue,
      sum(outstanding_amount::numeric)
        filter(where (aging_date is null or aging_date >= current_date)
          and status not in ('settled','reversed')) upcoming
    from allowed_balances
    group by currency_code
  )
  select t.currency_code,
    to_char(coalesce(t.debits,0),'FM999999999999990.00'),
    to_char(coalesce(t.credits,0),'FM999999999999990.00'),
    to_char(coalesce(t.debits,0)-coalesce(t.credits,0),'FM999999999999990.00'),
    count(*) filter(where u.balance>0),
    count(*) filter(where u.balance<0),
    to_char(coalesce(d.overdue,0),'FM999999999999990.00'),
    to_char(coalesce(d.upcoming,0),'FM999999999999990.00')
  from totals t
  left join unit_totals u using(currency_code)
  left join due d using(currency_code)
  group by t.currency_code,t.debits,t.credits,d.overdue,d.upcoming
$$;

create or replace function public.get_receivables_aging(target uuid)
returns table(
  currency_code text,
  current_amount text,
  days_1_30 text,
  days_31_60 text,
  days_61_90 text,
  over_90 text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with visible as (
    select
      b.*,
      public.receivable_aging_date(b.due_date, b.issue_date, i.item_type) as aging_date
    from public.receivable_balances b
    join public.receivable_items i on i.id = b.id
    where b.condominium_id = target
      and b.status not in ('settled','reversed')
      and (
        public.can_read_board_aggregates(target)
        or public.can_read_financial_unit(b.unit_id)
      )
  )
  select v.currency_code,
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where v.aging_date is null or v.aging_date >= current_date),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date between 1 and 30),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date between 31 and 60),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date between 61 and 90),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date > 90),0),
      'FM999999999999990.00')
  from visible v
  group by v.currency_code
$$;

revoke all on function public.get_receivables_summary(uuid), public.get_receivables_aging(uuid) from public;
grant execute on function public.get_receivables_summary(uuid), public.get_receivables_aging(uuid)
  to authenticated, service_role;
