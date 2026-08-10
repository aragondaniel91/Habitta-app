-- Habitta's own operating team (not a tenant, not an organization_owner) has had no real role at
-- all: apps/platform-admin was a static page with no auth and no backend. This is the first real
-- increment: a platform_admin can read across every organization/condominium, nothing more yet.
-- No write path, no ability to touch tenant data or impersonate anyone - deliberately scoped this
-- way because cross-organization read is a new trust boundary in this codebase (every existing
-- role is confined to one organization or one condominium) and should be proven out narrow before
-- it grows.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- A platform admin may see their own grant record (to confirm they have the role) but nothing
-- about who else holds it.
create policy platform_admins_self_read on public.platform_admins
for select
using (user_id = auth.uid());

revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;

-- RLS policies are OR'd together per table: these ADD platform-admin visibility on top of every
-- existing policy without touching how organization/condominium members already see their own
-- data. There is deliberately no matching write policy.
create policy platform_admin_read_organizations on public.organizations
for select
using (public.is_platform_admin());

create policy platform_admin_read_condominiums on public.condominiums
for select
using (public.is_platform_admin());

-- One row per condominium: unit and active-membership counts, nothing about individual residents,
-- balances or documents. Sized for a backoffice list, not a data export.
create function public.get_platform_condominium_overview()
returns table (
  organization_id uuid,
  organization_name text,
  condominium_id uuid,
  condominium_name text,
  unit_count bigint,
  membership_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    o.id,
    o.name,
    c.id,
    c.name,
    (select count(*) from public.units u where u.condominium_id = c.id),
    (select count(*) from public.condominium_memberships cm where cm.condominium_id = c.id),
    c.created_at
  from public.condominiums c
  join public.organizations o on o.id = c.organization_id
  where public.is_platform_admin()
  order by c.created_at desc;
$$;

revoke all on function public.get_platform_condominium_overview() from public;
grant execute on function public.get_platform_condominium_overview() to authenticated, service_role;
