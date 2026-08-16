-- HAB-186 security hardening: financial access follows the same effective-dated
-- relationship semantics as payment submission. Future or expired relationships
-- must never grant access to the unit financial account.

create or replace function public.can_read_financial_unit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_read_receivables(u.condominium_id)
    or exists (
      select 1
      from public.unit_owners o
      join public.people p on p.id = o.person_id
      where o.unit_id = target
        and p.status = 'active'
        and p.auth_user_id = auth.uid()
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    )
    or exists (
      select 1
      from public.unit_occupancies o
      join public.people p on p.id = o.person_id
      where o.unit_id = target
        and p.status = 'active'
        and p.auth_user_id = auth.uid()
        and o.occupancy_type in ('owner_occupant', 'tenant', 'authorized_occupant')
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    )
  from public.units u
  where u.id = target
    and u.status = 'active';
$$;

revoke all on function public.can_read_financial_unit(uuid) from public;
grant execute on function public.can_read_financial_unit(uuid) to authenticated, service_role;
