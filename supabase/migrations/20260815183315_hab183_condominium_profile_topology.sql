create type public.condominium_property_topology as enum (
  'unspecified',
  'house_community',
  'single_building',
  'multi_building_complex',
  'mixed'
);

grant usage on type public.condominium_property_topology to authenticated, service_role;

alter table public.condominiums
  add column if not exists legal_name text,
  add column if not exists legal_id_type text,
  add column if not exists legal_id_number text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists state_region text,
  add column if not exists municipality text,
  add column if not exists parish text,
  add column if not exists postal_code text,
  add column if not exists property_topology public.condominium_property_topology not null default 'unspecified',
  add column if not exists declared_unit_count integer,
  add column if not exists declared_building_count integer;

alter table public.condominiums
  add constraint condominiums_legal_id_pair
    check (
      (legal_id_type is null and legal_id_number is null)
      or (
        nullif(trim(legal_id_type), '') is not null
        and nullif(trim(legal_id_number), '') is not null
      )
    ),
  add constraint condominiums_legal_id_type_length
    check (legal_id_type is null or char_length(trim(legal_id_type)) between 1 and 40),
  add constraint condominiums_legal_id_number_length
    check (legal_id_number is null or char_length(trim(legal_id_number)) between 1 and 80),
  add constraint condominiums_address_line1_length
    check (address_line1 is null or char_length(trim(address_line1)) between 1 and 240),
  add constraint condominiums_declared_unit_count_range
    check (declared_unit_count is null or declared_unit_count between 1 and 100000),
  add constraint condominiums_declared_building_count_range
    check (declared_building_count is null or declared_building_count between 1 and 10000),
  add constraint condominiums_property_topology_counts
    check (
      property_topology = 'unspecified'
      or property_topology = 'mixed'
      or (
        property_topology = 'house_community'
        and declared_unit_count is not null
        and declared_building_count is null
      )
      or (
        property_topology = 'single_building'
        and declared_unit_count is not null
        and declared_building_count = 1
      )
      or (
        property_topology = 'multi_building_complex'
        and declared_building_count is not null
        and declared_building_count >= 2
      )
    );

