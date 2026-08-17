begin;
select plan(20);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at
)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab200-admin@test.local', 'x', '{"full_name":"HAB 200 Admin"}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab200-old-owner@test.local', 'x', '{"full_name":"Original Owner"}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab200-new-owner@test.local', 'x', '{"full_name":"New Owner"}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

create temporary table hab200_workspace as
select public.create_admin_workspace(
  'HAB-200 Organization', 'independent', 'HAB-200 Condominium', 'VE', 'Caracas',
  'America/Caracas', 'USD', 'VES', 1, 'Torre HAB-200'
) as payload;

reset role;

insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
values (
  '20000000-0000-0000-0000-000000000021',
  (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
  (select (payload #>> '{building,id}')::uuid from hab200_workspace),
  'A-01', 'apartment', 'active', '20000000-0000-0000-0000-000000000001'
);

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
)
values
  ('20000000-0000-0000-0000-000000000031', (select (payload #>> '{condominium,id}')::uuid from hab200_workspace), '20000000-0000-0000-0000-000000000011', 'Original', 'Owner', 'hab200-old-owner@test.local', 'active', '20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000032', (select (payload #>> '{condominium,id}')::uuid from hab200_workspace), '20000000-0000-0000-0000-000000000012', 'New', 'Owner', 'hab200-new-owner@test.local', 'active', '20000000-0000-0000-0000-000000000001');

insert into public.unit_owners (
  unit_id, person_id, ownership_percentage, is_primary_contact, starts_at, created_by
)
values (
  '20000000-0000-0000-0000-000000000021',
  '20000000-0000-0000-0000-000000000031',
  100, true, current_date - 30, '20000000-0000-0000-0000-000000000001'
);

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ((select (payload #>> '{condominium,id}')::uuid from hab200_workspace), '20000000-0000-0000-0000-000000000011', 'owner'),
  ((select (payload #>> '{condominium,id}')::uuid from hab200_workspace), '20000000-0000-0000-0000-000000000012', 'owner');

select has_table(
  'public', 'governance_eligibility_snapshots',
  'governance eligibility snapshot table exists'
);

select table_privs_are(
  'public', 'governance_eligibility_snapshots', 'authenticated', array['SELECT'],
  'authenticated users receive read-only snapshot table privileges'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

create temporary table hab200_proposal as
select public.create_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
  'Fachada HAB-200',
  'Decisión con elegibilidad congelada',
  'La elegibilidad debe permanecer estable aunque cambie la propiedad.',
  'improvement', 'one_per_unit', 50, 1000, 'USD', null,
  now() + interval '7 days',
  '[{"label":"Aprobar"},{"label":"Rechazar"}]'::jsonb,
  '[]'::jsonb
) as proposal;

select is(
  (public.transition_governance_proposal(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal), 'open', 1
  )).status::text,
  'open',
  'opening captures eligibility and opens voting atomically'
);

select is(
  (select count(*) from public.governance_eligibility_snapshots
   where proposal_id = (select (proposal).id from hab200_proposal)),
  1::bigint,
  'one eligible unit creates one snapshot entitlement'
);

select is(
  (select eligibility_count from public.governance_proposals
   where id = (select (proposal).id from hab200_proposal)),
  1,
  'proposal stores the frozen eligible entity count'
);

select is(
  (select eligibility_snapshot_source from public.governance_proposals
   where id = (select (proposal).id from hab200_proposal)),
  'lifecycle',
  'normal opening records lifecycle snapshot source'
);

reset role;

update public.unit_owners
set ends_at = current_date - 1
where unit_id = '20000000-0000-0000-0000-000000000021'
  and person_id = '20000000-0000-0000-0000-000000000031';

insert into public.unit_owners (
  unit_id, person_id, ownership_percentage, is_primary_contact, starts_at, created_by
)
values (
  '20000000-0000-0000-0000-000000000021',
  '20000000-0000-0000-0000-000000000032',
  100, true, current_date, '20000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000011', true);

select is(
  (public.get_governance_eligibility(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal)
  ) ->> 'eligible')::boolean,
  true,
  'original snapshotted owner retains the voting entitlement'
);

select is(
  jsonb_array_length(public.get_governance_eligibility(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal)
  ) -> 'units'),
  1,
  'original voter still sees the snapshotted unit after transfer'
);

select lives_ok(
  format(
    'select public.cast_governance_vote(%L::uuid, %L::uuid, %L::uuid, %L::uuid)',
    (select payload #>> '{condominium,id}' from hab200_workspace),
    (select (proposal).id::text from hab200_proposal),
    (select id::text from public.governance_options
     where proposal_id = (select (proposal).id from hab200_proposal)
     order by sort_order, id limit 1),
    '20000000-0000-0000-0000-000000000021'
  ),
  'original snapshotted voter can cast the preserved entitlement'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000012', true);

select is(
  (public.get_governance_eligibility(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal)
  ) ->> 'eligible')::boolean,
  false,
  'new owner is not retroactively added to an open vote'
);

select throws_ok(
  format(
    'select public.cast_governance_vote(%L::uuid, %L::uuid, %L::uuid, %L::uuid)',
    (select payload #>> '{condominium,id}' from hab200_workspace),
    (select (proposal).id::text from hab200_proposal),
    (select id::text from public.governance_options
     where proposal_id = (select (proposal).id from hab200_proposal)
     order by sort_order desc, id limit 1),
    '20000000-0000-0000-0000-000000000021'
  ),
  'P0001', 'snapshotted unit ownership required',
  'ownership acquired after opening cannot enter the existing vote'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select is(
  (public.get_governance_results(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal)
  ) ->> 'eligible_count')::integer,
  1,
  'ownership transfer cannot change the frozen quorum denominator'
);

select is(
  (public.get_governance_results(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal)
  ) ->> 'quorum_met')::boolean,
  true,
  'quorum uses the frozen denominator after ownership transfer'
);

reset role;
select throws_ok(
  format(
    'update public.governance_eligibility_snapshots set label = %L where proposal_id = %L::uuid',
    'Mutated', (select (proposal).id::text from hab200_proposal)
  ),
  'P0001', 'governance eligibility snapshot is immutable',
  'snapshot rows cannot be rewritten after capture'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select is(
  (public.transition_governance_proposal(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal), 'close', 2
  )).status::text,
  'closed',
  'snapshotted proposal closes normally'
);

select is(
  (public.transition_governance_proposal(
    (select (payload #>> '{condominium,id}')::uuid from hab200_workspace),
    (select (proposal).id from hab200_proposal), 'approve', 3
  )).status::text,
  'approved',
  'recorded winner can be certified and approved'
);

select ok(
  (select certified_at is not null from public.governance_proposals
   where id = (select (proposal).id from hab200_proposal)),
  'final decision stores a server-side certification timestamp'
);

select is(
  (select certified_by from public.governance_proposals
   where id = (select (proposal).id from hab200_proposal)),
  '20000000-0000-0000-0000-000000000001'::uuid,
  'final decision stores the certifying governance manager'
);

select is(
  (select (decision_snapshot ->> 'eligible_count')::integer
   from public.governance_proposals
   where id = (select (proposal).id from hab200_proposal)),
  1,
  'final certification preserves the frozen eligible count'
);

reset role;
select throws_ok(
  format(
    'update public.governance_proposals set certified_at = now() + interval ''1 minute'' where id = %L::uuid',
    (select (proposal).id::text from hab200_proposal)
  ),
  'P0001', 'governance decision certification is immutable',
  'decision certification cannot be rewritten after finalization'
);

select * from finish();
rollback;
