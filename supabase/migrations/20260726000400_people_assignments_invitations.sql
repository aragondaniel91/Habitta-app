create type public.person_status as enum ('active', 'inactive');
create type public.occupancy_type as enum (
  'owner_occupant',
  'tenant',
  'family_member',
  'authorized_occupant'
);
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  auth_user_id uuid references auth.users(id),
  first_name text not null,
  last_name text not null,
  document_type text,
  document_number text,
  email text,
  phone text,
  status public.person_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id)
);

create unique index people_condominium_email_unique
  on public.people (condominium_id, lower(email))
  where email is not null;

create unique index people_condominium_auth_user_unique
  on public.people (condominium_id, auth_user_id)
  where auth_user_id is not null;

create table public.unit_owners (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  person_id uuid not null references public.people(id),
  ownership_percentage numeric(7, 4)
    check (ownership_percentage > 0 and ownership_percentage <= 100),
  is_primary_contact boolean not null default false,
  starts_at date not null default current_date,
  ends_at date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  unique (unit_id, person_id, starts_at)
);

create unique index unit_owners_active_unique
  on public.unit_owners (unit_id, person_id)
  where ends_at is null;

create table public.unit_occupancies (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  person_id uuid not null references public.people(id),
  occupancy_type public.occupancy_type not null,
  is_primary_contact boolean not null default false,
  starts_at date not null default current_date,
  ends_at date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  unique (unit_id, person_id, occupancy_type, starts_at)
);

create unique index unit_occupancies_active_unique
  on public.unit_occupancies (unit_id, person_id, occupancy_type)
  where ends_at is null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  unit_id uuid references public.units(id),
  email text not null,
  intended_role public.condominium_role not null
    check (intended_role in ('owner', 'tenant')),
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create function public.can_manage_people(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_condominium_structure(target)
    or exists (
      select 1
      from public.condominium_memberships
      where condominium_id = target
        and user_id = auth.uid()
        and role = 'assistant'
    );
$$;

create function public.can_read_people(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_people(target)
    or exists (
      select 1
      from public.condominium_memberships
      where condominium_id = target
        and user_id = auth.uid()
        and role in ('accountant', 'payment_reviewer')
    );
$$;

revoke execute on function public.can_manage_people(uuid) from public;
revoke execute on function public.can_read_people(uuid) from public;
grant execute on function public.can_manage_people(uuid) to authenticated, service_role;
grant execute on function public.can_read_people(uuid) to authenticated, service_role;

create function public.assert_person_unit_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.people p
    join public.units u on u.id = new.unit_id
    where p.id = new.person_id
      and p.condominium_id = u.condominium_id
  ) then
    raise exception 'person and unit must share condominium';
  end if;

  return new;
end;
$$;

create function public.assert_invitation_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.people p
    where p.id = new.person_id
      and p.condominium_id = new.condominium_id
  ) then
    raise exception 'person and invitation must share condominium';
  end if;

  if new.unit_id is not null and not exists (
    select 1
    from public.units u
    where u.id = new.unit_id
      and u.condominium_id = new.condominium_id
  ) then
    raise exception 'unit and invitation must share condominium';
  end if;

  return new;
end;
$$;

revoke execute on function public.assert_person_unit_tenant() from public;
revoke execute on function public.assert_invitation_tenant() from public;

create trigger unit_owners_tenant
before insert or update on public.unit_owners
for each row execute function public.assert_person_unit_tenant();

create trigger unit_occupancies_tenant
before insert or update on public.unit_occupancies
for each row execute function public.assert_person_unit_tenant();

create trigger invitations_tenant
before insert or update on public.invitations
for each row execute function public.assert_invitation_tenant();

alter table public.people enable row level security;
alter table public.unit_owners enable row level security;
alter table public.unit_occupancies enable row level security;
alter table public.invitations enable row level security;

create policy people_read on public.people
for select
using (public.can_read_people(condominium_id) or auth_user_id = auth.uid());

create policy people_insert on public.people
for insert
with check (public.can_manage_people(condominium_id));

create policy people_update on public.people
for update
using (public.can_manage_people(condominium_id))
with check (public.can_manage_people(condominium_id));

create policy owners_read on public.unit_owners
for select
using (
  exists (
    select 1
    from public.people p
    where p.id = person_id
      and (
        p.auth_user_id = auth.uid()
        or public.can_read_people(p.condominium_id)
      )
  )
);

create policy owners_insert on public.unit_owners
for insert
with check (
  exists (
    select 1
    from public.units u
    where u.id = unit_id
      and public.can_manage_people(u.condominium_id)
  )
);

create policy owners_update on public.unit_owners
for update
using (
  exists (
    select 1
    from public.units u
    where u.id = unit_id
      and public.can_manage_people(u.condominium_id)
  )
)
with check (
  exists (
    select 1
    from public.units u
    where u.id = unit_id
      and public.can_manage_people(u.condominium_id)
  )
);

create policy occupancies_read on public.unit_occupancies
for select
using (
  exists (
    select 1
    from public.people p
    where p.id = person_id
      and (
        p.auth_user_id = auth.uid()
        or public.can_read_people(p.condominium_id)
      )
  )
);

create policy occupancies_insert on public.unit_occupancies
for insert
with check (
  exists (
    select 1
    from public.units u
    where u.id = unit_id
      and public.can_manage_people(u.condominium_id)
  )
);

create policy occupancies_update on public.unit_occupancies
for update
using (
  exists (
    select 1
    from public.units u
    where u.id = unit_id
      and public.can_manage_people(u.condominium_id)
  )
)
with check (
  exists (
    select 1
    from public.units u
    where u.id = unit_id
      and public.can_manage_people(u.condominium_id)
  )
);

create policy invitations_manage on public.invitations
for all
using (public.can_manage_people(condominium_id))
with check (public.can_manage_people(condominium_id));

create function public.accept_invitation(raw_token text)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invitations;
  authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select email
  into authenticated_email
  from auth.users
  where id = auth.uid();

  select *
  into invite
  from public.invitations
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and status = 'pending'
  for update;

  if invite.id is null
    or invite.expires_at < now()
    or authenticated_email is null
    or lower(invite.email) <> lower(authenticated_email)
  then
    raise exception 'invalid invitation';
  end if;

  update public.people
  set auth_user_id = auth.uid(),
      updated_at = now()
  where id = invite.person_id
    and (auth_user_id is null or auth_user_id = auth.uid());

  if not found then
    raise exception 'person already linked';
  end if;

  insert into public.condominium_memberships (condominium_id, user_id, role)
  values (invite.condominium_id, auth.uid(), invite.intended_role)
  on conflict do nothing;

  update public.invitations
  set status = 'accepted',
      accepted_at = now()
  where id = invite.id
  returning * into invite;

  return invite;
end;
$$;

revoke execute on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;