begin;
select plan(4);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('a1631000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab163-owner@test.local', 'x', now(), now()),
  ('a1631000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab163-invitee@test.local', 'x', now(), now()),
  ('a1631000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab163-wrong@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1631000-0000-0000-0000-000000000001', true);

create temporary table hab163_negative_workspace as
select public.create_admin_workspace(
  'HAB-163 Invitation Safety',
  'independent',
  'HAB-163 Invitation Condo',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-163 Safety'
) as payload;

create temporary table hab163_wrong_email_invite as
select public.create_admin_invitation(
  (select (payload #>> '{condominium,id}')::uuid from hab163_negative_workspace),
  'hab163-invitee@test.local',
  'assistant',
  now() + interval '7 days'
) as payload;

select set_config('request.jwt.claim.sub', 'a1631000-0000-0000-0000-000000000003', true);
select throws_ok(
  format(
    'select public.accept_admin_invitation(%L)',
    (select payload ->> 'raw_token' from hab163_wrong_email_invite)
  ),
  'P0001',
  'invalid invitation',
  'authenticated user with a different email cannot accept the invitation'
);

select set_config('request.jwt.claim.sub', 'a1631000-0000-0000-0000-000000000001', true);
create temporary table hab163_revoked_invite as
select public.create_admin_invitation(
  (select (payload #>> '{condominium,id}')::uuid from hab163_negative_workspace),
  'hab163-invitee@test.local',
  'payment_reviewer',
  now() + interval '7 days'
) as payload;

select public.revoke_admin_invitation(
  (select (payload #>> '{invitation,id}')::uuid from hab163_revoked_invite)
);

select set_config('request.jwt.claim.sub', 'a1631000-0000-0000-0000-000000000002', true);
select throws_ok(
  format(
    'select public.accept_admin_invitation(%L)',
    (select payload ->> 'raw_token' from hab163_revoked_invite)
  ),
  'P0001',
  'invalid invitation',
  'revoked administrator invitation cannot be accepted'
);

-- Create the invitation as the real condominium administrator so the temp fixture remains
-- readable after returning to authenticated. Elevate only for the impossible-in-production
-- clock manipulation needed to exercise the expired path deterministically.
select set_config('request.jwt.claim.sub', 'a1631000-0000-0000-0000-000000000001', true);
create temporary table hab163_expired_invite as
select public.create_admin_invitation(
  (select (payload #>> '{condominium,id}')::uuid from hab163_negative_workspace),
  'hab163-invitee@test.local',
  'accountant',
  now() + interval '7 days'
) as payload;

reset role;
update public.admin_invitations
set expires_at = now() - interval '1 minute'
where id = (select (payload #>> '{invitation,id}')::uuid from hab163_expired_invite);

select is(
  public.get_admin_invitation_preview(
    (select payload ->> 'raw_token' from hab163_expired_invite)
  ) ->> 'status',
  'expired',
  'expired invitation preview reports expired before authentication'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1631000-0000-0000-0000-000000000002', true);
select throws_ok(
  format(
    'select public.accept_admin_invitation(%L)',
    (select payload ->> 'raw_token' from hab163_expired_invite)
  ),
  'P0001',
  'invalid invitation',
  'expired administrator invitation cannot be accepted'
);

select * from finish();
rollback;
