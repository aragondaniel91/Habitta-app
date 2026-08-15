begin;
select plan(6);

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
  '00000000-0000-0000-0000-000000001839',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'hab183-guard@test.local',
  'x',
  '{}'::jsonb,
  now(),
  now()
);

insert into public.organizations (id, name, organization_type, created_by)
values (
  '18300000-0000-4000-8000-000000000001',
  'HAB 183 Guard Org',
  'independent',
  '00000000-0000-0000-0000-000000001839'
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
    '18300000-0000-4000-8000-000000000010',
    '18300000-0000-4000-8000-000000000001',
    'Casas HAB 183',
    'VE',
    'Caracas',
    'America/Caracas',
    'USD',
    'house_community',
    10,
    null,
    '00000000-0000-0000-0000-000000001839'
  ),
  (
    '18300000-0000-4000-8000-000000000020',
    '18300000-0000-4000-8000-000000000001',
    'Edificio HAB 183',
    'VE',
    'Caracas',
    'America/Caracas',
    'USD',
    'single_building',
    20,
    1,
    '00000000-0000-0000-0000-000000001839'
  ),
  (
    '18300000-0000-4000-8000-000000000030',
    '18300000-0000-4000-8000-000000000001',
    'Legacy HAB 183',
    'VE',
    'Caracas',
    'America/Caracas',
    'USD',
    'unspecified',
    null,
    null,
    '00000000-0000-0000-0000-000000001839'
  );

select throws_ok(
  $$insert into public.buildings (condominium_id, name, created_by)
    values ('18300000-0000-4000-8000-000000000010', 'Torre inválida', '00000000-0000-0000-0000-000000001839')$$,
  'P0001',
  'house community cannot contain buildings',
  'house communities reject physical buildings at the database boundary'
);

select lives_ok(
  $$insert into public.buildings (id, condominium_id, name, created_by)
    values ('18300000-0000-4000-8000-000000000021', '18300000-0000-4000-8000-000000000020', 'Edificio HAB 183', '00000000-0000-0000-0000-000000001839')$$,
  'single-building condominium accepts its first building'
);

select throws_ok(
  $$insert into public.buildings (condominium_id, name, created_by)
    values ('18300000-0000-4000-8000-000000000020', 'Segundo edificio inválido', '00000000-0000-0000-0000-000000001839')$$,
  'P0001',
  'single building condominium cannot contain more than one building',
  'single-building condominium rejects a second building'
);

select lives_ok(
  $$insert into public.buildings (id, condominium_id, name, created_by)
    values ('18300000-0000-4000-8000-000000000031', '18300000-0000-4000-8000-000000000030', 'Legacy Tower', '00000000-0000-0000-0000-000000001839')$$,
  'legacy unspecified topology stays backward-compatible'
);

select throws_ok(
  $$insert into public.units (condominium_id, building_id, code, type, status, created_by)
    values ('18300000-0000-4000-8000-000000000020', '18300000-0000-4000-8000-000000000031', 'A-1', 'apartment', 'active', '00000000-0000-0000-0000-000000001839')$$,
  'P0001',
  'unit and building must share condominium',
  'a unit cannot reference a building from another condominium'
);

select lives_ok(
  $$insert into public.units (condominium_id, building_id, code, type, status, created_by)
    values ('18300000-0000-4000-8000-000000000020', '18300000-0000-4000-8000-000000000021', 'A-1', 'apartment', 'active', '00000000-0000-0000-0000-000000001839')$$,
  'a unit may reference a building in its own condominium'
);

select * from finish();
rollback;
