begin;
select plan(18);

select has_type(
  'public',
  'condominium_property_topology',
  'condominium property topology enum exists'
);
select has_column('public', 'condominiums', 'legal_id_type', 'condominiums store legal ID type');
select has_column('public', 'condominiums', 'address_line1', 'condominiums store structured address');
select has_column('public', 'condominiums', 'property_topology', 'condominiums store property topology');

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
values
  (
    '00000000-0000-0000-0000-000000001831',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'hab183-owner@test.local',
    'x',
    '{"full_name":"HAB 183 Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000001832',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'hab183-house@test.local',
    'x',
    '{"full_name":"HAB 183 House Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000001833',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'hab183-outsider@test.local',
    'x',
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001831', true);

create temporary table hab183_workspace as
select public.create_admin_workspace_v2(
  organization_name := 'Administradora HAB 183',
  organization_type := 'management_company',
  condominium_name := 'Residencias Los Samanes',
  country_code := 'VE',
  address_line1 := 'Av. Principal, Urbanización Los Samanes',
  city := 'Caracas',
  timezone := 'America/Caracas',
  primary_currency_code := 'VES',
  property_topology := 'single_building',
  secondary_currency_code := 'USD',
  legal_name := 'Condominio Residencias Los Samanes',
  legal_id_type := 'RIF',
  legal_id_number := 'J-12345678-9',
  state_region := 'Distrito Capital',
  municipality := 'Baruta',
  declared_unit_count := 48
) as payload;

select is(
  (select payload #>> '{condominium,property_topology}' from hab183_workspace),
  'single_building',
  'v2 onboarding persists single-building topology'
);
select is(
  (select payload #>> '{condominium,legal_id_type}' from hab183_workspace),
  'RIF',
  'v2 onboarding persists legal ID type'
);
select is(
  (select payload #>> '{condominium,legal_id_number}' from hab183_workspace),
  'J-12345678-9',
  'v2 onboarding persists legal ID number'
);
select is(
  (select payload #>> '{condominium,address_line1}' from hab183_workspace),
  'Av. Principal, Urbanización Los Samanes',
  'v2 onboarding persists street address'
);
select is(
  (select (payload #>> '{condominium,declared_unit_count}')::integer from hab183_workspace),
  48,
  'single-building onboarding persists declared unit count'
);
select is(
  (select (payload #>> '{condominium,declared_building_count}')::integer from hab183_workspace),
  1,
  'single-building onboarding normalizes building count to one'
);
select is(
  (
    select count(*)
    from public.buildings
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab183_workspace)
      and name = 'Residencias Los Samanes'
  ),
  1::bigint,
  'single-building onboarding bootstraps one real physical building'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001832', true);
create temporary table hab183_house_workspace as
select public.create_admin_workspace_v2(
  organization_name := 'Junta Casas HAB 183',
  organization_type := 'independent',
  condominium_name := 'Conjunto Los Naranjos',
  country_code := 'VE',
  address_line1 := 'Calle 4, Los Naranjos',
  city := 'Caracas',
  timezone := 'America/Caracas',
  primary_currency_code := 'USD',
  property_topology := 'house_community',
  declared_unit_count := 20
) as payload;

select is(
  (select payload #>> '{condominium,property_topology}' from hab183_house_workspace),
  'house_community',
  'house-community onboarding persists its topology'
);
select is(
  (
    select count(*)
    from public.buildings
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab183_house_workspace)
  ),
  0::bigint,
  'house-community onboarding does not create fake buildings'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001831', true);
select throws_ok(
  format(
    'select public.create_condominium_with_profile_v2(%L::uuid,%L,%L,%L,%L,%L,%L,%L::public.condominium_property_topology,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L::integer,%L::integer,%L)',
    (select payload #>> '{organization,id}' from hab183_workspace),
    'Complejo inválido',
    'VE',
    'Av. Test',
    'Caracas',
    'America/Caracas',
    'USD',
    'multi_building_complex',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    1,
    null
  ),
  'P0001',
  null,
  'multi-building topology rejects fewer than two buildings'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001833', true);
select throws_ok(
  format(
    'select public.create_condominium_with_profile_v2(%L::uuid,%L,%L,%L,%L,%L,%L,%L::public.condominium_property_topology,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L::integer,%L::integer,%L)',
    (select payload #>> '{organization,id}' from hab183_workspace),
    'Condominio ajeno',
    'VE',
    'Av. Ajena',
    'Caracas',
    'America/Caracas',
    'USD',
    'house_community',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    10,
    null,
    null
  ),
  'P0001',
  null,
  'non-owner cannot add a condominium through v2 onboarding'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001831', true);
create temporary table hab183_legacy_condo as
select public.create_condominium_with_profile(
  (select (payload #>> '{organization,id}')::uuid from hab183_workspace),
  'Legacy Cached Client',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  null,
  12,
  null
) as payload;

select is(
  (select payload #>> '{condominium,property_topology}' from hab183_legacy_condo),
  'unspecified',
  'legacy onboarding RPC remains compatible and marks topology unspecified'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_admin_workspace_v2(text,text,text,text,text,text,text,text,public.condominium_property_topology,text,text,text,text,text,text,text,text,text,integer,integer,text)',
    'EXECUTE'
  ),
  'anonymous role cannot execute v2 workspace onboarding'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_admin_workspace_v2(text,text,text,text,text,text,text,text,public.condominium_property_topology,text,text,text,text,text,text,text,text,text,integer,integer,text)',
    'EXECUTE'
  ),
  'authenticated role may execute v2 workspace onboarding'
);

select * from finish();
rollback;
