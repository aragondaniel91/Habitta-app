begin;
select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-0000000002a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'maintenance-admin@test.local', 'x',
    '{"full_name":"Maintenance Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-0000000002a2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'maintenance-outsider@test.local', 'x',
    '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a1', true);

create temporary table maintenance_workspace as
select public.create_admin_workspace(
  'Habitta Maintenance Test',
  'independent',
  'Condominio Mantenimiento',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  12,
  'Torre Mantenimiento'
) as payload;

create temporary table maintenance_other_workspace as
select public.create_admin_workspace(
  'Habitta Maintenance Other',
  'independent',
  'Condominio Mantenimiento Externo',
  'VE',
  'Valencia',
  'America/Caracas',
  'USD',
  'VES',
  8,
  'Torre Externa'
) as payload;

insert into public.buildings (id, condominium_id, name, created_by) values
  (
    '00000000-0000-0000-0000-0000000002b1',
    (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
    'Torre Operativa',
    '00000000-0000-0000-0000-0000000002a1'
  ),
  (
    '00000000-0000-0000-0000-0000000002b2',
    (select (payload #>> '{condominium,id}')::uuid from maintenance_other_workspace),
    'Torre Ajena',
    '00000000-0000-0000-0000-0000000002a1'
  );

insert into public.vendors (
  id, condominium_id, name, email, phone, created_by
) values
  (
    '00000000-0000-0000-0000-0000000002c1',
    (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
    'Ascensores Habitta',
    'service@test.local',
    '+58 212 555 0101',
    '00000000-0000-0000-0000-0000000002a1'
  ),
  (
    '00000000-0000-0000-0000-0000000002c2',
    (select (payload #>> '{condominium,id}')::uuid from maintenance_other_workspace),
    'Proveedor Ajeno',
    'other@test.local',
    '+58 241 555 0102',
    '00000000-0000-0000-0000-0000000002a1'
  );

create temporary table maintenance_asset_created as
select public.create_maintenance_asset(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  'ASC-01',
  'Ascensor principal',
  'Ascensores',
  '00000000-0000-0000-0000-0000000002b1',
  null,
  'Otis',
  'Gen2',
  'SERIAL-ASC-001',
  current_date - 365,
  current_date + 365,
  'Lobby de la torre',
  'Equipo crítico para la comunidad'
) as asset;

select is(
  (select count(*) from public.maintenance_assets),
  1::bigint,
  'administrator creates a condominium-scoped asset'
);
select is(
  (select count(*) from public.maintenance_events where entity_type = 'asset' and event_type = 'created'),
  1::bigint,
  'asset creation is audited'
);
select throws_like(
  format(
    'select public.create_maintenance_asset(%L::uuid,%L,%L,%L,%L::uuid,null,null,null,null,null,null,null,null)',
    (select payload #>> '{condominium,id}' from maintenance_workspace),
    'BAD-01',
    'Activo con edificio ajeno',
    'Prueba',
    '00000000-0000-0000-0000-0000000002b2'
  ),
  '%invalid asset building%',
  'cross-condominium asset locations are rejected'
);

create temporary table maintenance_plan_created as
select public.create_maintenance_plan(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  (select (asset).id from maintenance_asset_created),
  'Inspección semanal de ascensor',
  'inspection',
  'Revisar puertas, alarmas, nivelación y bitácora técnica.',
  1,
  'weeks',
  current_date - 14,
  '00000000-0000-0000-0000-0000000002c1',
  '00000000-0000-0000-0000-0000000002a1',
  60
) as plan;

select is(
  (select count(*) from public.maintenance_plans),
  1::bigint,
  'administrator creates a recurring maintenance plan'
);
select is(
  public.generate_due_maintenance_work_orders(
    (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
    current_date
  ),
  3,
  'overdue recurrence generates each missing work order'
);
select is(
  (select count(*) from public.maintenance_work_orders where plan_id is not null),
  3::bigint,
  'generated work orders are stored once per plan due date'
);
select is(
  (select next_due_on from public.maintenance_plans),
  current_date + 7,
  'plan advances to its next future due date'
);
select is(
  public.generate_due_maintenance_work_orders(
    (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
    current_date
  ),
  0,
  'generation retry is idempotent'
);
select is(
  (select count(*) from public.maintenance_work_orders where plan_id is not null),
  3::bigint,
  'idempotent retry does not duplicate work orders'
);

create temporary table maintenance_manual_order as
select public.create_maintenance_work_order(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  (select (asset).id from maintenance_asset_created),
  null,
  '00000000-0000-0000-0000-0000000002c1',
  '00000000-0000-0000-0000-0000000002a1',
  'corrective',
  'high',
  'Corregir ruido en puerta del ascensor',
  'Revisar el mecanismo de la puerta y documentar la corrección.',
  now(),
  current_date + 1
) as work_order;

select is(
  (select (work_order).status from maintenance_manual_order),
  'draft'::public.maintenance_work_order_status,
  'manual work order starts as a draft'
);
select throws_like(
  format(
    'select public.transition_maintenance_work_order(%L::uuid,%L::uuid,%L,null,1)',
    (select payload #>> '{condominium,id}' from maintenance_workspace),
    (select (work_order).id::text from maintenance_manual_order),
    'in_progress'
  ),
  '%invalid maintenance work order transition%',
  'invalid lifecycle jump is rejected'
);

create temporary table maintenance_scheduled_order as
select public.transition_maintenance_work_order(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  (select (work_order).id from maintenance_manual_order),
  'scheduled',
  null,
  1
) as work_order;

select is(
  (select (work_order).status from maintenance_scheduled_order),
  'scheduled'::public.maintenance_work_order_status,
  'draft work order can be scheduled'
);

create temporary table maintenance_started_order as
select public.transition_maintenance_work_order(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  (select (work_order).id from maintenance_scheduled_order),
  'in_progress',
  null,
  2
) as work_order;

select ok(
  (select (work_order).started_at is not null from maintenance_started_order),
  'starting work records the lifecycle timestamp'
);

create temporary table maintenance_log_created as
select public.add_maintenance_service_log(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  (select (work_order).id from maintenance_started_order),
  current_date,
  'Se ajustó el mecanismo y se verificaron tres ciclos de apertura.',
  '00000000-0000-0000-0000-0000000002c1',
  '00000000-0000-0000-0000-0000000002a1',
  null,
  90,
  250,
  'USD',
  'SERVICE-001',
  '{"cycles_tested":3}'::jsonb
) as service_log;

select is(
  (select (service_log).service_amount from maintenance_log_created),
  250.00::numeric,
  'service history records an amount with its own currency'
);
select is(
  (select count(*) from public.maintenance_events where event_type = 'service_logged'),
  1::bigint,
  'service history entry is audited'
);
select throws_like(
  format(
    'select public.add_maintenance_service_log(%L::uuid,%L::uuid,current_date,%L,%L::uuid,%L::uuid,null,30,25,null,null,%L::jsonb)',
    (select payload #>> '{condominium,id}' from maintenance_workspace),
    (select (work_order).id::text from maintenance_started_order),
    'Registro sin moneda',
    '00000000-0000-0000-0000-0000000002c1',
    '00000000-0000-0000-0000-0000000002a1',
    '{}'
  ),
  '%maintenance service amount and currency must be provided together%',
  'service amount cannot exist without currency'
);

create temporary table maintenance_completed_order as
select public.transition_maintenance_work_order(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  (select (work_order).id from maintenance_started_order),
  'completed',
  'Mecanismo ajustado y ascensor probado correctamente.',
  3
) as work_order;

select is(
  (select (work_order).status from maintenance_completed_order),
  'completed'::public.maintenance_work_order_status,
  'work order completes with a summary'
);
select lives_ok(
  $test$
  do $block$
  begin
    begin
      update public.maintenance_service_logs
      set summary = 'Contenido alterado'
      where id = (select (service_log).id from maintenance_log_created);
    exception when others then
      null;
    end;

    if (
      select summary from public.maintenance_service_logs
      where id = (select (service_log).id from maintenance_log_created)
    ) is distinct from 'Se ajustó el mecanismo y se verificaron tres ciclos de apertura.' then
      raise exception 'maintenance service log mutated';
    end if;
  end
  $block$
  $test$,
  'service history remains immutable'
);

create temporary table maintenance_retired_asset as
select public.update_maintenance_asset(
  (select (payload #>> '{condominium,id}')::uuid from maintenance_workspace),
  (select (asset).id from maintenance_asset_created),
  'ASC-01',
  'Ascensor principal',
  'Ascensores',
  '00000000-0000-0000-0000-0000000002b1',
  null,
  'Otis',
  'Gen2',
  'SERIAL-ASC-001',
  current_date - 365,
  current_date + 365,
  'Lobby de la torre',
  'Equipo reemplazado al final de su vida útil',
  'retired',
  1
) as asset;

select is(
  (select (asset).status from maintenance_retired_asset),
  'retired'::public.maintenance_asset_status,
  'asset retirement is recorded instead of deleting history'
);
select is(
  (select is_active from public.maintenance_plans),
  false,
  'retiring an asset deactivates its recurring plan'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a2', true);
select is(
  (select count(*) from public.maintenance_assets),
  0::bigint,
  'outsider cannot read maintenance assets'
);
select is(
  (select count(*) from public.maintenance_work_orders),
  0::bigint,
  'outsider cannot read maintenance work orders'
);
select throws_like(
  format(
    'select public.generate_due_maintenance_work_orders(%L::uuid,current_date)',
    (select payload #>> '{condominium,id}' from maintenance_workspace)
  ),
  '%maintenance generation denied%',
  'outsider cannot generate maintenance work orders'
);

select * from finish();
rollback;
