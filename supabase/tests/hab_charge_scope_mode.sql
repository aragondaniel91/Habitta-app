begin;
select plan(16);

select has_function('public','set_condominium_charge_scope',
 array['uuid','condominium_charge_scope'], 'authorized billing-mode RPC exists');
select ok(
 not has_function_privilege('anon',
 'public.set_condominium_charge_scope(uuid,public.condominium_charge_scope)'::regprocedure,'EXECUTE'),
 'anonymous user cannot execute the mode-selection RPC'
);
select ok(
 has_function_privilege('authenticated',
 'public.set_condominium_charge_scope(uuid,public.condominium_charge_scope)'::regprocedure,'EXECUTE'),
 'authenticated role can invoke the RPC subject to condominium authorization'
);

insert into auth.users (
 id,instance_id,aud,role,email,encrypted_password,raw_user_meta_data,
 created_at,updated_at
) values
 ('00000000-0000-0000-0000-000000000606',
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'hab606-owner@test.local','x','{}'::jsonb,now(),now()),
 ('00000000-0000-0000-0000-000000000607',
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'hab606-admin@test.local','x','{}'::jsonb,now(),now()),
 ('00000000-0000-0000-0000-000000000608',
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'hab606-outsider@test.local','x','{}'::jsonb,now(),now()),
 ('00000000-0000-0000-0000-000000000609',
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'hab606-other-tenant-owner@test.local','x','{}'::jsonb,now(),now());

insert into public.organizations (id,name,organization_type,created_by)
values ('60600000-0000-4000-8000-000000000001',
 'HAB606 Organization','independent','00000000-0000-0000-0000-000000000606');

insert into public.organizations (id,name,organization_type,created_by)
values ('60600000-0000-4000-8000-000000000002',
 'HAB606 Other Tenant','independent','00000000-0000-0000-0000-000000000609');

insert into public.organization_memberships (organization_id,user_id,role)
values ('60600000-0000-4000-8000-000000000001',
 '00000000-0000-0000-0000-000000000606','organization_owner');

insert into public.organization_memberships (organization_id,user_id,role)
values ('60600000-0000-4000-8000-000000000002',
 '00000000-0000-0000-0000-000000000609','organization_owner');

insert into public.condominiums (
 id,organization_id,name,country_code,city,timezone,primary_currency_code,
 property_topology,declared_unit_count,declared_building_count,created_by
) values
 ('60600000-0000-4000-8000-000000000010',
 '60600000-0000-4000-8000-000000000001','La Muchachera','VE',
 'Caracas','America/Caracas','USD','multi_building_complex',null,10,
 '00000000-0000-0000-0000-000000000606'),
 ('60600000-0000-4000-8000-000000000020',
 '60600000-0000-4000-8000-000000000001','Casas','VE',
 'Caracas','America/Caracas','USD','house_community',10,null,
 '00000000-0000-0000-0000-000000000606'),
 ('60600000-0000-4000-8000-000000000030',
 '60600000-0000-4000-8000-000000000001','Legacy Apartment Towers','VE',
 'Caracas','America/Caracas','USD','multi_building_complex',20,2,
 '00000000-0000-0000-0000-000000000606'),
 ('60600000-0000-4000-8000-000000000040',
 '60600000-0000-4000-8000-000000000001','Admin Managed Towers','VE',
 'Caracas','America/Caracas','USD','multi_building_complex',null,2,
 '00000000-0000-0000-0000-000000000606'),
 ('60600000-0000-4000-8000-000000000050',
 '60600000-0000-4000-8000-000000000002','Other Tenant Towers','VE',
 'Caracas','America/Caracas','USD','multi_building_complex',null,2,
 '00000000-0000-0000-0000-000000000609');

insert into public.condominium_memberships (condominium_id,user_id,role)
values ('60600000-0000-4000-8000-000000000040',
 '00000000-0000-0000-0000-000000000607','condominium_admin');

insert into public.units(condominium_id,code,type,created_by)
values ('60600000-0000-4000-8000-000000000030',
 'A-101','apartment','00000000-0000-0000-0000-000000000606');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000608',true);
select throws_ok(
 $$select public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000010','building')$$,
 '42501','condominium structure administrator required',
 'unrelated user cannot configure another condominium'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000606',true);
select is(
 public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000010','building')->>'charge_scope',
 'building','organization owner selects building-level charging before any units exist'
);
select is(
 (select charge_scope::text from public.condominiums
  where id='60600000-0000-4000-8000-000000000010'),
 'building','billing mode selection persists in the authoritative record'
);
select lives_ok(
 $$select public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000010','building')$$,
 'repeating the same setting is idempotent'
);
select throws_ok(
 $$select public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000020','building')$$,
 '22023','whole-building billing requires a multi-building condominium',
 'houses cannot be misconfigured as building-level condominium accounts'
);
select throws_ok(
 $$select public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000030','building')$$,
 '23514','charge scope cannot change after units exist',
 'existing apartment billing cannot be changed after registration'
);
select is(
 (select charge_scope::text from public.condominiums
  where id='60600000-0000-4000-8000-000000000030'),
 'unit','legacy billing scope stays intact after blocked conversion'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000607',true);
select is(
 public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000040','building')->>'charge_scope',
 'building','authorized condominium administrator may select mode for an empty condominium'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000609',true);
select is(
 public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000050','building')->>'charge_scope',
 'building','other-tenant owner can configure that tenant''s own whole-building billing scope'
);
select throws_ok(
 $$select public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000040','unit')$$,
 '42501','condominium structure administrator required',
 'an owner in another tenant cannot change whole-building billing scope'
);
reset role;
select is(
 (select charge_scope::text from public.condominiums
  where id='60600000-0000-4000-8000-000000000040'),
 'building','cross-tenant denial preserves the authorized billing scope'
);
insert into public.buildings(id,condominium_id,name,created_by)
values ('60600000-0000-4000-8000-000000000101',
 '60600000-0000-4000-8000-000000000010',
 'Edificio 1','00000000-0000-0000-0000-000000000606');
insert into public.units(condominium_id,building_id,code,type,created_by)
values ('60600000-0000-4000-8000-000000000010',
 '60600000-0000-4000-8000-000000000101',
 'Edificio 1','building','00000000-0000-0000-0000-000000000606');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000606',true);
select throws_ok(
 $$select public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000010','unit')$$,
 '23514','charge scope cannot change after units exist',
 'building account keeps its financial identity even if an owner requests a change'
);
set local role anon;
select throws_ok(
 $$select public.set_condominium_charge_scope('60600000-0000-4000-8000-000000000010','building')$$,
 '42501','permission denied for function set_condominium_charge_scope',
 'anonymous caller is denied at the privilege boundary'
);
reset role;


select * from finish();
rollback;
