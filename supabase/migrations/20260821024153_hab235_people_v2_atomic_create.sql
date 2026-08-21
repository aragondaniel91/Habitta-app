create or replace function public.create_person_with_initial_context(
  target_condominium uuid,
  target_first_name text,
  target_last_name text,
  target_document_type text,
  target_document_number text,
  target_email text,
  target_phone text,
  target_status public.person_status,
  target_relationship text default 'none',
  target_unit uuid default null,
  target_ownership_percentage numeric default null,
  target_starts_at date default null,
  target_relationship_title text default null,
  target_financial_role text default null,
  target_general_recipient boolean default false
)
returns public.people
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_person public.people;
  unit_row public.units;
  relationship_is_unit_scoped boolean := target_relationship in (
    'owner', 'owner_occupant', 'tenant', 'family_member', 'authorized_occupant'
  );
  meaningful_communication boolean := coalesce(
    target_financial_role in ('primary', 'additional'),
    false
  ) or target_general_recipient;
begin
  if auth.uid() is null or not public.can_manage_people(target_condominium) then
    raise exception using errcode = 'P0001', message = 'person_create_not_authorized';
  end if;

  if target_relationship not in (
    'none', 'owner', 'owner_occupant', 'tenant', 'family_member', 'authorized_occupant',
    'board_member', 'administrator_contact', 'representative', 'emergency_contact', 'other'
  ) then
    raise exception using errcode = 'P0001', message = 'initial_relationship_invalid';
  end if;

  if relationship_is_unit_scoped then
    if target_unit is null then
      raise exception using errcode = 'P0001', message = 'initial_relationship_unit_required';
    end if;
    select * into unit_row
    from public.units
    where id = target_unit and condominium_id = target_condominium;
    if unit_row.id is null then
      raise exception using errcode = 'P0001', message = 'initial_relationship_unit_not_found';
    end if;
  elsif target_unit is not null then
    raise exception using errcode = 'P0001', message = 'initial_relationship_unit_unavailable';
  end if;

  if target_status = 'inactive' and target_relationship <> 'none' then
    raise exception using errcode = 'P0001', message = 'inactive_person_initial_relationship_forbidden';
  end if;

  if target_relationship not in ('owner', 'owner_occupant')
    and target_ownership_percentage is not null then
    raise exception using errcode = 'P0001', message = 'initial_ownership_percentage_unavailable';
  end if;
  if target_ownership_percentage is not null
    and (target_ownership_percentage <= 0 or target_ownership_percentage > 100) then
    raise exception using errcode = 'P0001', message = 'initial_ownership_percentage_invalid';
  end if;

  if target_financial_role is not null
    and target_financial_role not in ('none', 'primary', 'additional') then
    raise exception using errcode = 'P0001', message = 'initial_communication_role_invalid';
  end if;
  if meaningful_communication
    and not relationship_is_unit_scoped then
    raise exception using errcode = 'P0001', message = 'communication_unit_required';
  end if;

  insert into public.people(
    condominium_id, first_name, last_name, document_type, document_number, email, phone, status, created_by
  ) values (
    target_condominium, btrim(target_first_name), btrim(target_last_name),
    nullif(btrim(target_document_type), ''), nullif(btrim(target_document_number), ''),
    nullif(lower(btrim(target_email)), ''), nullif(btrim(target_phone), ''), target_status, auth.uid()
  ) returning * into created_person;

  if target_relationship in ('owner', 'owner_occupant') then
    insert into public.unit_owners(
      unit_id, person_id, ownership_percentage, is_primary_contact, starts_at, created_by
    ) values (
      target_unit, created_person.id, target_ownership_percentage, false,
      coalesce(target_starts_at, current_date), auth.uid()
    );
  end if;

  if target_relationship in ('owner_occupant', 'tenant', 'family_member', 'authorized_occupant') then
    insert into public.unit_occupancies(
      unit_id, person_id, occupancy_type, is_primary_contact, starts_at, created_by
    ) values (
      target_unit, created_person.id, target_relationship::public.occupancy_type, false,
      coalesce(target_starts_at, current_date), auth.uid()
    );
  end if;

  if target_relationship in (
    'board_member', 'administrator_contact', 'representative', 'emergency_contact', 'other'
  ) then
    insert into public.condominium_person_relationships(
      condominium_id, person_id, relationship_type, title, starts_at, created_by
    ) values (
      target_condominium, created_person.id,
      target_relationship::public.condominium_person_relationship_type,
      nullif(btrim(target_relationship_title), ''), coalesce(target_starts_at, current_date), auth.uid()
    );
  end if;

  if meaningful_communication then
    perform public.set_unit_communication_assignment(
      target_condominium,
      target_unit,
      created_person.id,
      coalesce(target_financial_role, 'none'),
      target_general_recipient
    );
  end if;

  return created_person;
end;
$$;

revoke all on function public.create_person_with_initial_context(
  uuid, text, text, text, text, text, text, public.person_status, text, uuid, numeric, date, text, text, boolean
) from public, anon;
grant execute on function public.create_person_with_initial_context(
  uuid, text, text, text, text, text, text, public.person_status, text, uuid, numeric, date, text, text, boolean
) to authenticated;
