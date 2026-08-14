begin;
select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('a4010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab164-ro-admin@test.local', 'x', now(), now()),
  ('a4010000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab164-ro-tenant@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);

create temporary table hab164_ro_workspace as
select public.create_admin_workspace(
  'HAB-164 Read Only Org',
  'independent',
  'HAB-164 Read Only Condo',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  1,
  'Torre HAB-164 RO'
) as payload;

reset role;

insert into public.units (
  id, condominium_id, building_id, code, type, status, created_by
) values (
  'a4011000-0000-0000-0000-000000000001',
  (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace),
  (select (payload #>> '{building,id}')::uuid from hab164_ro_workspace),
  'RO-01', 'apartment', 'active',
  'a4010000-0000-0000-0000-000000000001'
);

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
) values (
  'a4012000-0000-0000-0000-000000000001',
  (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace),
  'a4010000-0000-0000-0000-000000000002',
  'Tenant', 'ReadOnly', 'hab164-ro-tenant@test.local', 'active',
  'a4010000-0000-0000-0000-000000000001'
);

insert into public.unit_occupancies (
  id, unit_id, person_id, occupancy_type, is_primary_contact, starts_at, created_by
) values (
  'a4013000-0000-0000-0000-000000000001',
  'a4011000-0000-0000-0000-000000000001',
  'a4012000-0000-0000-0000-000000000001',
  'tenant', true, current_date,
  'a4010000-0000-0000-0000-000000000001'
);

insert into public.condominium_memberships (condominium_id, user_id, role)
values (
  (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace),
  'a4010000-0000-0000-0000-000000000002',
  'tenant'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000001', true);

create temporary table hab164_admin_request as
select public.create_service_request(
  (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace),
  'a4011000-0000-0000-0000-000000000001',
  (
    select id from public.service_request_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace)
      and code = 'maintenance'
  ),
  'Solicitud creada por administración',
  'Fixture para validar que tenant solo puede leer.',
  'normal',
  'a4012000-0000-0000-0000-000000000001'
) as request_row;

insert into public.condominium_payment_methods (
  id, condominium_id, method_type, display_name, currency_code,
  account_holder, is_active, created_by
) values (
  'a4014000-0000-0000-0000-000000000001',
  (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace),
  'bank_transfer', 'Cuenta HAB-164 RO', 'USD',
  'Habitta Test', true, 'a4010000-0000-0000-0000-000000000001'
);

select is(
  public.is_tenant_only_for_condominium(
    (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace)
  ),
  false,
  'administrator is not classified as tenant-only'
);

select set_config('request.jwt.claim.sub', 'a4010000-0000-0000-0000-000000000002', true);

select is(
  public.is_tenant_only_for_condominium(
    (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace)
  ),
  true,
  'tenant with no additional role is classified as tenant-only'
);
select is(
  public.can_read_unit('a4011000-0000-0000-0000-000000000001'),
  true,
  'tenant retains read access to actively delegated unit'
);
select is(
  public.can_submit_payment('a4011000-0000-0000-0000-000000000001'),
  false,
  'tenant-only user receives no implicit payment submission authority'
);

select throws_ok(
  format(
    'select public.create_service_request(%L::uuid,%L::uuid,%L::uuid,%L,%L,%L::public.service_request_priority,%L::uuid)',
    (select payload #>> '{condominium,id}' from hab164_ro_workspace),
    'a4011000-0000-0000-0000-000000000001',
    (select id::text from public.service_request_categories
     where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab164_ro_workspace)
       and code = 'maintenance'),
    'Intento tenant',
    'Este insert debe ser bloqueado por el guard de tabla.',
    'normal',
    'a4012000-0000-0000-0000-000000000001'
  ),
  'P0001',
  'tenant access is read only',
  'tenant cannot create a service request'
);

select throws_ok(
  format(
    'select public.add_service_request_comment(%L::uuid,%L::uuid,%L,%L::public.service_request_visibility)',
    (select payload #>> '{condominium,id}' from hab164_ro_workspace),
    (select (request_row).id::text from hab164_admin_request),
    'Intento de comentario tenant',
    'public'
  ),
  'P0001',
  'tenant access is read only',
  'tenant cannot add service-request comments'
);

select throws_ok(
  format(
    'select public.record_service_request_attachment(%L::uuid,%L::uuid,null,%L::uuid,%L,%L,%L,1024,repeat(''a'',64),%L::public.service_request_visibility)',
    (select payload #>> '{condominium,id}' from hab164_ro_workspace),
    (select (request_row).id::text from hab164_admin_request),
    'a4015000-0000-0000-0000-000000000001',
    'requests/a4015000-0000-0000-0000-000000000001',
    'tenant-attempt.pdf',
    'application/pdf',
    'public'
  ),
  'P0001',
  'tenant access is read only',
  'tenant cannot attach a file to a service request'
);

select throws_ok(
  format(
    'select public.create_payment_draft(%L::uuid,%L::uuid,%L::uuid,null,current_date,25,%L,%L,null,null,%L)',
    (select payload #>> '{condominium,id}' from hab164_ro_workspace),
    'a4011000-0000-0000-0000-000000000001',
    'a4014000-0000-0000-0000-000000000001',
    'USD',
    'Tenant ReadOnly',
    'hab164-tenant-payment-attempt'
  ),
  'P0001',
  'tenant access is read only',
  'tenant cannot create a payment draft'
);

reset role;

select is(
  (select count(*) from public.service_request_attachments
   where uploaded_by = 'a4010000-0000-0000-0000-000000000002'),
  0::bigint,
  'blocked tenant attachment attempt leaves no metadata row behind'
);

select is(
  (select count(*) from public.payments
   where submitted_by_user_id = 'a4010000-0000-0000-0000-000000000002'),
  0::bigint,
  'blocked tenant payment attempt leaves no financial row behind'
);

select * from finish();
rollback;
