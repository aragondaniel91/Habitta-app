begin;
select plan(10);

select has_table('public', 'collection_provider_catalog', 'provider capability catalog exists');
select has_table('public', 'collection_provider_connection_events', 'connection lifecycle has an audit table');
select hasnt_column('public', 'condominium_collection_provider_connections', 'access_token', 'no provider token column');
select hasnt_column('public', 'condominium_collection_provider_connections', 'webhook_secret', 'no webhook secret column');
select hasnt_column('public', 'condominium_collection_provider_connections', 'api_key', 'no API key column');
select ok(not has_table_privilege('authenticated', 'public.collection_provider_connection_events', 'INSERT'), 'browser clients cannot forge connector audit events');
select ok(not has_table_privilege('authenticated', 'public.condominium_collection_provider_connections', 'INSERT'), 'browser clients cannot write connector rows directly');
select function_returns('public', 'create_collection_provider_connection', array['uuid', 'text', 'text', 'text', 'text', 'uuid[]'], 'public.condominium_collection_provider_connections', 'create RPC returns metadata only');
select function_returns('public', 'disable_collection_provider_connection', array['uuid'], 'public.condominium_collection_provider_connections', 'disable RPC returns metadata only');
select is((select count(*) from public.collection_provider_catalog where lifecycle_status <> 'pending'), 0::bigint, 'catalog cannot advertise an operational connector');

select * from finish();
rollback;
