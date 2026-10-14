-- Provider-agnostic condominium collection-connection foundation.
-- This is deliberately separate from Habitta SaaS billing. It contains metadata and opaque public
-- account references only: credentials, OAuth tokens, API keys, webhook secrets and private keys
-- are never stored here.

alter table public.condominiums
  add constraint condominiums_id_organization_unique unique (id, organization_id);

create table public.condominium_collection_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  display_label text not null check (char_length(btrim(display_label)) between 1 and 120),
  provider_account_reference text check (provider_account_reference is null or char_length(btrim(provider_account_reference)) between 1 and 255),
  environment text not null check (environment in ('sandbox', 'production')),
  connection_status text not null default 'pending' check (connection_status in ('pending', 'connected', 'requires_attention', 'disabled')),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, provider_key, display_label, environment)
);

create table public.condominium_collection_provider_connection_assignments (
  connection_id uuid not null,
  condominium_id uuid not null,
  organization_id uuid not null,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (connection_id, condominium_id),
  foreign key (connection_id, organization_id)
    references public.condominium_collection_provider_connections(id, organization_id) on delete cascade,
  foreign key (condominium_id, organization_id)
    references public.condominiums(id, organization_id) on delete cascade
);

create index condominium_collection_provider_connection_assignments_condominium_idx
  on public.condominium_collection_provider_connection_assignments (condominium_id);

alter table public.condominium_collection_provider_connections enable row level security;
alter table public.condominium_collection_provider_connection_assignments enable row level security;

-- Connection metadata is financial configuration, not general condominium content: a resident
-- (owner, tenant, family member, authorized occupant) has no business reading it, so this does not
-- delegate to `can_read_organization`/`can_read_condominium`, which admit every resident role. The
-- audience mirrors `can_read_treasury`: the organization owner plus the five staff roles.
create function public.can_read_collection_provider_connections(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner(target_organization)
    or exists (
      select 1
      from public.condominiums c
      join public.condominium_memberships cm on cm.condominium_id = c.id
      where c.organization_id = target_organization
        and cm.user_id = auth.uid()
        and cm.role in (
          'condominium_admin',
          'accountant',
          'assistant',
          'payment_reviewer',
          'board_member'
        )
    );
$$;

revoke all on function public.can_read_collection_provider_connections(uuid) from public;
grant execute on function public.can_read_collection_provider_connections(uuid) to authenticated, service_role;

-- Browser users may read metadata only as finance staff. No browser mutation policy exists: future,
-- verified provider adapters must own connection lifecycle state and assignments.
create policy collection_provider_connections_read
on public.condominium_collection_provider_connections for select
using (public.can_read_collection_provider_connections(organization_id));

create policy collection_provider_connection_assignments_read
on public.condominium_collection_provider_connection_assignments for select
using (public.can_read_treasury(condominium_id));

revoke all on public.condominium_collection_provider_connections,
  public.condominium_collection_provider_connection_assignments
from public, anon, authenticated;

grant select on public.condominium_collection_provider_connections,
  public.condominium_collection_provider_connection_assignments
to authenticated;
