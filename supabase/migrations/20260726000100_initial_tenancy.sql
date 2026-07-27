create extension if not exists "pgcrypto";

create type public.membership_role as enum ('administrator', 'accountant', 'assistant', 'payment_reviewer', 'board_member', 'owner', 'tenant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.condominiums (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  condominium_id uuid references public.condominiums(id) on delete cascade,
  role public.membership_role not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id, condominium_id, role)
);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.condominiums enable row level security;
alter table public.memberships enable row level security;

create function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where user_id = auth.uid() and organization_id = target_organization_id);
$$;

create function public.is_condominium_member(target_condominium_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where user_id = auth.uid() and condominium_id = target_condominium_id);
$$;

create policy "profiles are visible to their owner" on public.profiles for select using (id = auth.uid());
create policy "organizations are isolated by membership" on public.organizations for select using (public.is_organization_member(id));
create policy "condominiums are isolated by organization" on public.condominiums for select using (public.is_organization_member(organization_id));
create policy "memberships are isolated by organization" on public.memberships for select using (public.is_organization_member(organization_id));

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name'); return new; end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
