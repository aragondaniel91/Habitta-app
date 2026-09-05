begin;
select plan(24);

select has_column('public','customer_invitations','billing_period','billing intent is persisted');
select has_column('public','customer_invitations','delivery_status','delivery state is persisted');
select has_column('public','customer_invitations','onboarding_organization_id','workspace linkage is persisted');
select has_function('public','create_customer_invitation_v2',array['text','text','text','text','text','timestamp with time zone'],'v2 issuing RPC exists');
select has_function('public','get_customer_invitation_preview_v2',array['text'],'v2 preview RPC exists');
select has_function('public','accept_customer_invitation_v2',array['text'],'idempotent acceptance RPC exists');
select has_function('public','list_customer_invitations_for_platform',array[]::text[],'platform queue RPC exists');
select has_function('public','get_my_customer_onboarding_invitation',array[]::text[],'accepted invite recovery RPC exists');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('48400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operator484@habitta.test','x',now(),now()),
('48400000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pilot484@cliente.test','x',now(),now()),
('48400000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other484@cliente.test','x',now(),now());
insert into public.platform_admins(user_id) values ('48400000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.create_customer_invitation_v2('pilot484@cliente.test','esencial','annual',null,null,null)$$,
  '42501','platform administrator required','ordinary users cannot issue customer invitations'
);
select throws_ok(
  $$select * from public.list_customer_invitations_for_platform()$$,
  '42501','platform administrator required','ordinary users cannot list prospective customers'
);

select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.create_customer_invitation_v2('pilot484@cliente.test','esencial','annual','PILOT-484','Pilot customer',null)$$,
  'Platform Admin can issue a catalogue-backed invitation'
);
select set_config('hab484.token', issued->>'token', true),
       set_config('hab484.id', issued->>'id', true)
from (
  select public.create_customer_invitation_v2('pilot484@cliente.test','esencial','annual','PILOT-484B',null,null) issued
) i;
select is(
  (select billing_period from public.list_customer_invitations_for_platform() where id=current_setting('hab484.id')::uuid),
  'annual','queue preserves billing period'
);

reset role;
set local role anon;
select is(
  public.get_customer_invitation_preview_v2(current_setting('hab484.token'))->>'billing_period',
  'annual','pre-auth preview exposes only the commercial context required by the landing page'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000003',true);
select throws_ok(
  format($q$select public.accept_customer_invitation_v2('%s')$q$,current_setting('hab484.token')),
  '42501','invitation belongs to another email','wrong account cannot redeem the link'
);
select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000002',true);
select lives_ok(
  format($q$select public.accept_customer_invitation_v2('%s')$q$,current_setting('hab484.token')),
  'invited account can accept'
);
select lives_ok(
  format($q$select public.accept_customer_invitation_v2('%s')$q$,current_setting('hab484.token')),
  'acceptance is idempotent for the same user'
);
select is(
  public.get_my_customer_onboarding_invitation()->>'id',
  current_setting('hab484.id'),'accepted onboarding can be recovered without storing the raw token'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000001',true);
select lives_ok(
  format($q$select public.record_customer_invitation_delivery('%s'::uuid,true,null)$q$,current_setting('hab484.id')),
  'Platform Admin records successful email delivery'
);
select is(
  (select delivery_status from public.list_customer_invitations_for_platform() where id=current_setting('hab484.id')::uuid),
  'sent','delivery result is visible to Platform Admin'
);

select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.create_self_service_trial_workspace_v1(
    'Pilot Org 484','independent','Pilot Condo 484','VE','Av Pilot','Caracas','America/Caracas','VES',
    'house_community'::public.condominium_property_topology,'esencial','annual',
    '48400000-0000-4000-8000-000000000001'::uuid,'USD',null,null,null,null,null,null,null,null,1,null,null
  )$$,
  'accepted self-service customer provisions through the existing atomic trial onboarding'
);

reset role;
select ok(
  (select onboarding_organization_id is not null and onboarding_condominium_id is not null
     from public.customer_invitations where id=current_setting('hab484.id')::uuid),
  'the created customer is linked back to the invitation'
);
select is(
  (select st.plan_code
     from public.customer_invitations ci
     join public.subscriptions s on s.condominium_id=ci.onboarding_condominium_id
     join public.subscription_terms st on st.subscription_id=s.id and st.effective_to is null
    where ci.id=current_setting('hab484.id')::uuid),
  'esencial','trial terms preserve the invited plan'
);
select is(
  (select st.billing_period
     from public.customer_invitations ci
     join public.subscriptions s on s.condominium_id=ci.onboarding_condominium_id
     join public.subscription_terms st on st.subscription_id=s.id and st.effective_to is null
    where ci.id=current_setting('hab484.id')::uuid),
  'annual','trial terms preserve the invited billing period'
);
select is(
  (select s.status::text
     from public.customer_invitations ci
     join public.subscriptions s on s.condominium_id=ci.onboarding_condominium_id
    where ci.id=current_setting('hab484.id')::uuid),
  'trialing','pilot provisioning creates a real SaaS trial and no fake resident payment'
);

select * from finish();
rollback;
