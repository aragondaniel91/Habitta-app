create type public.organization_role as enum ('organization_owner');
create type public.condominium_role as enum ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer', 'board_member', 'owner', 'tenant');
create type public.unit_type as enum ('apartment', 'house', 'commercial', 'parking', 'storage');
create type public.unit_status as enum ('active', 'inactive');

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role public.organization_role not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, user_id, role)
);
create table public.condominium_memberships (
  id uuid primary key default gen_random_uuid(), condominium_id uuid not null references public.condominiums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role public.condominium_role not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (condominium_id, user_id, role)
);
create table public.buildings (
  id uuid primary key default gen_random_uuid(), condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(condominium_id, name)
);
create table public.units (
  id uuid primary key default gen_random_uuid(), condominium_id uuid not null references public.condominiums(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null, code text not null, type public.unit_type not null,
  floor text, ownership_percentage numeric(7,4) check (ownership_percentage > 0 and ownership_percentage <= 100), status public.unit_status not null default 'active',
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(condominium_id, code)
);
alter table public.organization_memberships enable row level security;
alter table public.condominium_memberships enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;

create function public.is_organization_owner(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = target
      and om.user_id = auth.uid()
      and om.role = 'organization_owner'
  );
$$;

create function public.is_condominium_admin(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = auth.uid()
      and cm.role in ('condominium_admin', 'accountant', 'assistant')
  );
$$;

create function public.is_organization_owner_for_condominium(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.condominiums c
    join public.organization_memberships om
      on om.organization_id = c.organization_id
    where c.id = target
      and om.user_id = auth.uid()
      and om.role = 'organization_owner'
  );
$$;

create function public.can_read_organization(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner(target)
    or exists (
      select 1
      from public.condominiums c
      join public.condominium_memberships cm
        on cm.condominium_id = c.id
      where c.organization_id = target
        and cm.user_id = auth.uid()
    );
$$;

create function public.can_read_condominium(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner_for_condominium(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
    );
$$;

revoke execute on function public.is_organization_owner(uuid) from public;
revoke execute on function public.is_condominium_admin(uuid) from public;
revoke execute on function public.is_organization_owner_for_condominium(uuid) from public;
revoke execute on function public.can_read_organization(uuid) from public;
revoke execute on function public.can_read_condominium(uuid) from public;
grant execute on function public.is_organization_owner(uuid) to authenticated, service_role;
grant execute on function public.is_condominium_admin(uuid) to authenticated, service_role;
grant execute on function public.is_organization_owner_for_condominium(uuid) to authenticated, service_role;
grant execute on function public.can_read_organization(uuid) to authenticated, service_role;
grant execute on function public.can_read_condominium(uuid) to authenticated, service_role;

create policy org_member_read on public.organization_memberships
for select
using (
  organization_memberships.user_id = auth.uid()
  or public.is_organization_owner(organization_memberships.organization_id)
);

create policy condo_member_read on public.condominium_memberships
for select
using (
  condominium_memberships.user_id = auth.uid()
  or public.is_organization_owner_for_condominium(condominium_memberships.condominium_id)
);

create policy org_read_v2 on public.organizations
for select
using (public.can_read_organization(organizations.id));

create policy condo_read_v2 on public.condominiums
for select
using (public.can_read_condominium(condominiums.id));

create policy building_read on public.buildings
for select
using (public.can_read_condominium(buildings.condominium_id));

create policy building_write on public.buildings
for all
using (public.is_condominium_admin(buildings.condominium_id))
with check (public.is_condominium_admin(buildings.condominium_id));

create policy unit_read on public.units
for select
using (public.can_read_condominium(units.condominium_id));

create policy unit_write on public.units
for all
using (public.is_condominium_admin(units.condominium_id))
with check (public.is_condominium_admin(units.condominium_id));

create function public.create_organization_with_condominium(organization_name text, condominium_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  org public.organizations;
  condo public.condominiums;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations(name, created_by)
  values (organization_name, auth.uid())
  returning * into org;

  insert into public.organization_memberships(organization_id, user_id, role)
  values (org.id, auth.uid(), 'organization_owner');

  if condominium_name is not null then
    insert into public.condominiums(organization_id, name, created_by)
    values (org.id, condominium_name, auth.uid())
    returning * into condo;

    insert into public.condominium_memberships(condominium_id, user_id, role)
    values (condo.id, auth.uid(), 'condominium_admin');
  end if;

  return jsonb_build_object(
    'organization', to_jsonb(org),
    'condominium', case when condo.id is null then null else to_jsonb(condo) end
  );
end;
$$;
revoke execute on function public.create_organization_with_condominium(text, text) from public;
grant execute on function public.create_organization_with_condominium(text, text) to authenticated;

create policy org_insert on public.organizations
for insert
with check (organizations.created_by = auth.uid());

create policy condo_insert on public.condominiums
for insert
with check (
  condominiums.created_by = auth.uid()
  and public.is_organization_owner(condominiums.organization_id)
);
