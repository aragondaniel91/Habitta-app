-- unit_read let anyone with a condominium_memberships row see every unit in the condo. That is
-- correct for staff (condominium_admin, accountant, assistant, payment_reviewer, board_member),
-- who administer the whole building, but wrong for owner/tenant, who should only see the unit(s)
-- they actually own or occupy, mirroring the scoping already applied to receivable_items,
-- receivable_ledger_entries and payments via can_read_financial_unit/can_submit_payment.

create function public.can_read_unit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.units u
    join public.condominium_memberships cm on cm.condominium_id = u.condominium_id
    where u.id = target
      and cm.user_id = auth.uid()
      and cm.role in (
        'condominium_admin', 'accountant', 'assistant', 'payment_reviewer', 'board_member'
      )
  )
  or exists (
    select 1
    from public.units u
    where u.id = target
      and public.is_organization_owner_for_condominium(u.condominium_id)
  )
  or exists (
    select 1
    from public.unit_owners o
    join public.people p on p.id = o.person_id
    where o.unit_id = target
      and p.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.unit_occupancies o
    join public.people p on p.id = o.person_id
    where o.unit_id = target
      and p.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.can_read_unit(uuid) from public;
grant execute on function public.can_read_unit(uuid) to authenticated, service_role;

drop policy unit_read on public.units;

create policy unit_read_v2 on public.units
for select
using (public.can_read_unit(units.id));