create or replace function public.create_admin_workspace_v2(
  organization_name text,
  organization_type text,
  condominium_name text,
  country_code text,
  address_line1 text,
  city text,
  timezone text,
  primary_currency_code text,
  property_topology public.condominium_property_topology,
  secondary_currency_code text default null,
  legal_name text default null,
  legal_id_type text default null,
  legal_id_number text default null,
  address_line2 text default null,
  state_region text default null,
  municipality text default null,
  parish text default null,
  postal_code text default null,
  declared_unit_count integer default null,
  declared_building_count integer default null,
  first_building_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_organization public.organizations;
  created_condominium public.condominiums;
  created_building public.buildings;
  normalized_secondary_currency text;
  normalized_legal_name text;
  normalized_legal_id_type text;
  normalized_legal_id_number text;
  normalized_building_name text;
  normalized_building_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if exists (
    select 1
    from public.organization_memberships
    where user_id = auth.uid()
  ) then
    raise exception 'user already belongs to an organization';
  end if;

  if trim(organization_name) = '' or trim(condominium_name) = '' then
    raise exception 'organization and condominium names are required';
  end if;

  if organization_type not in ('independent', 'management_company') then
    raise exception 'invalid organization type';
  end if;

  if upper(country_code) !~ '^[A-Z]{2}$' then
    raise exception 'invalid country code';
  end if;

  if trim(address_line1) = '' or trim(city) = '' or trim(timezone) = '' then
    raise exception 'address, city and timezone are required';
  end if;

  if upper(primary_currency_code) !~ '^[A-Z]{3}$' then
    raise exception 'invalid primary currency';
  end if;

  if property_topology = 'unspecified' then
    raise exception 'property topology is required';
  end if;

  normalized_secondary_currency := nullif(upper(trim(coalesce(secondary_currency_code, ''))), '');
  if normalized_secondary_currency is not null
    and normalized_secondary_currency !~ '^[A-Z]{3}$'
  then
    raise exception 'invalid secondary currency';
  end if;

  if normalized_secondary_currency = upper(primary_currency_code) then
    raise exception 'currencies must be different';
  end if;

  normalized_legal_name := nullif(trim(coalesce(legal_name, '')), '');
  normalized_legal_id_type := nullif(upper(trim(coalesce(legal_id_type, ''))), '');
  normalized_legal_id_number := nullif(upper(trim(coalesce(legal_id_number, ''))), '');

  if (normalized_legal_id_type is null) <> (normalized_legal_id_number is null) then
    raise exception 'legal id type and number must be provided together';
  end if;

  if declared_unit_count is not null and declared_unit_count not between 1 and 100000 then
    raise exception 'invalid declared unit count';
  end if;

  if declared_building_count is not null and declared_building_count not between 1 and 10000 then
    raise exception 'invalid declared building count';
  end if;

  normalized_building_count := declared_building_count;
  normalized_building_name := nullif(trim(coalesce(first_building_name, '')), '');

  case property_topology
    when 'house_community' then
      if declared_unit_count is null then
        raise exception 'house community unit count is required';
      end if;
      if declared_building_count is not null or normalized_building_name is not null then
        raise exception 'house community must not declare a building';
      end if;
    when 'single_building' then
      if declared_unit_count is null then
        raise exception 'single building unit count is required';
      end if;
      if declared_building_count is not null and declared_building_count <> 1 then
        raise exception 'single building topology must have one building';
      end if;
      normalized_building_count := 1;
      normalized_building_name := coalesce(normalized_building_name, trim(condominium_name));
    when 'multi_building_complex' then
      if declared_building_count is null or declared_building_count < 2 then
        raise exception 'multi building complex requires at least two buildings';
      end if;
    when 'mixed' then
      null;
    else
      raise exception 'invalid property topology';
  end case;

  insert into public.organizations (name, organization_type, created_by)
  values (trim(organization_name), organization_type, auth.uid())
  returning * into created_organization;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (created_organization.id, auth.uid(), 'organization_owner');

  insert into public.condominiums (
    organization_id,
    name,
    legal_name,
    legal_id_type,
    legal_id_number,
    country_code,
    address_line1,
    address_line2,
    state_region,
    municipality,
    parish,
    city,
    postal_code,
    timezone,
    primary_currency_code,
    secondary_currency_code,
    property_topology,
    declared_unit_count,
    declared_building_count,
    approximate_units,
    onboarding_completed_at,
    created_by
  )
  values (
    created_organization.id,
    trim(condominium_name),
    normalized_legal_name,
    normalized_legal_id_type,
    normalized_legal_id_number,
    upper(country_code),
    trim(address_line1),
    nullif(trim(coalesce(address_line2, '')), ''),
    nullif(trim(coalesce(state_region, '')), ''),
    nullif(trim(coalesce(municipality, '')), ''),
    nullif(trim(coalesce(parish, '')), ''),
    trim(city),
    nullif(trim(coalesce(postal_code, '')), ''),
    trim(timezone),
    upper(primary_currency_code),
    normalized_secondary_currency,
    property_topology,
    declared_unit_count,
    normalized_building_count,
    declared_unit_count,
    now(),
    auth.uid()
  )
  returning * into created_condominium;

  insert into public.condominium_memberships (condominium_id, user_id, role)
  values (created_condominium.id, auth.uid(), 'condominium_admin');

  if normalized_building_name is not null then
    insert into public.buildings (condominium_id, name, created_by)
    values (created_condominium.id, normalized_building_name, auth.uid())
    returning * into created_building;
  end if;

  return jsonb_build_object(
    'organization', to_jsonb(created_organization),
    'condominium', to_jsonb(created_condominium),
    'building', case when created_building.id is null then null else to_jsonb(created_building) end,
    'roles', jsonb_build_array('organization_owner', 'condominium_admin')
  );
end;
$$;

revoke all on function public.create_admin_workspace_v2(
  text, text, text, text, text, text, text, text,
  public.condominium_property_topology,
  text, text, text, text, text, text, text, text, text, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.create_admin_workspace_v2(
  text, text, text, text, text, text, text, text,
  public.condominium_property_topology,
  text, text, text, text, text, text, text, text, text, integer, integer, text
) to authenticated;

create or replace function public.create_condominium_with_profile_v2(
  target_organization_id uuid,
  condominium_name text,
  country_code text,
  address_line1 text,
  city text,
  timezone text,
  primary_currency_code text,
  property_topology public.condominium_property_topology,
  secondary_currency_code text default null,
  legal_name text default null,
  legal_id_type text default null,
  legal_id_number text default null,
  address_line2 text default null,
  state_region text default null,
  municipality text default null,
  parish text default null,
  postal_code text default null,
  declared_unit_count integer default null,
  declared_building_count integer default null,
  first_building_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_condominium public.condominiums;
  created_building public.buildings;
  normalized_secondary_currency text;
  normalized_legal_name text;
  normalized_legal_id_type text;
  normalized_legal_id_number text;
  normalized_building_name text;
  normalized_building_count integer;
begin
  if auth.uid() is null or not public.is_organization_owner(target_organization_id) then
    raise exception 'organization owner required';
  end if;

  if trim(condominium_name) = '' or trim(address_line1) = '' or trim(city) = '' or trim(timezone) = '' then
    raise exception 'required condominium information is missing';
  end if;

  if upper(country_code) !~ '^[A-Z]{2}$' or upper(primary_currency_code) !~ '^[A-Z]{3}$' then
    raise exception 'invalid country or currency code';
  end if;

  if property_topology = 'unspecified' then
    raise exception 'property topology is required';
  end if;

  normalized_secondary_currency := nullif(upper(trim(coalesce(secondary_currency_code, ''))), '');
  if normalized_secondary_currency is not null
    and normalized_secondary_currency !~ '^[A-Z]{3}$'
  then
    raise exception 'invalid secondary currency';
  end if;

  if normalized_secondary_currency = upper(primary_currency_code) then
    raise exception 'currencies must be different';
  end if;

  normalized_legal_name := nullif(trim(coalesce(legal_name, '')), '');
  normalized_legal_id_type := nullif(upper(trim(coalesce(legal_id_type, ''))), '');
  normalized_legal_id_number := nullif(upper(trim(coalesce(legal_id_number, ''))), '');

  if (normalized_legal_id_type is null) <> (normalized_legal_id_number is null) then
    raise exception 'legal id type and number must be provided together';
  end if;

  if declared_unit_count is not null and declared_unit_count not between 1 and 100000 then
    raise exception 'invalid declared unit count';
  end if;

  if declared_building_count is not null and declared_building_count not between 1 and 10000 then
    raise exception 'invalid declared building count';
  end if;

  normalized_building_count := declared_building_count;
  normalized_building_name := nullif(trim(coalesce(first_building_name, '')), '');

  case property_topology
    when 'house_community' then
      if declared_unit_count is null then
        raise exception 'house community unit count is required';
      end if;
      if declared_building_count is not null or normalized_building_name is not null then
        raise exception 'house community must not declare a building';
      end if;
    when 'single_building' then
      if declared_unit_count is null then
        raise exception 'single building unit count is required';
      end if;
      if declared_building_count is not null and declared_building_count <> 1 then
        raise exception 'single building topology must have one building';
      end if;
      normalized_building_count := 1;
      normalized_building_name := coalesce(normalized_building_name, trim(condominium_name));
    when 'multi_building_complex' then
      if declared_building_count is null or declared_building_count < 2 then
        raise exception 'multi building complex requires at least two buildings';
      end if;
    when 'mixed' then
      null;
    else
      raise exception 'invalid property topology';
  end case;

  insert into public.condominiums (
    organization_id,
    name,
    legal_name,
    legal_id_type,
    legal_id_number,
    country_code,
    address_line1,
    address_line2,
    state_region,
    municipality,
    parish,
    city,
    postal_code,
    timezone,
    primary_currency_code,
    secondary_currency_code,
    property_topology,
    declared_unit_count,
    declared_building_count,
    approximate_units,
    onboarding_completed_at,
    created_by
  )
  values (
    target_organization_id,
    trim(condominium_name),
    normalized_legal_name,
    normalized_legal_id_type,
    normalized_legal_id_number,
    upper(country_code),
    trim(address_line1),
    nullif(trim(coalesce(address_line2, '')), ''),
    nullif(trim(coalesce(state_region, '')), ''),
    nullif(trim(coalesce(municipality, '')), ''),
    nullif(trim(coalesce(parish, '')), ''),
    trim(city),
    nullif(trim(coalesce(postal_code, '')), ''),
    trim(timezone),
    upper(primary_currency_code),
    normalized_secondary_currency,
    property_topology,
    declared_unit_count,
    normalized_building_count,
    declared_unit_count,
    now(),
    auth.uid()
  )
  returning * into created_condominium;

  insert into public.condominium_memberships (condominium_id, user_id, role)
  values (created_condominium.id, auth.uid(), 'condominium_admin');

  if normalized_building_name is not null then
    insert into public.buildings (condominium_id, name, created_by)
    values (created_condominium.id, normalized_building_name, auth.uid())
    returning * into created_building;
  end if;

  return jsonb_build_object(
    'condominium', to_jsonb(created_condominium),
    'building', case when created_building.id is null then null else to_jsonb(created_building) end,
    'role', 'condominium_admin'
  );
end;
$$;

revoke all on function public.create_condominium_with_profile_v2(
  uuid, text, text, text, text, text, text,
  public.condominium_property_topology,
  text, text, text, text, text, text, text, text, text, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.create_condominium_with_profile_v2(
  uuid, text, text, text, text, text, text,
  public.condominium_property_topology,
  text, text, text, text, text, text, text, text, text, integer, integer, text
) to authenticated;
