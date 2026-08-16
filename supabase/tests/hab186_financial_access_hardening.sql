begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(id, email)
values
  ('18690000-0000-4000-8000-000000000001', 'hab186-access-admin@example.com'),
  ('18690000-0000-4000-8000-000000000002', 'hab186-access-user@example.com');

insert into public.organizations(id, name, created_by)
values (
  '18691000-0000-4000-8000-000000000001',
  'HAB-186 Access Organization',
  '18690000-0000-4000-8000-000000000001'
);

insert into public.condominiums(id, organization_id, name, created_by)
values (
  '18692000-0000-4000-8000-000000000001',
  '18691000-0000-4000-8000-000000000001',
  'HAB-186 Access Condominium',
  '18690000-0000-4000-8000-000000000001'
);

insert into public.units(id, condominium_id, code, type, created_by)
values (
  '18693000-0000-4000-8000-000000000001',
  '18692000-0000-4000-8000-000000000001',
  'SEC-186',
  'apartment',
  '18690000-0000-4000-8000-000000000001'
);

insert into public.people(
  id, condominium_id, auth_user_id, first_name, last_name,
  email, status, created_by
)
values (
  '18694000-0000-4000-8000-000000000001',
  '18692000-0000-4000-8000-000000000001',
  '18690000-0000-4000-8000-000000000002',
  'Acceso', 'Temporal', 'hab186-access-user@example.com', 'active',
  '18690000-0000-4000-8000-000000000001'
);

insert into public.unit_owners(
  unit_id, person_id, ownership_percentage, starts_at, created_by
)
values (
  '18693000-0000-4000-8000-000000000001',
  '18694000-0000-4000-8000-000000000001',
  100,
  current_date + 1,
  '18690000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18690000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'email', 'hab186-access-user@example.com'
  )::text,
  true
);

select ok(
  not public.can_read_financial_unit('18693000-0000-4000-8000-000000000001'),
  'future ownership does not grant financial access before its start date'
);

reset role;
update public.unit_owners
set starts_at = current_date
where unit_id = '18693000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18690000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'email', 'hab186-access-user@example.com'
  )::text,
  true
);

select ok(
  public.can_read_financial_unit('18693000-0000-4000-8000-000000000001'),
  'active ownership grants financial access'
);

reset role;
update public.unit_owners
set ends_at = current_date
where unit_id = '18693000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18690000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'email', 'hab186-access-user@example.com'
  )::text,
  true
);

select ok(
  public.can_read_financial_unit('18693000-0000-4000-8000-000000000001'),
  'ownership remains active through its inclusive end date'
);

reset role;
update public.unit_owners
set ends_at = current_date - 1
where unit_id = '18693000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '18690000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'email', 'hab186-access-user@example.com'
  )::text,
  true
);

select ok(
  not public.can_read_financial_unit('18693000-0000-4000-8000-000000000001'),
  'expired ownership no longer grants financial access'
);

select finish();
rollback;
