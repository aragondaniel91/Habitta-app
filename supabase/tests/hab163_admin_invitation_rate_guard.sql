begin;
select plan(3);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values (
  'a1630000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hab163-admin@test.local', 'x', now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1630000-0000-0000-0000-000000000001', true);

create temporary table hab163_workspace as
select public.create_admin_workspace(
  'HAB-163 Abuse Controls',
  'independent',
  'HAB-163 Condominium',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-163'
) as payload;

select lives_ok(
  $$
  do $inner$
  declare
    condo uuid := (select (payload #>> '{condominium,id}')::uuid from hab163_workspace);
  begin
    for i in 1..20 loop
      perform public.create_admin_invitation(
        condo,
        format('hab163-invite-%s@test.local', i),
        'assistant',
        now() + interval '7 days'
      );
    end loop;
  end
  $inner$
  $$,
  'first twenty administrator invitations within the window are allowed'
);

select is(
  (select count(*) from public.admin_invitations
   where invited_by = 'a1630000-0000-0000-0000-000000000001'
     and created_at > now() - interval '15 minutes'),
  20::bigint,
  'rate guard counts administrator invitations per authenticated actor'
);

select throws_ok(
  format(
    'select public.create_admin_invitation(%L::uuid,%L,%L,now() + interval ''7 days'')',
    (select payload #>> '{condominium,id}' from hab163_workspace),
    'hab163-invite-21@test.local',
    'assistant'
  ),
  'P0001',
  'admin invitation rate limit exceeded',
  'twenty-first administrator invitation inside fifteen minutes is rejected'
);

select * from finish();
rollback;
