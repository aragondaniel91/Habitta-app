begin;
select plan(13);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('46100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','retention@habitta.test','x',now(),now());

insert into public.organizations(id,name,created_by) values
('46110000-0000-4000-8000-000000000001','HAB461 Retention','46100000-0000-4000-8000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values
('46120000-0000-4000-8000-000000000001','46110000-0000-4000-8000-000000000001','HAB461 Condo','46100000-0000-4000-8000-000000000001');
insert into public.units(id,condominium_id,code,type,created_by) values
('46130000-0000-4000-8000-000000000001','46120000-0000-4000-8000-000000000001','R-1','apartment','46100000-0000-4000-8000-000000000001');
insert into public.condominium_payment_methods(
  id,condominium_id,method_type,display_name,currency_code,requires_reference,requires_proof,is_active,created_by
) values
('46140000-0000-4000-8000-000000000001','46120000-0000-4000-8000-000000000001','cash','Retention cash','USD',false,false,true,'46100000-0000-4000-8000-000000000001');

insert into public.payments(
  id,condominium_id,unit_id,submitted_by_user_id,payment_method_id,status,payment_date,
  original_amount,original_currency_code,payer_name,idempotency_key
) values
('46150000-0000-4000-8000-000000000001','46120000-0000-4000-8000-000000000001','46130000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000001','46140000-0000-4000-8000-000000000001','draft',current_date,10,'USD','Retention','hab461-old'),
('46150000-0000-4000-8000-000000000002','46120000-0000-4000-8000-000000000001','46130000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000001','46140000-0000-4000-8000-000000000001','draft',current_date,10,'USD','Retention','hab461-recent'),
('46150000-0000-4000-8000-000000000003','46120000-0000-4000-8000-000000000001','46130000-0000-4000-8000-000000000001','46100000-0000-4000-8000-000000000001','46140000-0000-4000-8000-000000000001','draft',current_date,10,'USD','Retention','hab461-active');

-- Active successors first so the immutable supersession link can reference an existing proof.
insert into public.payment_proofs(
  id,condominium_id,payment_id,object_key,original_filename,content_type,size_bytes,sha256,uploaded_by,created_at
) values
('46160000-0000-4000-8000-000000000001','46120000-0000-4000-8000-000000000001','46150000-0000-4000-8000-000000000001','payments/461-active-old','active.pdf','application/pdf',10,repeat('a',64),'46100000-0000-4000-8000-000000000001',now()),
('46160000-0000-4000-8000-000000000002','46120000-0000-4000-8000-000000000001','46150000-0000-4000-8000-000000000002','payments/461-active-recent','active.pdf','application/pdf',10,repeat('b',64),'46100000-0000-4000-8000-000000000001',now()),
('46160000-0000-4000-8000-000000000003','46120000-0000-4000-8000-000000000001','46150000-0000-4000-8000-000000000003','payments/461-active-only','active.pdf','application/pdf',10,repeat('c',64),'46100000-0000-4000-8000-000000000001',now() - interval '11 years');

insert into public.payment_proofs(
  id,condominium_id,payment_id,object_key,original_filename,content_type,size_bytes,sha256,uploaded_by,
  created_at,superseded_at,superseded_by_proof_id
) values
('46161000-0000-4000-8000-000000000001','46120000-0000-4000-8000-000000000001','46150000-0000-4000-8000-000000000001','payments/461-expired','old.pdf','application/pdf',10,repeat('d',64),'46100000-0000-4000-8000-000000000001',now() - interval '11 years',now() - interval '10 years 1 day','46160000-0000-4000-8000-000000000001'),
('46161000-0000-4000-8000-000000000002','46120000-0000-4000-8000-000000000001','46150000-0000-4000-8000-000000000002','payments/461-recent','old.pdf','application/pdf',10,repeat('e',64),'46100000-0000-4000-8000-000000000001',now() - interval '10 years',now() - interval '9 years','46160000-0000-4000-8000-000000000002');

select ok(to_regclass('habitta_internal.payment_proof_storage_lifecycle') is not null,'internal storage lifecycle table exists');
select ok(to_regprocedure('public.list_expired_payment_proof_objects(integer)') is not null,'eligible-proof RPC exists');
select ok(to_regprocedure('public.record_payment_proof_storage_cleanup(uuid,boolean,text)') is not null,'cleanup audit RPC exists');
select ok(not has_function_privilege('authenticated','public.list_expired_payment_proof_objects(integer)','execute'),'authenticated cannot run retention cleanup');
select ok(has_function_privilege('service_role','public.list_expired_payment_proof_objects(integer)','execute'),'service role can list eligible cleanup objects');

select is(
  (select count(*) from public.list_expired_payment_proof_objects(100) where proof_id='46161000-0000-4000-8000-000000000001'),
  1::bigint,
  'superseded proof older than ten years is eligible'
);
select is(
  (select count(*) from public.list_expired_payment_proof_objects(100) where proof_id='46161000-0000-4000-8000-000000000002'),
  0::bigint,
  'recent superseded proof remains retained'
);
select is(
  (select count(*) from public.list_expired_payment_proof_objects(100) where proof_id='46160000-0000-4000-8000-000000000003'),
  0::bigint,
  'active proof is never eligible regardless of object age'
);

select lives_ok(
  $$select public.record_payment_proof_storage_cleanup('46161000-0000-4000-8000-000000000001',false,'r2_delete_failed')$$,
  'failed cleanup is auditable and retryable'
);
select is(
  (select count(*) from public.list_expired_payment_proof_objects(100) where proof_id='46161000-0000-4000-8000-000000000001'),
  1::bigint,
  'failed cleanup remains eligible for retry'
);
select lives_ok(
  $$select public.record_payment_proof_storage_cleanup('46161000-0000-4000-8000-000000000001',true,null)$$,
  'successful cleanup is recorded idempotently'
);
select is(
  (select count(*) from public.list_expired_payment_proof_objects(100) where proof_id='46161000-0000-4000-8000-000000000001'),
  0::bigint,
  'successfully cleaned object no longer reappears in cleanup batches'
);
select is(
  (select count(*) from public.payment_proofs where id='46161000-0000-4000-8000-000000000001' and object_key='payments/461-expired'),
  1::bigint,
  'immutable payment-proof metadata survives storage cleanup'
);

select * from finish();
rollback;
