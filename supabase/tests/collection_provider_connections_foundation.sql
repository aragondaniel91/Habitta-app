begin;
select plan(10);

select has_table('public', 'condominium_collection_provider_connections', 'collection connections have their own table');
select has_table('public', 'condominium_collection_provider_connection_assignments', 'assignments are explicit');
select hasnt_column('public', 'condominium_collection_provider_connections', 'access_token', 'no access token column');
select hasnt_column('public', 'condominium_collection_provider_connections', 'api_secret', 'no API secret column');
select hasnt_column('public', 'condominium_collection_provider_connections', 'webhook_secret', 'no webhook secret column');
select ok(not has_table_privilege('authenticated', 'public.condominium_collection_provider_connections', 'INSERT'), 'authenticated clients cannot create provider connections');
select ok(not has_table_privilege('authenticated', 'public.condominium_collection_provider_connection_assignments', 'INSERT'), 'authenticated clients cannot assign a connection');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('a4cc0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab-cpc-admin@test.local', 'x', now(), now()),
  ('a4cc0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab-cpc-tenant@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4cc0000-0000-0000-0000-000000000001', true);

create temporary table hab_cpc_workspace as
select public.create_admin_workspace(
  'HAB-CPC Org',
  'independent',
  'HAB-CPC Condo',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  1,
  'Torre HAB-CPC'
) as payload;

reset role;

insert into public.condominium_memberships (condominium_id, user_id, role)
values (
  (select (payload #>> '{condominium,id}')::uuid from hab_cpc_workspace),
  'a4cc0000-0000-0000-0000-000000000002',
  'tenant'
);

insert into public.condominium_collection_provider_connections (
  id, organization_id, provider_key, display_label, environment, created_by
) values (
  'a4cc1000-0000-0000-0000-000000000001',
  (select (payload #>> '{organization,id}')::uuid from hab_cpc_workspace),
  'stripe_connect', 'Stripe Connect (foundation)', 'sandbox',
  'a4cc0000-0000-0000-0000-000000000001'
);

insert into public.condominium_collection_provider_connection_assignments (
  connection_id, condominium_id, organization_id, assigned_by
) values (
  'a4cc1000-0000-0000-0000-000000000001',
  (select (payload #>> '{condominium,id}')::uuid from hab_cpc_workspace),
  (select (payload #>> '{organization,id}')::uuid from hab_cpc_workspace),
  'a4cc0000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4cc0000-0000-0000-0000-000000000001', true);

select is(
  public.can_read_collection_provider_connections(
    (select (payload #>> '{organization,id}')::uuid from hab_cpc_workspace)
  ),
  true,
  'condominium admin reads organization-scoped connection metadata'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4cc0000-0000-0000-0000-000000000002', true);

select is(
  public.can_read_collection_provider_connections(
    (select (payload #>> '{organization,id}')::uuid from hab_cpc_workspace)
  ),
  false,
  'a tenant with no finance role cannot read connection metadata'
);
select is(
  public.can_read_treasury(
    (select (payload #>> '{condominium,id}')::uuid from hab_cpc_workspace)
  ),
  false,
  'a tenant with no finance role cannot read connection assignments'
);

select * from finish();
rollback;
