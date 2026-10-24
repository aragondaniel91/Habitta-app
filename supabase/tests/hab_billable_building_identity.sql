begin;
select plan(19);

select has_type('public','condominium_charge_scope','charge scope enum exists');
select has_column('public','condominiums','charge_scope','condominium stores explicit billing target');
select is(
  (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
     join pg_namespace n on n.oid=t.typnamespace
   where n.nspname='public' and t.typname='unit_type' and e.enumlabel='building'),
  1::bigint,
  'building is a first-class unit type, not a fake apartment'
);

insert into auth.users (id, instance_id, aud, role, email,
 encrypted_password, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000504',
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'hab504@test.local','x','{}'::jsonb,now(),now());

insert into public.organizations (id,name,organization_type,created_by)
values ('50400000-0000-4000-8000-000000000001',
 'HAB 504 Billing Org','independent','00000000-0000-0000-0000-000000000504');

insert into public.condominiums (
 id,organization_id,name,country_code,city,timezone,
 primary_currency_code,property_topology,declared_unit_count,
 declared_building_count,charge_scope,created_by
) values
 ('50400000-0000-4000-8000-000000000010','50400000-0000-4000-8000-000000000001',
 'La Muchachera General','VE','Caracas','America/Caracas','USD',
 'multi_building_complex',null,2,'building','00000000-0000-0000-0000-000000000504'),
 ('50400000-0000-4000-8000-000000000020','50400000-0000-4000-8000-000000000001',
 'Legacy Apartments','VE','Caracas','America/Caracas','USD',
 'multi_building_complex',20,2,'unit','00000000-0000-0000-0000-000000000504'),
 ('50400000-0000-4000-8000-000000000030','50400000-0000-4000-8000-000000000001',
 'Building Apartments','VE','Caracas','America/Caracas','USD',
 'single_building',2,1,'unit','00000000-0000-0000-0000-000000000504'),
 ('50400000-0000-4000-8000-000000000040','50400000-0000-4000-8000-000000000001',
 'House Community','VE','Caracas','America/Caracas','USD',
 'house_community',2,null,'unit','00000000-0000-0000-0000-000000000504');

insert into public.buildings(id,condominium_id,name,created_by) values
 ('50400000-0000-4000-8000-000000000101','50400000-0000-4000-8000-000000000010',
  'Edificio 1','00000000-0000-0000-0000-000000000504'),
 ('50400000-0000-4000-8000-000000000102','50400000-0000-4000-8000-000000000010',
  'Edificio 2','00000000-0000-0000-0000-000000000504'),
 ('50400000-0000-4000-8000-000000000201','50400000-0000-4000-8000-000000000020',
  'Torre Legacy','00000000-0000-0000-0000-000000000504'),
 ('50400000-0000-4000-8000-000000000301','50400000-0000-4000-8000-000000000030',
  'Torre Residencial','00000000-0000-0000-0000-000000000504');

select is(
 (select charge_scope::text from public.condominiums where name='La Muchachera General'),
 'building','new general condo explicitly targets whole buildings'
);
select is(
 (select charge_scope::text from public.condominiums where name='Legacy Apartments'),
 'unit','existing multi-building mode keeps apartment billing'
);

select lives_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000010',
 '50400000-0000-4000-8000-000000000101','Edificio 1','building',
 '00000000-0000-0000-0000-000000000504')$$,
 'first physical building can be registered as exactly one billing unit'
);
select lives_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000010',
 '50400000-0000-4000-8000-000000000102','Edificio 2','building',
 '00000000-0000-0000-0000-000000000504')$$,
 'second physical building has a separate billing unit'
);
select is(
 (select count(*) from public.units where condominium_id='50400000-0000-4000-8000-000000000010'),
 2::bigint,'two buildings create two, not an apartment count of billing accounts'
);
select throws_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000010',
 '50400000-0000-4000-8000-000000000101','Duplicated Building','building',
 '00000000-0000-0000-0000-000000000504')$$,
 '23505',
 'duplicate key value violates unique constraint "units_one_billable_account_per_building"',
 'cannot bill the same physical building twice'
);
select throws_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000010',
 '50400000-0000-4000-8000-000000000201','Foreign Building','building',
 '00000000-0000-0000-0000-000000000504')$$,
 'P0001','unit and building must share condominium',
 'physical building from another condominium cannot be billed here'
);
select throws_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000010',
 '50400000-0000-4000-8000-000000000101','APT101','apartment',
 '00000000-0000-0000-0000-000000000504')$$,
 '23514','building billing cannot contain direct apartment or house accounts',
 'prevents apartment-level double billing inside general building mode'
);
select throws_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000020',
 '50400000-0000-4000-8000-000000000201','Fake Building','building',
 '00000000-0000-0000-0000-000000000504')$$,
 '23514','building billing requires multi-building general condominium scope',
 'legacy apartment mode cannot silently register building billing'
);
select throws_ok(
 $$update public.units set building_id='50400000-0000-4000-8000-000000000102'
 where condominium_id='50400000-0000-4000-8000-000000000010' and code='Edificio 1'$$,
 '23514','billable building identity is immutable',
 'moving a billable unit cannot move historical debt to another building'
);
select throws_ok(
 $$update public.condominiums set charge_scope='unit'
 where id='50400000-0000-4000-8000-000000000010'$$,
 '23514','charge scope cannot change after units exist',
 'charge scope cannot change after billing identities exist'
);
select lives_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000020',
 '50400000-0000-4000-8000-000000000201','A-101','apartment',
 '00000000-0000-0000-0000-000000000504')$$,
 'legacy multi-building apartments continue to function'
);
select lives_ok(
 $$insert into public.units(condominium_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000040','Casa 1','house',
 '00000000-0000-0000-0000-000000000504')$$,
 'house condominiums still bill houses without fake apartments'
);
select lives_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('50400000-0000-4000-8000-000000000030',
 '50400000-0000-4000-8000-000000000301','A-101','apartment',
 '00000000-0000-0000-0000-000000000504')$$,
 'single-building apartment billing remains valid'
);
select throws_ok(
 $$update public.condominiums set charge_scope='building'
 where id='50400000-0000-4000-8000-000000000030'$$,
 '23514','charge scope cannot change after units exist',
 'existing apartment condominium scope cannot be changed'
);
select is(
 (select count(*) from public.units
  where condominium_id in (
  '50400000-0000-4000-8000-000000000020',
  '50400000-0000-4000-8000-000000000030',
  '50400000-0000-4000-8000-000000000040')),
 3::bigint,'existing apartment and house account types remain unaffected'
);

select * from finish();
rollback;
