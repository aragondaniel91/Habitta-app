alter table public.units
  drop constraint if exists units_condominium_id_code_key;

create unique index if not exists units_building_code_unique
  on public.units (condominium_id, building_id, code)
  where building_id is not null;

create unique index if not exists units_unassigned_code_unique
  on public.units (condominium_id, code)
  where building_id is null;

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

drop trigger if exists hab209_units_match_topology on public.units;
create trigger hab209_units_match_topology
before insert or update of condominium_id, building_id, type on public.units
for each row execute function public.assert_unit_matches_condominium_topology();

create or replace function public.preview_structure_import(target uuid, rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  row_data jsonb;
  row_number integer := 1;
  valid_rows jsonb := '[]'::jsonb;
  error_rows jsonb := '[]'::jsonb;
  issue text;
  building_name_value text;
  unit_code_value text;
  unit_type_value text;
  floor_value text;
  ownership_text text;
  ownership_value numeric;
  status_value text;
  target_topology public.condominium_property_topology;
  configured_buildings integer;
  configured_building_id uuid;
  configured_building_name text;
  resolved_building_id uuid;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target) then
    raise exception 'permission denied';
  end if;

  select c.property_topology
  into target_topology
  from public.condominiums c
  where c.id = target;

  if target_topology is null then
    raise exception 'condominium not found';
  end if;

  if target_topology = 'single_building' then
    select count(*)
    into configured_buildings
    from public.buildings b
    where b.condominium_id = target;

    if configured_buildings <> 1 then
      raise exception 'single building condominium must have exactly one configured building';
    end if;

    select b.id, b.name
    into configured_building_id, configured_building_name
    from public.buildings b
    where b.condominium_id = target
    limit 1;
  end if;

  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'rows must be a non-empty JSON array';
  end if;

  for row_data in
    select value
    from jsonb_array_elements(rows) as import_rows(value)
  loop
    row_number := row_number + 1;
    issue := null;
    resolved_building_id := null;
    building_name_value := btrim(coalesce(row_data ->> 'building_name', ''));
    unit_code_value := btrim(coalesce(row_data ->> 'unit_code', ''));
    unit_type_value := lower(btrim(coalesce(row_data ->> 'unit_type', '')));
    floor_value := btrim(coalesce(row_data ->> 'floor', ''));
    ownership_text := btrim(coalesce(row_data ->> 'ownership_percentage', ''));
    status_value := lower(btrim(coalesce(row_data ->> 'status', 'active')));
    ownership_value := null;

    if unit_code_value = '' then
      issue := 'unit_code is required';
    elsif length(unit_code_value) > 40 then
      issue := 'unit_code exceeds 40 characters';
    elsif unit_type_value not in ('apartment', 'house', 'commercial', 'parking', 'storage') then
      issue := 'invalid unit_type';
    elsif status_value not in ('active', 'inactive') then
      issue := 'invalid status';
    elsif length(building_name_value) > 120 then
      issue := 'building_name exceeds 120 characters';
    elsif length(floor_value) > 20 then
      issue := 'floor exceeds 20 characters';
    elsif target_topology = 'house_community' and building_name_value <> '' then
      issue := 'house community units cannot reference a building';
    elsif target_topology = 'house_community' and unit_type_value = 'apartment' then
      issue := 'apartment is incompatible with house community topology';
    elsif target_topology = 'single_building' and unit_type_value = 'house' then
      issue := 'house is incompatible with single building topology';
    elsif target_topology = 'multi_building_complex' and unit_type_value = 'house' then
      issue := 'house is incompatible with multi building topology';
    elsif target_topology = 'single_building'
      and building_name_value <> ''
      and lower(building_name_value) <> lower(configured_building_name)
    then
      issue := 'unit must use the configured single building';
    elsif ownership_text <> '' then
      if ownership_text !~ '^(100([.]0+)?|([0-9]|[1-9][0-9])([.][0-9]+)?)$' then
        issue := 'invalid ownership_percentage';
      else
        ownership_value := ownership_text::numeric;
        if ownership_value <= 0 or ownership_value > 100 then
          issue := 'ownership_percentage must be greater than 0 and at most 100';
        end if;
      end if;
    end if;

    if issue is null then
      if target_topology = 'single_building' then
        resolved_building_id := configured_building_id;
      elsif building_name_value <> '' then
        select b.id
        into resolved_building_id
        from public.buildings b
        where b.condominium_id = target
          and lower(b.name) = lower(building_name_value)
        limit 1;
      end if;
    end if;

    if issue is null and exists (
      select 1
      from public.units u
      where u.condominium_id = target
        and lower(u.code) = lower(unit_code_value)
        and (
          (resolved_building_id is not null and u.building_id = resolved_building_id)
          or (
            resolved_building_id is null
            and building_name_value = ''
            and u.building_id is null
          )
        )
    ) then
      issue := 'unit already exists in this building or location';
    end if;

    if issue is null and (
      select count(*)
      from jsonb_array_elements(rows) duplicate_row
      where lower(btrim(coalesce(duplicate_row ->> 'unit_code', ''))) = lower(unit_code_value)
        and (
          target_topology in ('single_building', 'house_community')
          or lower(btrim(coalesce(duplicate_row ->> 'building_name', ''))) = lower(building_name_value)
        )
    ) > 1 then
      issue := 'unit_code is duplicated in the same building or location';
    end if;

    if issue is null then
      valid_rows := valid_rows || jsonb_build_array(
        jsonb_build_object('row', row_number, 'data', row_data)
      );
    else
      error_rows := error_rows || jsonb_build_array(
        jsonb_build_object('row', row_number, 'error', issue)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'valid', valid_rows,
    'errors', error_rows,
    'valid_count', jsonb_array_length(valid_rows),
    'error_count', jsonb_array_length(error_rows)
  );
