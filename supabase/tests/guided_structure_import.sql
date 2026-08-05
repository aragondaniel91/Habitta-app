begin;
select plan(8);

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
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'import-admin@test.local',
    'x',
    '{"full_name":"Import Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'import-outsider@test.local',
    'x',
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

create temporary table import_workspace as
select public.create_admin_workspace(
  'Habitta Import Test',
  'independent',
  'Condominio Importación',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  20,
  'Torre Inicial'
) as payload;

create temporary table import_rows as
select jsonb_build_array(
  jsonb_build_object(
    'building_name', 'Torre Importada',
    'unit_code', 'A-101',
    'unit_type', 'apartment',
    'floor', '1',
    'ownership_percentage', '2.50',
    'status', 'active'
  ),
  jsonb_build_object(
    'building_name', 'Torre Importada',
    'unit_code', 'A-102',
    'unit_type', 'apartment',
    'floor', '1',
    'ownership_percentage', '2.50',
    'status', 'active'
  )
) as rows;

select is(
  (
    public.preview_structure_import(
      (select (payload #>> '{condominium,id}')::uuid from import_workspace),
      (select rows from import_rows)
    ) ->> 'valid_count'
  )::integer,
  2,
  'valid structure rows are accepted by preview'
);

select is(
  (
    public.preview_structure_import(
      (select (payload #>> '{condominium,id}')::uuid from import_workspace),
      (select rows from import_rows)
    ) ->> 'error_count'
  )::integer,
  0,
  'valid structure preview has no errors'
);

create temporary table import_result as
select public.import_structure_csv(
  (select (payload #>> '{condominium,id}')::uuid from import_workspace),
  (select rows from import_rows),
  'structure-import-1',
  'unidades.csv'
) as result;

select is(
  ((select result from import_result) ->> 'created')::integer,
  2,
  'atomic import creates every valid unit'
);

select is(
  ((select result from import_result) ->> 'created_buildings')::integer,
  1,
  'shared missing building is created once'
);

select is(
  (
    select count(*)
    from public.units
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from import_workspace)
      and code in ('A-101', 'A-102')
  ),
  2::bigint,
  'imported units are scoped to the condominium'
);

select is(
  (
    public.import_structure_csv(
      (select (payload #>> '{condominium,id}')::uuid from import_workspace),
      (select rows from import_rows),
      'structure-import-1',
      'unidades.csv'
    ) ->> 'created'
  )::integer,
  2,
  'repeating the same idempotency key returns the prior result'
);

select is(
  (
    public.preview_structure_import(
      (select (payload #>> '{condominium,id}')::uuid from import_workspace),
      jsonb_build_array(
        jsonb_build_object(
          'building_name', 'Torre Importada',
          'unit_code', 'A-101',
          'unit_type', 'apartment',
          'floor', '1',
          'ownership_percentage', '2.50',
          'status', 'active'
        )
      )
    ) ->> 'error_count'
  )::integer,
  1,
  'preview rejects an existing unit before commit'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);

select throws_ok(
  format(
    'select public.preview_structure_import(%L::uuid, %L::jsonb)',
    (select payload #>> '{condominium,id}' from import_workspace),
    (select rows::text from import_rows)
  ),
  'P0001',
  'permission denied',
  'users without structure permissions cannot preview imports'
);

select * from finish();
rollback;
