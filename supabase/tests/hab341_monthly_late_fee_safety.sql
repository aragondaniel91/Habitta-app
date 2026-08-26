begin;
select plan(12);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('73410000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@hab341.test','x',now(),now());

insert into public.organizations(id,name,created_by) values
('73411000-0000-0000-0000-000000000001','HAB341 Org','73410000-0000-0000-0000-000000000001');

insert into public.condominiums(id,organization_id,name,created_by) values
('73412000-0000-0000-0000-000000000001','73411000-0000-0000-0000-000000000001','HAB341 Condo','73410000-0000-0000-0000-000000000001');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('73410000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','board@hab341.test','x',now(),now());

insert into public.condominium_memberships(condominium_id,user_id,role) values
('73412000-0000-0000-0000-000000000001','73410000-0000-0000-0000-000000000001','condominium_admin'),
('73412000-0000-0000-0000-000000000001','73410000-0000-0000-0000-000000000002','board_member');

insert into public.units(id,condominium_id,code,type,created_by) values
('73413000-0000-0000-0000-000000000001','73412000-0000-0000-0000-000000000001','A-1','apartment','73410000-0000-0000-0000-000000000001');

insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values
('73414000-0000-0000-0000-000000000001','73412000-0000-0000-0000-000000000001','DUES','Cuota ordinaria','regular_dues','73410000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','73410000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.create_receivable_item(
    '73412000-0000-0000-0000-000000000001',
    '73413000-0000-0000-0000-000000000001',
    '73414000-0000-0000-0000-000000000001',
    'Julio 2026',100.00,'USD','2026-07-01','2026-07-10'
  )$$,
  'creates overdue source charge'
);

select lives_ok(
  $$select public.update_late_fee_settings(
    '73412000-0000-0000-0000-000000000001',true,2.00,0,null,'VES',true
  )$$,
  'enables a 2 percent monthly late-fee policy'
);

select is(
  (public.preview_late_fees('73412000-0000-0000-0000-000000000001','2026-08-20')->>'count')::integer,
  1,
  'preview identifies one chargeable overdue item for August'
);

select is(
  public.apply_late_fees('73412000-0000-0000-0000-000000000001','2026-08-20'),
  1,
  'first August run creates one late fee'
);

select is(
  (select period from public.late_fee_charges where condominium_id='73412000-0000-0000-0000-000000000001' limit 1),
  '2026-08-01'::date,
  'late-fee period is normalized to first day of month'
);

select is(
  public.apply_late_fees('73412000-0000-0000-0000-000000000001','2026-08-21'),
  0,
  'second run in same month cannot duplicate debt'
);

select is(
  (select count(*) from public.late_fee_charges where condominium_id='73412000-0000-0000-0000-000000000001'),
  1::bigint,
  'August still has exactly one late-fee charge'
);

select is(
  public.apply_late_fees('73412000-0000-0000-0000-000000000001','2026-09-01'),
  1,
  'next calendar month may generate the next monthly late fee'
);

select is(
  (select count(*) from public.receivable_items where condominium_id='73412000-0000-0000-0000-000000000001' and item_type::text='late_fee'),
  2::bigint,
  'only two monthly late-fee items exist after August and September'
);

-- Guards the API translates for the administrator. HAB-373 mapped both; prove the schema raises
-- them rather than trusting the map to still match.

select throws_ok(
  $$select public.apply_late_fees('73412000-0000-0000-0000-000000000001',null)$$,
  'P0001',
  'late fee generation date required',
  'a run without a date is refused before anything is written'
);

select set_config('request.jwt.claim.sub','73410000-0000-0000-0000-000000000002',true);
select throws_ok(
  $$select public.apply_late_fees('73412000-0000-0000-0000-000000000001','2026-09-15')$$,
  'P0001',
  'late fee generation denied',
  'a board member cannot raise late fees'
);
select throws_ok(
  $$select public.preview_late_fees('73412000-0000-0000-0000-000000000001','2026-09-15')$$,
  'P0001',
  'late fee generation denied',
  'nor preview them'
);
select set_config('request.jwt.claim.sub','73410000-0000-0000-0000-000000000001',true);

select * from finish();
rollback;
