begin;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at
)
values
  ('20200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab202-admin@test.local', 'x', '{"full_name":"HAB 202 Admin"}'::jsonb, now(), now()),
  ('20200000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab202-owner1@test.local', 'x', '{"full_name":"Owner One"}'::jsonb, now(), now()),
  ('20200000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab202-owner2@test.local', 'x', '{"full_name":"Owner Two"}'::jsonb, now(), now()),
  ('20200000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab202-owner3@test.local', 'x', '{"full_name":"Owner Three"}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000001', true);

create temporary table hab202_workspace as
select public.create_admin_workspace(
  'HAB-202 Organization', 'independent', 'HAB-202 Condominium', 'VE', 'Caracas',
  'America/Caracas', 'USD', 'VES', 1, 'Torre HAB-202'
) as payload;

reset role;

insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
values
  ('20200000-0000-0000-0000-000000000021', (select (payload #>> '{condominium,id}')::uuid from hab202_workspace), (select (payload #>> '{building,id}')::uuid from hab202_workspace), 'A-01', 'apartment', 'active', '20200000-0000-0000-0000-000000000001'),
  ('20200000-0000-0000-0000-000000000022', (select (payload #>> '{condominium,id}')::uuid from hab202_workspace), (select (payload #>> '{building,id}')::uuid from hab202_workspace), 'A-02', 'apartment', 'active', '20200000-0000-0000-0000-000000000001'),
  ('20200000-0000-0000-0000-000000000023', (select (payload #>> '{condominium,id}')::uuid from hab202_workspace), (select (payload #>> '{building,id}')::uuid from hab202_workspace), 'A-03', 'apartment', 'active', '20200000-0000-0000-0000-000000000001');

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
)
values
  ('20200000-0000-0000-0000-000000000031', (select (payload #>> '{condominium,id}')::uuid from hab202_workspace), '20200000-0000-0000-0000-000000000011', 'Owner', 'One', 'hab202-owner1@test.local', 'active', '20200000-0000-0000-0000-000000000001'),
  ('20200000-0000-0000-0000-000000000032', (select (payload #>> '{condominium,id}')::uuid from hab202_workspace), '20200000-0000-0000-0000-000000000012', 'Owner', 'Two', 'hab202-owner2@test.local', 'active', '20200000-0000-0000-0000-000000000001'),
  ('20200000-0000-0000-0000-000000000033', (select (payload #>> '{condominium,id}')::uuid from hab202_workspace), '20200000-0000-0000-0000-000000000013', 'Owner', 'Three', 'hab202-owner3@test.local', 'active', '20200000-0000-0000-0000-000000000001');

insert into public.unit_owners (
  unit_id, person_id, ownership_percentage, is_primary_contact, starts_at, created_by
)
values
  ('20200000-0000-0000-0000-000000000021', '20200000-0000-0000-0000-000000000031', 100, true, current_date - 30, '20200000-0000-0000-0000-000000000001'),
  ('20200000-0000-0000-0000-000000000022', '20200000-0000-0000-0000-000000000032', 100, true, current_date - 30, '20200000-0000-0000-0000-000000000001'),
  ('20200000-0000-0000-0000-000000000023', '20200000-0000-0000-0000-000000000033', 100, true, current_date - 30, '20200000-0000-0000-0000-000000000001');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ((select (payload #>> '{condominium,id}')::uuid from hab202_workspace), '20200000-0000-0000-0000-000000000011', 'owner'),
  ((select (payload #>> '{condominium,id}')::uuid from hab202_workspace), '20200000-0000-0000-0000-000000000012', 'owner'),
  ((select (payload #>> '{condominium,id}')::uuid from hab202_workspace), '20200000-0000-0000-0000-000000000013', 'owner');

select has_column(
  'public', 'governance_proposals', 'approval_threshold_percentage',
  'governance proposals store an explicit approval threshold'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000001', true);

create temporary table hab202_fail as
select public.create_governance_proposal_v2(
  (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
  'Threshold 75', 'Quorum is not approval',
  'Two of three affirmative ballots must fail a 75 percent approval threshold.',
  'policy', 'one_per_owner', 50, null, null, null, now() + interval '7 days',
  '[{"label":"A favor","sortOrder":0},{"label":"En contra","sortOrder":1}]'::jsonb,
  '[]'::jsonb, 75
) as proposal;

select is(
  (select approval_threshold_percentage from public.governance_proposals where id = (select (proposal).id from hab202_fail)),
  75::numeric,
  'create v2 stores the configured approval threshold'
);

select is(
  (public.transition_governance_proposal(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_fail), 'open', 2
  )).status::text,
  'open',
  'threshold proposal opens with frozen voting rules'
);

select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000011', true);
select public.cast_governance_vote(
  (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
  (select (proposal).id from hab202_fail),
  (select id from public.governance_options where proposal_id = (select (proposal).id from hab202_fail) order by sort_order limit 1),
  null
);
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000012', true);
select public.cast_governance_vote(
  (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
  (select (proposal).id from hab202_fail),
  (select id from public.governance_options where proposal_id = (select (proposal).id from hab202_fail) order by sort_order limit 1),
  null
);
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000013', true);
select public.cast_governance_vote(
  (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
  (select (proposal).id from hab202_fail),
  (select id from public.governance_options where proposal_id = (select (proposal).id from hab202_fail) order by sort_order desc limit 1),
  null
);

select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000001', true);

select is(
  (public.get_governance_results(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_fail)
  ) ->> 'quorum_met')::boolean,
  true,
  'participation quorum can be met independently of approval'
);

select is(
  (public.get_governance_results(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_fail)
  ) ->> 'approval_percentage')::numeric,
  66.67::numeric,
  'affirmative support is calculated from valid ballots cast'
);

select is(
  (public.get_governance_results(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_fail)
  ) ->> 'approval_threshold_met')::boolean,
  false,
  '75 percent threshold fails with two of three affirmative ballots'
);

select is(
  public.get_governance_decision(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_fail)
  ) ->> 'decision',
  'reject',
  'affirmative plurality does not approve when the threshold is not met'
);

select throws_ok(
  format(
    'select public.configure_governance_voting_rules(%L::uuid, %L::uuid, 50, 60, 3)',
    (select payload #>> '{condominium,id}' from hab202_workspace),
    (select (proposal).id::text from hab202_fail)
  ),
  'P0001', 'governance voting rules can only be edited in draft',
  'approval threshold cannot change after voting opens'
);

select is(
  (public.transition_governance_proposal(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_fail), 'close', 3
  )).status::text,
  'closed',
  'threshold-failing vote closes normally'
);

select is(
  (public.transition_governance_proposal(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_fail), 'reject', 4
  )).status::text,
  'rejected',
  'automatic certification enforces the failed approval threshold'
);

select is(
  (select (decision_snapshot ->> 'approval_threshold_percentage')::numeric
   from public.governance_proposals where id = (select (proposal).id from hab202_fail)),
  75::numeric,
  'final certification preserves the approval threshold used for the decision'
);

create temporary table hab202_pass as
select public.create_governance_proposal_v2(
  (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
  'Threshold 60', 'Qualified approval passes',
  'Two of three affirmative ballots must pass a 60 percent approval threshold.',
  'policy', 'one_per_owner', 50, null, null, null, now() + interval '7 days',
  '[{"label":"A favor","sortOrder":0},{"label":"En contra","sortOrder":1}]'::jsonb,
  '[]'::jsonb, 60
) as proposal;
select public.transition_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
  (select (proposal).id from hab202_pass), 'open', 2
);

select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000011', true);
select public.cast_governance_vote((select (payload #>> '{condominium,id}')::uuid from hab202_workspace), (select (proposal).id from hab202_pass), (select id from public.governance_options where proposal_id = (select (proposal).id from hab202_pass) order by sort_order limit 1), null);
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000012', true);
select public.cast_governance_vote((select (payload #>> '{condominium,id}')::uuid from hab202_workspace), (select (proposal).id from hab202_pass), (select id from public.governance_options where proposal_id = (select (proposal).id from hab202_pass) order by sort_order limit 1), null);
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000013', true);
select public.cast_governance_vote((select (payload #>> '{condominium,id}')::uuid from hab202_workspace), (select (proposal).id from hab202_pass), (select id from public.governance_options where proposal_id = (select (proposal).id from hab202_pass) order by sort_order desc limit 1), null);
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000001', true);

select is(
  public.get_governance_decision(
    (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
    (select (proposal).id from hab202_pass)
  ) ->> 'decision',
  'approve',
  'the same two-of-three vote approves when the recorded threshold is 60 percent'
);

create temporary table hab202_ambiguous as
select public.create_governance_proposal_v2(
  (select (payload #>> '{condominium,id}')::uuid from hab202_workspace),
  'Ordering guard', 'Deterministic affirmative option',
  'Opening must reject privileged corruption that makes option order ambiguous.',
  'policy', 'one_per_owner', 50, null, null, null, now() + interval '7 days',
  '[{"label":"A favor","sortOrder":0},{"label":"En contra","sortOrder":1}]'::jsonb,
  '[]'::jsonb, 50
) as proposal;

reset role;
update public.governance_options
set sort_order = 0
where proposal_id = (select (proposal).id from hab202_ambiguous);
set local role authenticated;
select set_config('request.jwt.claim.sub', '20200000-0000-0000-0000-000000000001', true);

select throws_ok(
  format(
    'select public.transition_governance_proposal(%L::uuid, %L::uuid, %L, 2)',
    (select payload #>> '{condominium,id}' from hab202_workspace),
    (select (proposal).id::text from hab202_ambiguous),
    'open'
  ),
  'P0001', 'governance voting option ordering must be deterministic before opening',
  'ambiguous affirmative option ordering fails closed before voting opens'
);

select * from finish();
rollback;
