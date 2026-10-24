-- HAB-PILOT-004 C1: authenticated, scoped selection of the condominium's
-- charge target BEFORE any billable units exist. Existing installations
-- retain the default unit scope. This does not generate charges or units.
create or replace function public.set_condominium_charge_scope(
  target uuid,
  requested_scope public.condominium_charge_scope
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  current_condominium public.condominiums;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target) then
    raise exception using errcode = '42501',
      message = 'condominium structure administrator required';
  end if;

  -- Serialize against unit creation (which holds FOR SHARE on the same row).
  select c.* into current_condominium
  from public.condominiums c
  where c.id = target
  for update;

  if not found then
    raise exception using errcode = '42501',
      message = 'condominium structure administrator required';
  end if;

  if requested_scope is null then
    raise exception using errcode = '22023',
      message = 'charge scope is required';
  end if;

  if requested_scope = 'building'
    and current_condominium.property_topology <> 'multi_building_complex' then
    raise exception using errcode = '22023',
      message = 'whole-building billing requires a multi-building condominium';
  end if;

  -- Idempotent reads are safe even once the configured scope has units.
  -- Changing the scope of any already configured unit or its ledger is not.
  if requested_scope is distinct from current_condominium.charge_scope then
    if exists (
      select 1 from public.units u where u.condominium_id = target
    ) then
      raise exception using errcode = '23514',
        message = 'charge scope cannot change after units exist';
    end if;

    update public.condominiums
    set charge_scope = requested_scope
    where id = target
    returning * into current_condominium;
  end if;

  return jsonb_build_object(
    'condominium_id', current_condominium.id,
    'property_topology', current_condominium.property_topology,
    'charge_scope', current_condominium.charge_scope
  );
end;
$$;

-- Explicit GRANT, least privilege, role isolation and no anonymous RPC.
revoke all on function public.set_condominium_charge_scope(
  uuid, public.condominium_charge_scope
) from public, anon, authenticated;

grant execute on function public.set_condominium_charge_scope(
  uuid, public.condominium_charge_scope
) to authenticated, service_role;