end;
$$;

create or replace function public.import_structure_csv(
  target uuid,
  rows jsonb,
  key text,
  import_filename text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  existing_result jsonb;
  preview_result jsonb;
  row_data jsonb;
  building_row public.buildings;
  building_name_value text;
  unit_code_value text;
  unit_type_value text;
  floor_value text;
  ownership_text text;
  ownership_value numeric;
  status_value text;
  created_units integer := 0;
  created_buildings integer := 0;
  result_payload jsonb;
  target_topology public.condominium_property_topology;
  configured_buildings integer;
  configured_building_id uuid;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target) then
    raise exception 'permission denied';
  end if;

  if nullif(btrim(key), '') is null then
    raise exception 'idempotency key is required';
  end if;

  select c.property_topology
  into target_topology
  from public.condominiums c
  where c.id = target;

  if target_topology is null then
    raise exception 'condominium not found';
  end if;

  if target_topology = 'single_building' then
    select count(*)
    into configured_buildings
    from public.buildings b
    where b.condominium_id = target;

    if configured_buildings <> 1 then
      raise exception 'single building condominium must have exactly one configured building';
    end if;

    select b.id
    into configured_building_id
    from public.buildings b
    where b.condominium_id = target
    limit 1;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target::text || ':structure-import', 0));

  select si.result
  into existing_result
  from public.structure_imports si
  where si.condominium_id = target
    and si.idempotency_key = key;

  if found then
    return existing_result;
  end if;

  preview_result := public.preview_structure_import(target, rows);
  if jsonb_array_length(preview_result -> 'errors') > 0 then
    raise exception 'structure import contains invalid rows';
  end if;

  for row_data in
    select value
    from jsonb_array_elements(rows) as import_rows(value)
  loop
    building_name_value := btrim(coalesce(row_data ->> 'building_name', ''));
    unit_code_value := btrim(row_data ->> 'unit_code');
    unit_type_value := lower(btrim(row_data ->> 'unit_type'));
    floor_value := nullif(btrim(coalesce(row_data ->> 'floor', '')), '');
    ownership_text := nullif(btrim(coalesce(row_data ->> 'ownership_percentage', '')), '');
    status_value := lower(btrim(coalesce(row_data ->> 'status', 'active')));
    ownership_value := case when ownership_text is null then null else ownership_text::numeric end;
    building_row := null;

    if target_topology = 'single_building' then
      select b.*
      into building_row
      from public.buildings b
      where b.id = configured_building_id;
    elsif building_name_value <> '' then
      select b.*
      into building_row
      from public.buildings b
      where b.condominium_id = target
        and lower(b.name) = lower(building_name_value)
      limit 1;

      if building_row.id is null then
        insert into public.buildings (condominium_id, name, created_by)
        values (target, building_name_value, auth.uid())
        returning * into building_row;
        created_buildings := created_buildings + 1;
      end if;
    end if;

    insert into public.units (
      condominium_id,
      building_id,
      code,
      type,
      floor,
      ownership_percentage,
      status,
      created_by
    )
    values (
      target,
      building_row.id,
      unit_code_value,
      unit_type_value::public.unit_type,
      floor_value,
      ownership_value,
      status_value::public.unit_status,
      auth.uid()
    );

    created_units := created_units + 1;
  end loop;

  result_payload := jsonb_build_object(
    'created', created_units,
    'created_buildings', created_buildings,
    'reused', 0,
    'rejected', 0
  );

  insert into public.structure_imports (
    condominium_id,
    idempotency_key,
    filename,
    result,
    created_by
  )
  values (
    target,
    key,
    nullif(btrim(import_filename), ''),
    result_payload,
    auth.uid()
  );

  return result_payload;
end;
$$;

revoke all on function public.preview_structure_import(uuid, jsonb) from public, anon;
revoke all on function public.import_structure_csv(uuid, jsonb, text, text) from public, anon;
grant execute on function public.preview_structure_import(uuid, jsonb) to authenticated;
grant execute on function public.import_structure_csv(uuid, jsonb, text, text) to authenticated;
