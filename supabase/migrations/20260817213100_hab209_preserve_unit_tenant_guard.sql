create or replace function public.assert_unit_matches_condominium_topology()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  topology public.condominium_property_topology;
  configured_building_id uuid;
  configured_buildings integer;
begin
  if new.building_id is not null and not exists (
    select 1
    from public.buildings b
    where b.id = new.building_id
      and b.condominium_id = new.condominium_id
  ) then
    raise exception 'unit and building must share condominium';
  end if;

  select c.property_topology
  into topology
  from public.condominiums c
  where c.id = new.condominium_id;

  if topology is null then
    raise exception 'condominium not found';
  end if;

  if topology = 'house_community' then
    if new.building_id is not null then
      raise exception 'house community unit cannot reference a building';
    end if;
    if new.type = 'apartment' then
      raise exception 'apartment unit is incompatible with house community topology';
    end if;
    return new;
  end if;

  if topology = 'single_building' then
    if new.type = 'house' then
      raise exception 'house unit is incompatible with single building topology';
    end if;

    select count(*)
    into configured_buildings
    from public.buildings b
    where b.condominium_id = new.condominium_id;

    if configured_buildings <> 1 then
      raise exception 'single building condominium must have exactly one configured building';
    end if;

    select b.id
    into configured_building_id
    from public.buildings b
    where b.condominium_id = new.condominium_id
    limit 1;

    if new.building_id is null then
      new.building_id := configured_building_id;
    elsif new.building_id <> configured_building_id then
      raise exception 'unit must reference the configured single building';
    end if;

    return new;
  end if;

  if topology = 'multi_building_complex' and new.type = 'house' then
    raise exception 'house unit is incompatible with multi building topology';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_unit_matches_condominium_topology() from public, anon, authenticated;
