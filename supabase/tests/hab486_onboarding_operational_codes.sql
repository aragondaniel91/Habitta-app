begin;
select plan(17);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('48600000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operator486@habitta.test','x',now(),now()),
('48600000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ordinary486@habitta.test','x',now(),now()),
('48600000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','accepted486@cliente.test','x',now(),now()),
('48600000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','guided486@cliente.test','x',now(),now()),
('48600000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','self486@cliente.test','x',now(),now());

insert into public.platform_admins(user_id) values ('48600000-0000-0000-0000-000000000001');

insert into public.customer_invitations(
  id,email,plan_code,billing_period,token_hash,status,expires_at,created_by,delivery_status,
  accepted_at,accepted_by,revoked_at
) values
('48610000-0000-4000-8000-000000000001','failed486@cliente.test','esencial','monthly','hab486-failed','pending',now()+interval '7 days','48600000-0000-0000-0000-000000000001','failed',null,null,null),
('48610000-0000-4000-8000-000000000002','pending486@cliente.test','esencial','monthly','hab486-pending','pending',now()+interval '7 days','48600000-0000-0000-0000-000000000001','sent',null,null,null),
('48610000-0000-4000-8000-000000000003','expired486@cliente.test','esencial','monthly','hab486-expired','pending',now()-interval '1 hour','48600000-0000-0000-0000-000000000001','sent',null,null,null),
('48610000-0000-4000-8000-000000000004','revoked486@cliente.test','esencial','monthly','hab486-revoked','revoked',now()+interval '7 days','48600000-0000-0000-0000-000000000001','sent',null,null,now()),
('48610000-0000-4000-8000-000000000005','accepted486@cliente.test','esencial','monthly','hab486-accepted','accepted',now()+interval '7 days','48600000-0000-0000-0000-000000000001','sent',now(),'48600000-0000-0000-0000-000000000003',null);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48600000-0000-0000-0000-000000000002',true);
select throws_ok(
  $$select * from public.list_customer_invitations_for_platform()$$,
  '42501','platform administrator required','ordinary users cannot inspect Platform Admin operating codes'
);

select set_config('request.jwt.claim.sub','48600000-0000-0000-0000-000000000001',true);
select is((select blocker_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000001'),'email_delivery_failed','failed email is an explicit blocker');
select is((select next_action_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000001'),'resend_invitation','failed email tells the operator to resend');
select is((select blocker_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000002'),'awaiting_customer_acceptance','delivered invitation waits on the customer');
select is((select next_action_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000002'),'wait_customer_acceptance','delivered invitation has no invented operator work');
select is((select blocker_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000003'),'invitation_expired','expired invitation is derived authoritatively from the clock');
select is((select next_action_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000003'),'issue_new_invitation','expired invitation requires a new invitation');
select is((select blocker_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000004'),'invitation_revoked','revoked invitation remains auditable and blocked');
select is((select next_action_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000004'),'issue_new_invitation','revoked invitation can be replaced explicitly');
select is((select blocker_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000005'),'awaiting_workspace_completion','accepted customer is waiting on first-workspace completion');
select is((select next_action_code from public.list_customer_invitations_for_platform() where id='48610000-0000-4000-8000-000000000005'),'customer_complete_workspace','accepted customer owns the next onboarding step');

select set_config('hab486.guided_token', issued->>'token', true),
       set_config('hab486.guided_id', issued->>'id', true)
from (
  select public.create_customer_invitation_v2('guided486@cliente.test','plus','monthly','HAB-486-GUIDED',null,null) issued
) i;
select set_config('hab486.self_token', issued->>'token', true),
       set_config('hab486.self_id', issued->>'id', true)
from (
  select public.create_customer_invitation_v2('self486@cliente.test','esencial','annual','HAB-486-SELF',null,null) issued
) i;

select set_config('request.jwt.claim.sub','48600000-0000-0000-0000-000000000004',true);
select public.accept_customer_invitation_v2(current_setting('hab486.guided_token'));
select public.create_customer_invitation_workspace_v1(
  p_invitation_id => current_setting('hab486.guided_id')::uuid,
  p_idempotency_key => '48620000-0000-4000-8000-000000000001'::uuid,
  p_organization_name => 'Guided Org 486',
  p_organization_type => 'independent',
  p_condominium_name => 'Guided Condo 486',
  p_country_code => 'VE',
  p_address_line1 => 'Av Guided 486',
  p_city => 'Caracas',
  p_timezone => 'America/Caracas',
  p_primary_currency_code => 'VES',
  p_property_topology => 'house_community'::public.condominium_property_topology
);

select set_config('request.jwt.claim.sub','48600000-0000-0000-0000-000000000005',true);
select public.accept_customer_invitation_v2(current_setting('hab486.self_token'));
select public.create_customer_invitation_workspace_v1(
  p_invitation_id => current_setting('hab486.self_id')::uuid,
  p_idempotency_key => '48620000-0000-4000-8000-000000000002'::uuid,
  p_organization_name => 'Self Org 486',
  p_organization_type => 'independent',
  p_condominium_name => 'Self Condo 486',
  p_country_code => 'VE',
  p_address_line1 => 'Av Self 486',
  p_city => 'Caracas',
  p_timezone => 'America/Caracas',
  p_primary_currency_code => 'VES',
  p_property_topology => 'house_community'::public.condominium_property_topology
);

select set_config('request.jwt.claim.sub','48600000-0000-0000-0000-000000000001',true);
select is((select blocker_code from public.list_customer_invitations_for_platform() where id=current_setting('hab486.guided_id')::uuid),'pending_platform_activation','guided completion becomes an explicit Habitta blocker');
select is((select next_action_code from public.list_customer_invitations_for_platform() where id=current_setting('hab486.guided_id')::uuid),'complete_commercial_activation','guided completion hands off to commercial activation');
select ok((select guided_activation_pending from public.list_customer_invitations_for_platform() where id=current_setting('hab486.guided_id')::uuid),'guided activation indicator is safe and explicit');
select is((select blocker_code from public.list_customer_invitations_for_platform() where id=current_setting('hab486.self_id')::uuid),'none','completed self-service onboarding has no blocker');
select is((select next_action_code from public.list_customer_invitations_for_platform() where id=current_setting('hab486.self_id')::uuid),'open_customer_360','completed self-service onboarding hands off to Customer 360');
select ok(not (select guided_activation_pending from public.list_customer_invitations_for_platform() where id=current_setting('hab486.self_id')::uuid),'self-service trial does not masquerade as guided activation');

select * from finish();
rollback;
