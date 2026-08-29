-- HAB-414: classify organizations before any synthetic/demo tenant exists in Production.
--
-- This is classification only. It does not change subscription resolution, capabilities, unit
-- limits, billing, or any tenant authorization decision. `customer` is the compatibility default;
-- `demo` and `internal` are platform-managed metadata and cannot be self-selected by a tenant.

create type public.organization_account_type as enum ('customer', 'demo', 'internal');

alter table public.organizations
  add column account_type public.organization_account_type not null default 'customer';

comment on type public.organization_account_type is
  'Platform-managed commercial classification: customer, synthetic demo, or internal Habitta use.';

comment on column public.organizations.account_type is
  'Commercial classification only. customer is normal tenant state; demo/internal are platform-managed and non-customer classifications.';

-- The existing org_insert RLS policy intentionally allows an authenticated user to create the
-- organization they own. Without an additional guard, adding this column would also let that same
-- caller create itself as `demo` or `internal`. Keep the existing creation flow unchanged while
-- failing closed on those platform-only classifications.
--
-- This trigger also protects a future UPDATE policy from accidentally making account_type tenant-
-- writable. It does not create any new write path for platform_admin; that role remains read-only.
create function public.guard_organization_account_type()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  trusted_admin boolean :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or request_role = 'service_role';
begin
  if tg_op = 'INSERT' then
    if new.account_type <> 'customer' and not trusted_admin then
      raise exception using
        errcode = '42501',
        message = 'organization account_type is platform-managed';
    end if;
  elsif new.account_type is distinct from old.account_type and not trusted_admin then
    raise exception using
      errcode = '42501',
      message = 'organization account_type is platform-managed';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_organization_account_type() from public;
grant execute on function public.guard_organization_account_type() to anon, authenticated, service_role;

create trigger organizations_account_type_guard
before insert or update of account_type on public.organizations
for each row
execute function public.guard_organization_account_type();
