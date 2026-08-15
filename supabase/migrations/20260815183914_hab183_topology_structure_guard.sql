create function public.assert_building_matches_condominium_topology()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  topology public.condominium_property_topology;
  other_buildings integer;
begin
  select c.property_topology
  into topology
  from public.condominiums c
  where c.id = new.condominium_id;

  if topology is null then
    raise exception 'condominium not found';
  end if;

  if topology = 'house_community' then
    raise exception 'house community cannot contain buildings';
  end if;

  if topology = 'single_building' then
    select count(*)
    into other_buildings
    from public.buildings b
    where b.condominium_id = new.condominium_id
      and b.id <> new.id;

    if other_buildings > 0 then
      raise exception 'single building condominium cannot contain more than one building';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.assert_building_matches_condominium_topology() from public, anon, authenticated;

create trigger buildings_match_condominium_topology
before insert or update of condominium_id on public.buildings
for each row execute function public.assert_building_matches_condominium_topology();

create function public.assert_condominium_topology_matches_buildings()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_buildings integer;
begin
  if new.property_topology not in ('house_community', 'single_building') then
    return new;
  end if;

  select count(*)
  into current_buildings
  from public.buildings b
  where b.condominium_id = new.id;

  if new.property_topology = 'house_community' and current_buildings > 0 then
    raise exception 'house community cannot contain buildings';
  end if;

  if new.property_topology = 'single_building' and current_buildings > 1 then
    raise exception 'single building condominium cannot contain more than one building';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_condominium_topology_matches_buildings() from public, anon, authenticated;

create trigger condominiums_topology_matches_buildings
before update of property_topology on public.condominiums
for each row execute function public.assert_condominium_topology_matches_buildings();

create function public.assert_unit_building_same_condominium()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.building_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.buildings b
    where b.id = new.building_id
      and b.condominium_id = new.condominium_id
  ) then
    raise exception 'unit and building must share condominium';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_unit_building_same_condominium() from public, anon, authenticated;

create trigger units_building_tenant_guard
before insert or update of building_id, condominium_id on public.units
for each row execute function public.assert_unit_building_same_condominium();
