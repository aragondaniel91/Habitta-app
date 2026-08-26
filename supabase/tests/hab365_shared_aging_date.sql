begin;
select plan(15);

select has_function('public','receivable_aging_date',
  array['date','date','receivable_item_type'],'the shared aging date helper exists');

-- The rule itself, before any data is involved.
select is(public.receivable_aging_date(null,'2026-01-10'::date,'late_fee'),'2026-01-10'::date,
  'a late fee with no due date ages from its issue date');
select is(public.receivable_aging_date(null,'2026-01-10'::date,'opening_balance'),'2026-01-10'::date,
  'an opening balance keeps the HAB-344 fallback');
select is(public.receivable_aging_date(null,'2026-01-10'::date,'charge'),null,
  'an ordinary charge with no due date is still not yet due');
select is(public.receivable_aging_date('2026-02-01'::date,'2026-01-10'::date,'late_fee'),'2026-02-01'::date,
  'an explicit due date always wins');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('73650000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@hab365.test','x',now(),now());
insert into public.organizations(id,name,created_by) values
('73651000-0000-0000-0000-000000000001','HAB365 Org','73650000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values
('73652000-0000-0000-0000-000000000001','73651000-0000-0000-0000-000000000001','HAB365 Condo','73650000-0000-0000-0000-000000000001');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('73652000-0000-0000-0000-000000000001','73650000-0000-0000-0000-000000000001','condominium_admin');
insert into public.units(id,condominium_id,code,type,created_by) values
('73653000-0000-0000-0000-000000000001','73652000-0000-0000-0000-000000000001','A-1','apartment','73650000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values
('73655000-0000-0000-0000-000000000001','73652000-0000-0000-0000-000000000001','MANUAL','Manual charge','other','73650000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','73650000-0000-0000-0000-000000000001',true);

-- A source charge that fell due long ago, then a late fee raised on it 200 days back. The fee is
-- posted with due_date = null, which is what used to keep it out of every aged bucket.
select lives_ok(format($sql$
  select public.create_receivable_item(
    '73652000-0000-0000-0000-000000000001','73653000-0000-0000-0000-000000000001',
    '73655000-0000-0000-0000-000000000001','Cuota vencida','100.00','USD','%s','%s')
$sql$, (current_date - 260)::text, (current_date - 250)::text),
  'an overdue source charge exists');

select lives_ok(
  $$select public.update_late_fee_settings(
    '73652000-0000-0000-0000-000000000001',true,10.00,0,null,'VES',true)$$,
  'a 10 percent late-fee policy is enabled');

select is(
  public.apply_late_fees('73652000-0000-0000-0000-000000000001',(current_date - 200)::date),
  1,
  'one late fee is raised, dated 200 days ago');

select is(
  (select count(*) from public.receivable_items
   where item_type='late_fee' and due_date is null
     and condominium_id='73652000-0000-0000-0000-000000000001'),
  1::bigint,
  'the late fee really does carry no due date');

-- 100.00 source + 10.00 fee, both owed for far more than 90 days.
select is(
  (select over_90 from public.get_receivables_aging('73652000-0000-0000-0000-000000000001')
   where currency_code='USD'),
  '110.00',
  'the late fee ages with the debt it belongs to instead of sitting in the current bucket');
select is(
  (select current_amount from public.get_receivables_aging('73652000-0000-0000-0000-000000000001')
   where currency_code='USD'),
  '0.00',
  'nothing is left reported as current');
select is(
  (select overdue_amount from public.get_receivables_summary('73652000-0000-0000-0000-000000000001')
   where currency_code='USD'),
  '110.00',
  'the summary card now agrees with the aging panel');

-- HAB-344 decided that an ordinary charge awaiting a due date stays current. Not reopened here.
select lives_ok(format($sql$
  select public.create_receivable_item(
    '73652000-0000-0000-0000-000000000001','73653000-0000-0000-0000-000000000001',
    '73655000-0000-0000-0000-000000000001','Cargo sin vencimiento','30.00','VES','%s',null)
$sql$, (current_date - 120)::text),
  'an ordinary charge with no due date is posted 120 days ago');
select is(
  (select current_amount from public.get_receivables_aging('73652000-0000-0000-0000-000000000001')
   where currency_code='VES'),
  '30.00',
  'it stays current, exactly as HAB-344 decided');

-- The invariant that was broken: both RPCs must describe the same money the same way.
select is(
  (select (overdue_amount::numeric + upcoming_amount::numeric)
   from public.get_receivables_summary('73652000-0000-0000-0000-000000000001') where currency_code='USD'),
  (select (current_amount::numeric + days_1_30::numeric + days_31_60::numeric
           + days_61_90::numeric + over_90::numeric)
   from public.get_receivables_aging('73652000-0000-0000-0000-000000000001') where currency_code='USD'),
  'the summary and the aging panel account for exactly the same outstanding total');

select * from finish();
rollback;
