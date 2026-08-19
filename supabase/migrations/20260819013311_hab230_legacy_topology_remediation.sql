create or replace function public.remediate_condominium_topology(
  target uuid,
  requested_topology public.condominium_property_topology,
  requested_unit_count integer default null,
  requested_building_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_condominium public.condominiums;
  existing_unit_count integer;
  existing_building_count integer;
  normalized_unit_count integer := requested_unit_count;
  normalized_building_count integer := requested_building_count;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text || ':topology-remediation', 0));

  select * into target_condominium
  from public.condominiums c
  where c.id = target
  for update;

  if not found then
    raise exception 'condominium not found' using errcode = '42501';
  end if;
  if target_condominium.property_topology <> 'unspecified' then
    raise exception 'property topology already resolved';
  end if;
  if requested_topology = 'unspecified' then
    raise exception 'invalid property topology';
  end if;

  select count(*) into existing_unit_count from public.units u where u.condominium_id = target;
  select count(*) into existing_building_count from public.buildings b where b.condominium_id = target;

  if requested_unit_count is not null and requested_unit_count not between 1 and 100000 then
    raise exception 'invalid declared unit count';
  end if;
  if requested_building_count is not null and requested_building_count not between 1 and 10000 then
    raise exception 'invalid declared building count';
  end if;

  case requested_topology
    when 'house_community' then
      if requested_unit_count is null or requested_building_count is not null then
        raise exception 'house community requires a unit count and no building count';
      end if;
      if requested_unit_count < existing_unit_count
        or existing_building_count > 0
        or exists (select 1 from public.units u where u.condominium_id = target and (u.building_id is not null or u.type = 'apartment'))
      then raise exception 'existing structure is incompatible with house community'; end if;
      normalized_building_count := null;
    when 'single_building' then
      if requested_unit_count is null then raise exception 'single building requires a unit count'; end if;
      if requested_building_count is not null and requested_building_count <> 1 then raise exception 'single building requires one declared building'; end if;
      if requested_unit_count < existing_unit_count or existing_building_count > 1
        or exists (select 1 from public.units u where u.condominium_id = target and u.type = 'house')
      then raise exception 'existing structure is incompatible with single building'; end if;
      normalized_building_count := 1;
    when 'multi_building_complex' then
      if requested_building_count is null or requested_building_count < 2 then raise exception 'multi building complex requires at least two declared buildings'; end if;
      if requested_building_count < existing_building_count
        or exists (select 1 from public.units u where u.condominium_id = target and u.type = 'house')
      then raise exception 'existing structure is incompatible with multi building complex'; end if;
    when 'mixed' then
      if (requested_unit_count is not null and requested_unit_count < existing_unit_count)
        or (requested_building_count is not null and requested_building_count < existing_building_count)
      then raise exception 'declared structure cannot be smaller than existing structure'; end if;
    else raise exception 'invalid property topology';
  end case;

  update public.condominiums c
  set property_topology = requested_topology,
      declared_unit_count = normalized_unit_count,
      declared_building_count = normalized_building_count
  where c.id = target
  returning * into target_condominium;

  return jsonb_build_object('condominium', to_jsonb(target_condominium), 'existingUnitCount', existing_unit_count, 'existingBuildingCount', existing_building_count);
end;
$$;

revoke all on function public.remediate_condominium_topology(uuid, public.condominium_property_topology, integer, integer) from public, anon;
grant execute on function public.remediate_condominium_topology(uuid, public.condominium_property_topology, integer, integer) to authenticated;
