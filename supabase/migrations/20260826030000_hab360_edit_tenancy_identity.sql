-- HAB-360: the condominium and its organization must be correctable.
--
-- `create_condominium_with_profile_v2` captured name, legal identity and address once and nothing
-- could change them afterwards. That is not cosmetic in Venezuela: `legal_id_number` is the RIF
-- that belongs on receipts and solvency certificates, and `name` is the string the deletion flow
-- asks the operator to type before purging a tenant. A typo at onboarding was permanent.
--
-- Topology (`property_topology`) is deliberately not editable here. It is already owned by
-- `remediate_condominium_topology`, which reconciles buildings and units alongside it; changing it
-- from a profile form would leave the structure inconsistent.

create or replace function public.update_condominium_profile(
  target uuid,
  condominium_name text,
  country_code text,
  address_line1 text,
  city text,
  timezone text,
  primary_currency_code text,
  secondary_currency_code text default null,
  legal_name text default null,
  legal_id_type text default null,
  legal_id_number text default null,
  address_line2 text default null,
  state_region text default null,
  municipality text default null,
  parish text default null,
  postal_code text default null
)
returns public.condominiums
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_condominium public.condominiums;
  updated_condominium public.condominiums;
  next_name text := btrim(coalesce(condominium_name, ''));
  next_country text := upper(btrim(coalesce(country_code, '')));
  next_primary text := upper(btrim(coalesce(primary_currency_code, '')));
  next_secondary text := nullif(upper(btrim(coalesce(secondary_currency_code, ''))), '');
  next_timezone text := btrim(coalesce(timezone, ''));
  next_address text := btrim(coalesce(address_line1, ''));
  next_city text := btrim(coalesce(city, ''));
  next_legal_name text := nullif(btrim(coalesce(legal_name, '')), '');
  next_legal_id_type text := nullif(btrim(coalesce(legal_id_type, '')), '');
  next_legal_id_number text := nullif(btrim(coalesce(legal_id_number, '')), '');
  next_address2 text := nullif(btrim(coalesce(address_line2, '')), '');
  next_state text := nullif(btrim(coalesce(state_region, '')), '');
  next_municipality text := nullif(btrim(coalesce(municipality, '')), '');
  next_parish text := nullif(btrim(coalesce(parish, '')), '');
  next_postal text := nullif(btrim(coalesce(postal_code, '')), '');
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target) then
    raise exception 'permission denied';
  end if;

  select * into current_condominium
  from public.condominiums
  where id = target
  for update;

  if current_condominium.id is null then
    raise exception 'condominium unavailable';
  end if;

  if next_name = ''
    or length(next_name) > 120
    or next_country !~ '^[A-Z]{2}$'
    or next_primary !~ '^[A-Z]{3}$'
    or (next_secondary is not null and next_secondary !~ '^[A-Z]{3}$')
    or next_secondary is not distinct from next_primary
    or next_timezone = ''
    or next_address = ''
    or next_city = ''
  then
    raise exception 'invalid condominium profile';
  end if;

  if not exists (select 1 from pg_timezone_names where name = next_timezone) then
    raise exception 'invalid condominium timezone';
  end if;

  -- `unique (organization_id, name)` would otherwise surface as a raw 23505 with a constraint name.
  if exists (
    select 1
    from public.condominiums c
    where c.organization_id = current_condominium.organization_id
      and c.name = next_name
      and c.id <> current_condominium.id
  ) then
    raise exception 'condominium name already exists';
  end if;

  update public.condominiums
  set name = next_name,
      country_code = next_country,
      city = next_city,
      timezone = next_timezone,
      primary_currency_code = next_primary,
      secondary_currency_code = next_secondary,
      legal_name = next_legal_name,
      legal_id_type = next_legal_id_type,
      legal_id_number = next_legal_id_number,
      address_line1 = next_address,
      address_line2 = next_address2,
      state_region = next_state,
      municipality = next_municipality,
      parish = next_parish,
      postal_code = next_postal,
      updated_at = now()
  where id = current_condominium.id
  returning * into updated_condominium;

  return updated_condominium;
end;
$$;

revoke all on function public.update_condominium_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.update_condominium_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- Organizations only carry a name today, so correcting one is a rename.
create or replace function public.rename_organization(target uuid, organization_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  updated_organization public.organizations;
  next_name text := btrim(coalesce(organization_name, ''));
begin
  if auth.uid() is null or not public.is_organization_owner(target) then
    raise exception 'organization owner required';
  end if;

  if next_name = '' or length(next_name) > 120 then
    raise exception 'invalid organization name';
  end if;

  update public.organizations
  set name = next_name,
      updated_at = now()
  where id = target
  returning * into updated_organization;

  if updated_organization.id is null then
    raise exception 'organization unavailable';
  end if;

  return updated_organization;
end;
$$;

revoke all on function public.rename_organization(uuid, text) from public, anon;
grant execute on function public.rename_organization(uuid, text) to authenticated;
