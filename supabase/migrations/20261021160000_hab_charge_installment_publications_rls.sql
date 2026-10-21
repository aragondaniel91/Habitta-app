-- HAB-DR-2026-10-21: RLS defense in depth for a private idempotency result table.
-- The table is read/written solely by the permission-checked SECURITY DEFINER
-- post_charge_installment_plans RPC. Direct tenant access remains revoked.
-- RLS on the table does not change the owner's SECURITY DEFINER operations.
begin;
alter table public.charge_installment_plan_publications enable row level security;
revoke all on public.charge_installment_plan_publications from public, anon, authenticated;
commit;
