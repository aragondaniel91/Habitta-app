create table public.people_imports (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id),
  idempotency_key text not null,
  result jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (condominium_id, idempotency_key)
);

alter table public.people_imports enable row level security;

create policy people_imports_read on public.people_imports
for select
using (public.can_manage_people(condominium_id));

create function public.import_people_csv(target uuid, rows jsonb, key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  unit_row public.units;
  person_row public.people;
  existing_result jsonb;
  import_result jsonb := jsonb_build_object('created', 0, 'reused', 0, 'rejected', 0);
  unit_code_value text;
  first_name_value text;
  last_name_value text;
  email_value text;
  phone_value text;
  relationship_value text;
  ownership_text text;
  ownership_value numeric;
begin
  if auth.uid() is null or not public.can_manage_people(target) then
    raise exception 'permission denied';
  end if;

  if jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  if nullif(btrim(key), '') is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target::text || ':' || key, 0));

  select pi.result
  into existing_result
  from public.people_imports pi
  where pi.condominium_id = target
    and pi.idempotency_key = key;

  if found then
    return existing_result;
  end if;

  for item in
    select value
    from jsonb_array_elements(rows) as import_rows(value)
  loop
    unit_code_value := btrim(coalesce(item ->> 'unit_code', ''));
    first_name_value := btrim(coalesce(item ->> 'first_name', ''));
    last_name_value := btrim(coalesce(item ->> 'last_name', ''));
    email_value := nullif(lower(btrim(coalesce(item ->> 'email', ''))), '');
    phone_value := nullif(btrim(coalesce(item ->> 'phone', '')), '');
    relationship_value := btrim(coalesce(item ->> 'relationship', ''));
    ownership_text := nullif(btrim(coalesce(item ->> 'ownership_percentage', '')), '');
    ownership_value := null;

    if unit_code_value = '' then
      raise exception 'unit_code is required';
    end if;

    if first_name_value = '' or last_name_value = '' then
      raise exception 'first_name and last_name are required for unit %', unit_code_value;
    end if;

    if relationship_value not in (
      'owner',
      'owner_occupant',
      'tenant',
      'family_member',
      'authorized_occupant'
    ) then
      raise exception 'invalid relationship % for unit %', relationship_value, unit_code_value;
    end if;

    if ownership_text is not null then
      if ownership_text !~ '^[0-9]+([.][0-9]+)?$' then
        raise exception 'invalid ownership percentage for unit %', unit_code_value;
      end if;

      ownership_value := ownership_text::numeric;

      if ownership_value <= 0 or ownership_value > 100 then
        raise exception 'ownership percentage must be greater than 0 and at most 100';
      end if;
    end if;

    if relationship_value not in ('owner', 'owner_occupant') and ownership_value is not null then
      raise exception 'ownership percentage is only valid for owners';
    end if;

    select u.*
    into unit_row
    from public.units u
    where u.condominium_id = target
      and u.code = unit_code_value;

    if unit_row.id is null then
      raise exception 'unknown unit %', unit_code_value;
    end if;

    person_row := null;

    if email_value is not null then
      select p.*
      into person_row
      from public.people p
      where p.condominium_id = target
        and lower(p.email) = email_value
      limit 1;
    end if;

    if person_row.id is null then
      insert into public.people (
        condominium_id,
        first_name,
        last_name,
        email,
        phone,
        created_by
      )
      values (
        target,
        first_name_value,
        last_name_value,
        email_value,
        phone_value,
        auth.uid()
      )
      returning * into person_row;

      import_result := jsonb_set(
        import_result,
        '{created}',
        to_jsonb((import_result ->> 'created')::int + 1)
      );
    else
      import_result := jsonb_set(
        import_result,
        '{reused}',
        to_jsonb((import_result ->> 'reused')::int + 1)
      );
    end if;

    if relationship_value in ('owner', 'owner_occupant') then
      insert into public.unit_owners (
        unit_id,
        person_id,
        ownership_percentage,
        created_by
      )
      values (
        unit_row.id,
        person_row.id,
        ownership_value,
        auth.uid()
      )
      on conflict do nothing;
    end if;

    if relationship_value in (
      'owner_occupant',
      'tenant',
      'family_member',
      'authorized_occupant'
    ) then
      insert into public.unit_occupancies (
        unit_id,
        person_id,
        occupancy_type,
        created_by
      )
      values (
        unit_row.id,
        person_row.id,
        relationship_value::public.occupancy_type,
        auth.uid()
      )
      on conflict do nothing;
    end if;
  end loop;

  insert into public.people_imports (
    condominium_id,
    idempotency_key,
    result,
    created_by
  )
  values (
    target,
    key,
    import_result,
    auth.uid()
  );

  return import_result;
end;
$$;

revoke execute on function public.import_people_csv(uuid, jsonb, text) from public;
grant execute on function public.import_people_csv(uuid, jsonb, text) to authenticated;
