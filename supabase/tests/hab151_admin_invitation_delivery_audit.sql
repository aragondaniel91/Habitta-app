begin;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
(
  'a1510000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hab151-admin@test.local', 'x', now(), now()
),
(
  'a1510000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hab151-other@test.local', 'x', now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1510000-0000-0000-0000-000000000001', true);

create temporary table hab151_workspace as
select public.create_admin_workspace(
  'HAB-151 Transactional Invitation',
  'independent',
  'HAB-151 Condominium',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-151'
) as payload;

create temporary table hab151_invitation as
select public.create_admin_invitation(
  (select (payload #>> '{condominium,id}')::uuid from hab151_workspace),
  'hab151-invitee@test.local',
  'assistant',
  now() + interval '7 days'
) as payload;

select lives_ok(
  format(
    'select public.record_admin_invitation_delivery(%L::uuid,%L,%L,%L,null,%L)',
    (select payload #>> '{invitation,id}' from hab151_invitation),
    'sent',
    'zeptomail',
    'live',
    'provider-151'
  ),
  'invitation creator can audit an intentional live transactional email'
);

select is(
  (
    select event_type
    from public.admin_invitation_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab151_invitation)
      and event_type = 'email_sent'
    order by occurred_at desc
    limit 1
  ),
  'email_sent',
  'delivery result is stored as a dedicated invitation audit event'
);

select is(
  (
    select condominium_id
    from public.admin_invitation_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab151_invitation)
      and event_type = 'email_sent'
    order by occurred_at desc
    limit 1
  ),
  (select (payload #>> '{condominium,id}')::uuid from hab151_workspace),
  'delivery audit remains scoped to the invitation condominium'
);

select ok(
  not exists (
    select 1
    from public.admin_invitation_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab151_invitation)
      and event_type = 'email_sent'
      and (metadata ? 'email' or metadata::text like '%hab151-invitee@test.local%')
  ),
  'delivery audit metadata does not duplicate the recipient email'
);

select set_config('request.jwt.claim.sub', 'a1510000-0000-0000-0000-000000000002', true);
select throws_ok(
  format(
    'select public.record_admin_invitation_delivery(%L::uuid,%L,%L,%L,null,null)',
    (select payload #>> '{invitation,id}' from hab151_invitation),
    'failed',
    'zeptomail',
    'live'
  ),
  'P0001',
  'invitation delivery audit denied',
  'another authenticated user cannot forge the delivery audit'
);

select set_config('request.jwt.claim.sub', 'a1510000-0000-0000-0000-000000000001', true);
select throws_ok(
  format(
    'select public.record_admin_invitation_delivery(%L::uuid,%L,%L,%L,null,null)',
    (select payload #>> '{invitation,id}' from hab151_invitation),
    'queued',
    'zeptomail',
    'live'
  ),
  'P0001',
  'invalid invitation delivery status',
  'only explicit terminal delivery states can be audited'
);

select * from finish();
rollback;
