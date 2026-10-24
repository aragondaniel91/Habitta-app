begin;
select plan(7);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000707',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'hab707-owner@test.local','x',now(),now());

insert into public.organizations (id,name,organization_type,created_by)
values ('70700000-0000-4000-8000-000000000001',
 'HAB707 General','independent','00000000-0000-0000-0000-000000000707');
insert into public.organization_memberships (organization_id,user_id,role)
values ('70700000-0000-4000-8000-000000000001',
 '00000000-0000-0000-0000-000000000707','organization_owner');
insert into public.condominiums (
 id,organization_id,name,country_code,city,timezone,primary_currency_code,
 property_topology,charge_scope,declared_building_count,created_by
) values (
 '70700000-0000-4000-8000-000000000010',
 '70700000-0000-4000-8000-000000000001','General Edificios','VE',
 'Caracas','America/Caracas','USD','multi_building_complex','building',2,
 '00000000-0000-0000-0000-000000000707');
insert into public.buildings(id,condominium_id,name,created_by) values
 ('70700000-0000-4000-8000-000000000101','70700000-0000-4000-8000-000000000010',
 'Edificio A','00000000-0000-0000-0000-000000000707'),
 ('70700000-0000-4000-8000-000000000102','70700000-0000-4000-8000-000000000010',
 'Edificio B','00000000-0000-0000-0000-000000000707');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000707',true);

select lives_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('70700000-0000-4000-8000-000000000010',
 '70700000-0000-4000-8000-000000000101','Edificio A','building',
 '00000000-0000-0000-0000-000000000707')$$,
 'authorized owner creates a billable building account through table RLS'
);
select is(
 (select count(*)::integer from public.units
 where condominium_id='70700000-0000-4000-8000-000000000010'), 1,
 'building account appears once to the authorized owner'
);
select throws_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('70700000-0000-4000-8000-000000000010',
 '70700000-0000-4000-8000-000000000101','Edificio A duplicate','building',
 '00000000-0000-0000-0000-000000000707')$$,
 '23505','duplicate key value violates unique constraint "units_one_billable_account_per_building"',
 'one physical building cannot create two receivable accounts'
);
select lives_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('70700000-0000-4000-8000-000000000010',
 '70700000-0000-4000-8000-000000000102','Edificio B','building',
 '00000000-0000-0000-0000-000000000707')$$,
 'second building has its own immutable accounting account'
);
select throws_ok(
 $$insert into public.units(condominium_id,building_id,code,type,created_by)
 values ('70700000-0000-4000-8000-000000000010',
 '70700000-0000-4000-8000-000000000102','A-101','apartment',
 '00000000-0000-0000-0000-000000000707')$$,
 '23514','building billing cannot contain direct apartment or house accounts',
 'an apartment account cannot be created in consolidated building mode'
);
select is(
 (select count(*)::integer from public.units
 where condominium_id='70700000-0000-4000-8000-000000000010'), 2,
 'two physical buildings have exactly two authorized billable accounts'
);
select throws_ok(
 $$update public.units set building_id='70700000-0000-4000-8000-000000000102'
 where condominium_id='70700000-0000-4000-8000-000000000010' and code='Edificio A'$$,
 '23514','billable building identity is immutable',
 'cannot move the financial identity to another building'
);

reset role;
select * from finish();
rollback;
