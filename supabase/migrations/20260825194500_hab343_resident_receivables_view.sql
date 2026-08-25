-- HAB-343: fee aggregates must reflect only the financial units the caller is allowed to read.
-- Admin/board aggregate behavior remains unchanged; owner/tenant callers receive aggregates only
-- for units authorized by can_read_financial_unit().

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
    select b.*
    from public.receivable_balances b
    where b.condominium_id = target
      and (
        public.can_read_board_aggregates(target)
        or public.can_read_financial_unit(b.unit_id)
      )
  ), due as (
    select currency_code,
      sum(outstanding_amount::numeric)
        filter(where due_date < current_date and status not in ('settled','reversed')) overdue,
      sum(outstanding_amount::numeric)
        filter(where (due_date is null or due_date >= current_date) and status not in ('settled','reversed')) upcoming
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
set search_path=public
set row_security=off
as $$
  select b.currency_code,
    to_char(coalesce(sum(b.outstanding_amount::numeric)
      filter(where b.due_date is null or b.due_date>=current_date),0),'FM999999999999990.00'),
    to_char(coalesce(sum(b.outstanding_amount::numeric)
      filter(where current_date-b.due_date between 1 and 30),0),'FM999999999999990.00'),
    to_char(coalesce(sum(b.outstanding_amount::numeric)
      filter(where current_date-b.due_date between 31 and 60),0),'FM999999999999990.00'),
    to_char(coalesce(sum(b.outstanding_amount::numeric)
      filter(where current_date-b.due_date between 61 and 90),0),'FM999999999999990.00'),
    to_char(coalesce(sum(b.outstanding_amount::numeric)
      filter(where current_date-b.due_date>90),0),'FM999999999999990.00')
  from public.receivable_balances b
  where b.condominium_id=target
    and b.status not in ('settled','reversed')
    and (
      public.can_read_board_aggregates(target)
      or public.can_read_financial_unit(b.unit_id)
    )
  group by b.currency_code
$$;

-- Charge concept names are metadata, not another tenant's debt. Residents who already belong to
-- the condominium may read the concept catalog so their own authorized receivable rows never show
-- "Concepto no disponible" merely because the catalog itself was hidden.
drop policy if exists concepts_read on public.charge_concepts;
create policy concepts_read on public.charge_concepts
for select
using (
  public.can_read_receivables(condominium_id)
  or exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = charge_concepts.condominium_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner','tenant','board_member')
  )
);

revoke all on function public.get_receivables_summary(uuid), public.get_receivables_aging(uuid) from public;
grant execute on function public.get_receivables_summary(uuid), public.get_receivables_aging(uuid)
  to authenticated, service_role;
