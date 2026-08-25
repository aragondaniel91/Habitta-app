begin;
select plan(10);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('73440000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@hab344.test','x',now(),now());
insert into public.organizations(id,name,created_by) values
('73441000-0000-0000-0000-000000000001','HAB344 Org','73440000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values
('73442000-0000-0000-0000-000000000001','73441000-0000-0000-0000-000000000001','HAB344 Condo','73440000-0000-0000-0000-000000000001');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('73442000-0000-0000-0000-000000000001','73440000-0000-0000-0000-000000000001','condominium_admin');
insert into public.units(id,condominium_id,code,type,created_by) values
('73443000-0000-0000-0000-000000000001','73442000-0000-0000-0000-000000000001','A-1','apartment','73440000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values
('73445000-0000-0000-0000-000000000001','73442000-0000-0000-0000-000000000001','MANUAL','Manual charge','other','73440000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','73440000-0000-0000-0000-000000000001',true);

select lives_ok(format($sql$
  select public.import_opening_balances(
    '73442000-0000-0000-0000-000000000001',
    '[{"unit_code":"A-1","balance_type":"debit","amount":"40.00","currency_code":"USD","effective_date":"%s"}]',
    'hab344-legacy', 'legacy.csv')
$sql$, (current_date - 45)::text), 'legacy opening debit imports without due_date');
select is((select days_31_60 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='USD'),'40.00','legacy opening debit ages from effective/issue date');

select lives_ok(format($sql$
  select public.import_opening_balances(
    '73442000-0000-0000-0000-000000000001',
    '[{"unit_code":"A-1","balance_type":"debit","amount":"20.00","currency_code":"EUR","effective_date":"%s","due_date":"%s"}]',
    'hab344-due', 'due.csv')
$sql$, (current_date - 10)::text, (current_date - 95)::text), 'opening debit accepts explicit due_date');
select is((select over_90 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='EUR'),'20.00','explicit due_date controls aging bucket');
select is((select due_date::text from public.receivable_items where item_type='opening_balance' and currency_code='EUR'),(current_date - 95)::text,'explicit due_date is persisted on opening debit');

select lives_ok(format($sql$
  select public.import_opening_balances(
    '73442000-0000-0000-0000-000000000001',
    '[{"unit_code":"A-1","balance_type":"debit","amount":"15.00","currency_code":"GBP","effective_date":"%s","debt_date":"%s"}]',
    'hab344-debt-alias', 'debt.csv')
$sql$, (current_date - 5)::text, (current_date - 65)::text), 'opening debit accepts debt_date alias');
select is((select days_61_90 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='GBP'),'15.00','debt_date alias controls aging bucket');

select lives_ok($$select public.create_receivable_item('73442000-0000-0000-0000-000000000001','73443000-0000-0000-0000-000000000001','73445000-0000-0000-0000-000000000001','Manual no due',30.00,'VES',current_date-120,null)$$,'manual charge without due date remains allowed');
select is((select current_amount from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='VES'),'30.00','manual no-due charge remains current');
select is((select over_90 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='VES'),'0.00','manual no-due charge is not reclassified as overdue');

select * from finish();
rollback;
