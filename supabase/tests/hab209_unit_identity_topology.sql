begin;
select plan(12);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000002090',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'hab209@test.local',
  'x',
  '{}'::jsonb,
  now(),
  now()
);

insert into public.organizations (id, name, organization_type, created_by)
values (
  '20900000-0000-4000-8000-000000000001',
  'HAB 209 Org',
  'independent',
  '00000000-0000-0000-0000-000000002090'
);

insert into public.condominiums (
  id,
  organization_id,
  name,
  country_code,
  city,
  timezone,
  primary_currency_code,
  property_topology,
  declared_unit_count,
  declared_building_count,
  created_by
)
values
  (
    '20900000-0000-4000-8000-000000000010',
    '20900000-0000-4000-8000-000000000001',
    'Torres HAB 209',
    'VE',
    'Caracas',
    'America/Caracas',
    'USD',
    'multi_building_complex',
    40,
    2,
    '00000000-0000-0000-0000-000000002090'
  ),
  (
    '20900000-0000-4000-8000-000000000020',
    '20900000-0000-4000-8000-000000000001',
    'Edificio HAB 209',
    'VE',
    'Caracas',
    'America/Caracas',
    'USD',
    'single_building',
    20,
    1,
    '00000000-0000-0000-0000-000000002090'
  ),
  (
    '20900000-0000-4000-8000-000000000030',
    '20900000-0000-4000-8000-000000000001',
    'Casas HAB 209',
    'VE',
    'Caracas',
    'America/Caracas',
    'USD',
    'house_community',
    12,
    null,
    '00000000-0000-0000-0000-000000002090'
  );

insert into public.organization_memberships (organization_id, user_id, role)
values (
  '20900000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000002090',
  'organization_owner'
);

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('20900000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000002090', 'condominium_admin'),
  ('20900000-0000-4000-8000-000000000020', '00000000-0000-0000-0000-000000002090', 'condominium_admin'),
  ('20900000-0000-4000-8000-000000000030', '00000000-0000-0000-0000-000000002090', 'condominium_admin');

insert into public.buildings (id, condominium_id, name, created_by)
values
  ('20900000-0000-4000-8000-000000000011', '20900000-0000-4000-8000-000000000010', 'Torre I', '00000000-0000-0000-0000-000000002090'),
  ('20900000-0000-4000-8000-000000000012', '20900000-0000-4000-8000-000000000010', 'Torre II', '00000000-0000-0000-0000-000000002090'),
  ('20900000-0000-4000-8000-000000000021', '20900000-0000-4000-8000-000000000020', 'Edificio HAB 209', '00000000-0000-0000-0000-000000002090');

select lives_ok(
  $$insert into public.units (condominium_id, building_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000010', '20900000-0000-4000-8000-000000000011', '1-A', 'apartment', 'active', '00000000-0000-0000-0000-000000002090')$$,
  'Torre I accepts unit code 1-A'
);

select lives_ok(
  $$insert into public.units (condominium_id, building_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000010', '20900000-0000-4000-8000-000000000012', '1-A', 'apartment', 'active', '00000000-0000-0000-0000-000000002090')$$,
  'Torre II may reuse human unit code 1-A'
);

select throws_ok(
  $$insert into public.units (condominium_id, building_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000010', '20900000-0000-4000-8000-000000000011', '1-A', 'apartment', 'active', '00000000-0000-0000-0000-000000002090')$$,
  null,
  null,
  'the same building cannot contain duplicate unit code 1-A'
);

select lives_ok(
  $$insert into public.units (condominium_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000010', 'KIOSK-1', 'commercial', 'active', '00000000-0000-0000-0000-000000002090')$$,
  'an unassigned common unit may be created'
);

select throws_ok(
  $$insert into public.units (condominium_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000010', 'KIOSK-1', 'commercial', 'active', '00000000-0000-0000-0000-000000002090')$$,
  null,
  null,
  'unassigned unit codes remain unique inside the condominium'
);

select lives_ok(
  $$insert into public.units (id, condominium_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000022', '20900000-0000-4000-8000-000000000020', '2-B', 'apartment', 'active', '00000000-0000-0000-0000-000000002090')$$,
  'single-building unit may omit building id at write time'
);

select is(
  (select building_id from public.units where id = '20900000-0000-4000-8000-000000000022'),
  '20900000-0000-4000-8000-000000000021'::uuid,
  'database automatically associates single-building units to the configured building'
);

select throws_ok(
  $$insert into public.units (condominium_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000020', 'CASA-1', 'house', 'active', '00000000-0000-0000-0000-000000002090')$$,
  'P0001',
  'house unit is incompatible with single building topology',
  'single-building condominiums reject house units'
);

select throws_ok(
  $$insert into public.units (condominium_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000030', 'APT-1', 'apartment', 'active', '00000000-0000-0000-0000-000000002090')$$,
  'P0001',
  'apartment unit is incompatible with house community topology',
  'house communities reject apartment units'
);

select lives_ok(
  $$insert into public.units (condominium_id, code, type, status, created_by)
    values ('20900000-0000-4000-8000-000000000030', 'CASA-1', 'house', 'active', '00000000-0000-0000-0000-000000002090')$$,
  'house communities accept house units'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002090', true);

select is(
  (
    public.preview_structure_import(
      '20900000-0000-4000-8000-000000000010',
      '[{"building_name":"Torre I","unit_code":"2-A","unit_type":"apartment"},{"building_name":"Torre II","unit_code":"2-A","unit_type":"apartment"}]'::jsonb
    ) ->> 'valid_count'
  )::integer,
  2,
  'CSV preview accepts the same human code in two different buildings'
);

select is(
  (
    public.preview_structure_import(
      '20900000-0000-4000-8000-000000000010',
      '[{"building_name":"Torre I","unit_code":"3-A","unit_type":"apartment"},{"building_name":"Torre I","unit_code":"3-A","unit_type":"apartment"}]'::jsonb
    ) ->> 'error_count'
  )::integer,
  2,
  'CSV preview rejects duplicate human codes inside one building'
);

select * from finish();
rollback;
