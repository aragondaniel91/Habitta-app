begin;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000021601',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab216-admin@test.local', 'x',
    '{"full_name":"HAB-216 Admin"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000021602',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'hab216-other@test.local', 'x',
    '{"full_name":"HAB-216 Other"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021601', true);

create temporary table hab216_workspace as
select public.create_admin_workspace(
  'Habitta HAB-216 Org',
  'independent',
  'Condominio HAB-216',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  10,
  'Torre HAB-216'
) as payload;

create temporary table hab216_ids as
select
  (payload #>> '{condominium,id}')::uuid as condominium_id,
  (payload #>> '{building,id}')::uuid as building_id
from hab216_workspace;

reset role;

insert into public.units(id, condominium_id, building_id, code, type, status, created_by)
values (
  '00000000-0000-0000-0000-000000021610',
  (select condominium_id from hab216_ids),
  (select building_id from hab216_ids),
  'A-216', 'apartment', 'active',
  '00000000-0000-0000-0000-000000021601'
);

insert into public.people(
  id, condominium_id, first_name, last_name, email, status, created_by
) values (
  '00000000-0000-0000-0000-000000021611',
  (select condominium_id from hab216_ids),
  'Rosa', 'Residente', 'hab216-resident@test.local', 'active',
  '00000000-0000-0000-0000-000000021601'
);

insert into public.unit_owners(unit_id, person_id, is_primary_contact, created_by)
values (
  '00000000-0000-0000-0000-000000021610',
  '00000000-0000-0000-0000-000000021611',
  true,
  '00000000-0000-0000-0000-000000021601'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021601', true);

create temporary table hab216_invitation as
select public.create_resident_invitation(
  (select condominium_id from hab216_ids),
  '00000000-0000-0000-0000-000000021611',
  '00000000-0000-0000-0000-000000021610',
  'owner',
  null
) as payload;

select lives_ok(
  format(
    'select public.record_resident_invitation_delivery(%L::uuid,%L,%L,%L,null,%L)',
    (select payload #>> '{invitation,id}' from hab216_invitation),
    'sent',
    'zeptomail',
    'live',
    'provider-216'
  ),
  'invitation creator can record the terminal transactional delivery outcome'
);

select is(
  (
    select event_type
    from public.resident_invitation_delivery_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab216_invitation)
    order by sequence_number desc
    limit 1
  ),
  'email_sent',
  'sent transport state is persisted separately from invitation lifecycle'
);

select is(
  (
    select condominium_id
    from public.resident_invitation_delivery_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab216_invitation)
    order by sequence_number desc
    limit 1
  ),
  (select condominium_id from hab216_ids),
  'delivery event inherits the canonical invitation condominium'
);

select is(
  (
    select person_id
    from public.resident_invitation_delivery_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab216_invitation)
    order by sequence_number desc
    limit 1
  ),
  '00000000-0000-0000-0000-000000021611'::uuid,
  'delivery event inherits the canonical resident person'
);

select is(
  (
    select unit_id
    from public.resident_invitation_delivery_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab216_invitation)
    order by sequence_number desc
    limit 1
  ),
  '00000000-0000-0000-0000-000000021610'::uuid,
  'delivery event inherits the canonical unit'
);

select ok(
  not exists (
    select 1
    from public.resident_invitation_delivery_events e
    where e.invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab216_invitation)
      and (
        to_jsonb(e)::text like '%hab216-resident@test.local%'
        or to_jsonb(e)::text like '%' || (select payload ->> 'raw_token' from hab216_invitation) || '%'
      )
  ),
  'delivery audit never duplicates recipient email or raw invitation token'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.resident_invitation_delivery_events',
    'INSERT'
  ),
  'authenticated clients cannot insert delivery audit rows directly'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021602', true);
select is(
  (
    select count(*)
    from public.resident_invitation_delivery_events
    where invitation_id = (select (payload #>> '{invitation,id}')::uuid from hab216_invitation)
  ),
  0::bigint,
  'an unrelated authenticated user cannot read another condominium delivery audit'
);

select throws_ok(
  format(
    'select public.record_resident_invitation_delivery(%L::uuid,%L,%L,%L,null,null)',
    (select payload #>> '{invitation,id}' from hab216_invitation),
    'failed',
    'zeptomail',
    'live'
  ),
  'P0001',
  'resident invitation delivery audit denied',
  'another authenticated user cannot forge the delivery audit'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021601', true);
select throws_ok(
  format(
    'select public.record_resident_invitation_delivery(%L::uuid,%L,%L,%L,null,null)',
    (select payload #>> '{invitation,id}' from hab216_invitation),
    'queued',
    'zeptomail',
    'live'
  ),
  'P0001',
  'invalid resident invitation delivery status',
  'only terminal delivery states can be recorded'
);

reset role;
select throws_ok(
  format(
    'update public.resident_invitation_delivery_events set provider = %L where invitation_id = %L::uuid',
    'tampered-provider',
    (select payload #>> '{invitation,id}' from hab216_invitation)
  ),
  'P0001',
  'resident invitation delivery events are immutable',
  'delivery audit stays immutable even for privileged maintenance code'
);

select * from finish();
rollback;
