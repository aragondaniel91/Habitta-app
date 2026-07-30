alter table public.organizations
  add column if not exists organization_type text not null default 'independent'
    check (organization_type in ('independent', 'management_company'));

alter table public.condominiums
  add column if not exists country_code text,
  add column if not exists city text,
  add column if not exists timezone text,
  add column if not exists primary_currency_code text,
  add column if not exists secondary_currency_code text,
  add column if not exists approximate_units integer,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.condominiums
  drop constraint if exists condominiums_country_code_format,
  add constraint condominiums_country_code_format
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  drop constraint if exists condominiums_primary_currency_format,
  add constraint condominiums_primary_currency_format
    check (primary_currency_code is null or primary_currency_code ~ '^[A-Z]{3}$'),
  drop constraint if exists condominiums_secondary_currency_format,
  add constraint condominiums_secondary_currency_format
    check (secondary_currency_code is null or secondary_currency_code ~ '^[A-Z]{3}$'),
  drop constraint if exists condominiums_currency_difference,
  add constraint condominiums_currency_difference
    check (secondary_currency_code is null or secondary_currency_code <> primary_currency_code),
  drop constraint if exists condominiums_approximate_units_range,
  add constraint condominiums_approximate_units_range
    check (approximate_units is null or approximate_units between 1 and 100000);

create or replace function public.create_admin_workspace(
  organization_name text,
  organization_type text,
  condominium_name text,
  country_code text,
  city text,
  timezone text,
  primary_currency_code text,
  secondary_currency_code text default null,
  approximate_units integer default null,
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

  if upper(primary_currency_code) !~ '^[A-Z]{3}$' then
    raise exception 'invalid primary currency';
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

  if trim(city) = '' or trim(timezone) = '' then
    raise exception 'city and timezone are required';
  end if;

  if approximate_units is not null and approximate_units not between 1 and 100000 then
    raise exception 'invalid approximate unit count';
  end if;

  insert into public.organizations (name, organization_type, created_by)
  values (trim(organization_name), organization_type, auth.uid())
  returning * into created_organization;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (created_organization.id, auth.uid(), 'organization_owner');

  insert into public.condominiums (
    organization_id,
    name,
    country_code,
    city,
    timezone,
    primary_currency_code,
    secondary_currency_code,
    approximate_units,
    onboarding_completed_at,
    created_by
  )
  values (
    created_organization.id,
    trim(condominium_name),
    upper(country_code),
    trim(city),
    trim(timezone),
    upper(primary_currency_code),
    normalized_secondary_currency,
    approximate_units,
    now(),
    auth.uid()
  )
  returning * into created_condominium;

  insert into public.condominium_memberships (condominium_id, user_id, role)
  values (created_condominium.id, auth.uid(), 'condominium_admin');

  if nullif(trim(coalesce(first_building_name, '')), '') is not null then
    insert into public.buildings (condominium_id, name, created_by)
    values (created_condominium.id, trim(first_building_name), auth.uid())
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

revoke execute on function public.create_admin_workspace(text, text, text, text, text, text, text, text, integer, text) from public;
grant execute on function public.create_admin_workspace(text, text, text, text, text, text, text, text, integer, text) to authenticated;

create or replace function public.create_condominium_with_profile(
  target_organization_id uuid,
  condominium_name text,
  country_code text,
  city text,
  timezone text,
  primary_currency_code text,
  secondary_currency_code text default null,
  approximate_units integer default null,
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
begin
  if auth.uid() is null or not public.is_organization_owner(target_organization_id) then
    raise exception 'organization owner required';
  end if;

  if trim(condominium_name) = '' or trim(city) = '' or trim(timezone) = '' then
    raise exception 'required condominium information is missing';
  end if;

  if upper(country_code) !~ '^[A-Z]{2}$' or upper(primary_currency_code) !~ '^[A-Z]{3}$' then
    raise exception 'invalid country or currency code';
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

  if approximate_units is not null and approximate_units not between 1 and 100000 then
    raise exception 'invalid approximate unit count';
  end if;

  insert into public.condominiums (
    organization_id,
    name,
    country_code,
    city,
    timezone,
    primary_currency_code,
    secondary_currency_code,
    approximate_units,
    onboarding_completed_at,
    created_by
  )
  values (
    target_organization_id,
    trim(condominium_name),
    upper(country_code),
    trim(city),
    trim(timezone),
    upper(primary_currency_code),
    normalized_secondary_currency,
    approximate_units,
    now(),
    auth.uid()
  )
  returning * into created_condominium;

  insert into public.condominium_memberships (condominium_id, user_id, role)
  values (created_condominium.id, auth.uid(), 'condominium_admin');

  if nullif(trim(coalesce(first_building_name, '')), '') is not null then
    insert into public.buildings (condominium_id, name, created_by)
    values (created_condominium.id, trim(first_building_name), auth.uid())
    returning * into created_building;
  end if;

  return jsonb_build_object(
    'condominium', to_jsonb(created_condominium),
    'building', case when created_building.id is null then null else to_jsonb(created_building) end,
    'role', 'condominium_admin'
  );
end;
$$;

revoke execute on function public.create_condominium_with_profile(uuid, text, text, text, text, text, text, integer, text) from public;
grant execute on function public.create_condominium_with_profile(uuid, text, text, text, text, text, text, integer, text) to authenticated;
