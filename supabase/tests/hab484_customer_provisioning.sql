begin;
select plan(20);

select has_column('public','customer_invitations','billing_period','customer invitations persist billing intent');
select has_column('public','customer_invitations','delivery_status','customer invitations persist delivery state');
select has_column('public','customer_invitations','onboarding_organization_id','customer invitations link to the provisioned customer');
select has_function('public','create_customer_invitation_v2',array['text','text','text','text','text','timestamp with time zone'],'v2 issuing RPC exists');
select has_function('public','get_customer_invitation_preview_v2',array['text'],'v2 preview RPC exists');
select has_function('public','accept_customer_invitation_v2',array['text'],'idempotent acceptance RPC exists');
select has_function('public','list_customer_invitations_for_platform',array[]::text[],'platform queue RPC exists');
select has_function('public','record_customer_invitation_delivery',array['uuid','boolean','text'],'delivery tracking RPC exists');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('48400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operador484@habitta.test','x',now(),now()),
('48400000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','piloto484@cliente.test','x',now(),now()),
('48400000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','intruso484@otro.test','x',now(),now());
insert into public.platform_admins(user_id) values ('48400000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.create_customer_invitation_v2('x@cliente.test','esencial','monthly',null,null,null)$$,
  '42501','platform administrator required',
  'ordinary users cannot issue customer invitations'
);
select throws_ok(
  $$select * from public.list_customer_invitations_for_platform()$$,
  '42501','platform administrator required',
  'ordinary users cannot inspect the prospect queue'
);

select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.create_customer_invitation_v2('piloto484@cliente.test','inventado','monthly',null,null,null)$$,
  '22023','public plan not found',
  'Platform Admin cannot invent a plan outside the catalogue'
);
select throws_ok(
  $$select public.create_customer_invitation_v2('piloto484@cliente.test','esencial','weekly',null,null,null)$$,
  '22023','billing period must be monthly or annual',
  'Platform Admin cannot invent a billing period'
);

select set_config('hab484.token', issued ->> 'token', true),
       set_config('hab484.id', issued ->> 'id', true)
from (
  select public.create_customer_invitation_v2(
    'piloto484@cliente.test','esencial','annual','PILOTO-484','Prueba piloto',null
  ) issued
) created;

select lives_ok(
  format($q$select public.record_customer_invitation_delivery('%s'::uuid,true,null)$q$, current_setting('hab484.id')),
  'the Worker can mark the invitation email as delivered using the operator JWT'
);
select is(
  (select billing_period from public.list_customer_invitations_for_platform() where id=current_setting('hab484.id')::uuid),
  'annual',
  'the Platform Admin queue returns the authoritative billing period'
);
select is(
  (select delivery_status from public.list_customer_invitations_for_platform() where id=current_setting('hab484.id')::uuid),
  'sent',
  'the Platform Admin queue returns delivery state without exposing the token'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is(
  (select public.get_customer_invitation_preview_v2(current_setting('hab484.token')) ->> 'billing_period'),
  'annual',
  'the pre-auth landing page receives the sold billing intent'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000003',true);
select throws_ok(
  format($q$select public.accept_customer_invitation_v2('%s')$q$, current_setting('hab484.token')),
  '42501','invitation belongs to another email',
  'a leaked invitation cannot be accepted by a different account'
);

select set_config('request.jwt.claim.sub','48400000-0000-0000-0000-000000000002',true);
select lives_ok(
  format($q$select public.accept_customer_invitation_v2('%s')$q$, current_setting('hab484.token')),
  'the invited email accepts its invitation'
);
select lives_ok(
  format($q$select public.accept_customer_invitation_v2('%s')$q$, current_setting('hab484.token')),
  'acceptance is idempotent for the same authenticated customer'
);

select lives_ok(
  format($q$
    select public.create_customer_invitation_workspace_v1(
      '%s'::uuid,
      '48400000-0000-4000-8000-000000000001'::uuid,
      'Administración Piloto 484',
      'independent',
      'Residencias Piloto 484',
      'VE',
      'Av. Piloto 484',
      'Caracas',
      'America/Caracas',
      'VES',
      'house_community'::public.condominium_property_topology,
      'USD',null,null,null,null,null,null,null,null,1,null,null
    )
  $q$, current_setting('hab484.id')),
  'an accepted Esencial invitation provisions the first customer workspace and trial atomically'
);

reset role;
select ok(
  (select onboarding_organization_id is not null and onboarding_condominium_id is not null and onboarding_completed_at is not null
     from public.customer_invitations where id=current_setting('hab484.id')::uuid),
  'the invitation is authoritatively linked to the created organization and condominium'
);
select is(
  (select s.status::text
     from public.customer_invitations ci
     join public.subscriptions s on s.condominium_id=ci.onboarding_condominium_id
    where ci.id=current_setting('hab484.id')::uuid),
  'trialing',
  'the pilot workspace receives a real SaaS trial, not a fabricated payment state'
);
select is(
  (select st.billing_period
     from public.customer_invitations ci
     join public.subscriptions s on s.condominium_id=ci.onboarding_condominium_id
     join public.subscription_terms st on st.subscription_id=s.id and st.effective_to is null
    where ci.id=current_setting('hab484.id')::uuid),
  'annual',
  'the subscription term preserves the billing period selected in Platform Admin'
);
select is(
  (select st.plan_code
     from public.customer_invitations ci
     join public.subscriptions s on s.condominium_id=ci.onboarding_condominium_id
     join public.subscription_terms st on st.subscription_id=s.id and st.effective_to is null
    where ci.id=current_setting('hab484.id')::uuid),
  'esencial',
  'the subscription term preserves the plan selected in Platform Admin'
);

select * from finish();
rollback;
