-- HAB-519 (pilot point #30): the collections workspace needs to surface authorized credit --
-- money a unit already has available, recorded via `payment_credit`/`reversal` ledger entries
-- with no `receivable_item_id` -- without an admin first knowing which unit to open the account
-- statement for. Today that balance only becomes visible one unit at a time, inside
-- `get_unit_statement`. This adds the condominium-wide aggregate the collections list needs,
-- built on the same ledger rows but restricted to can_read_financial_unit.
-- Board aggregate permissions must never reveal per-unit credit details.
--
-- A reversed payment's remainder nets to zero automatically: the reversal entry shares the same
-- unit, currency and null `receivable_item_id` as the credit it offsets, so summing signed
-- amounts for that group is exactly the available balance, not a running total of history.
create or replace function public.get_unit_credit_balances(target uuid)
returns table(
  unit_id uuid,
  currency_code text,
  credit_balance text,
  credit_entry_count bigint,
  oldest_credit_date date,
  latest_credit_date date
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select e.unit_id,
    e.currency_code,
    to_char(sum(case e.direction when 'credit' then e.amount else -e.amount end),'FM999999999999990.00'),
    count(*) filter(where e.direction = 'credit'),
    min(e.effective_date) filter (where e.direction = 'credit'),
    max(e.effective_date) filter (where e.direction = 'credit')
  from public.receivable_ledger_entries e
  where e.condominium_id = target
    and e.receivable_item_id is null
    and public.can_read_financial_unit(e.unit_id)
  group by e.unit_id, e.currency_code
  having sum(case e.direction when 'credit' then e.amount else -e.amount end) > 0
$$;

comment on function public.get_unit_credit_balances(uuid) is
  'Authorized credit available per unit and currency: payment overpayments and other unapplied credits, net of their reversals. Authorized only per-unit with can_read_financial_unit; board aggregate access is insufficient.';

revoke all on function public.get_unit_credit_balances(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_unit_credit_balances(uuid) to authenticated, service_role;
