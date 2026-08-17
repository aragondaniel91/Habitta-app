begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('12800000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab128-admin@test.local', 'x', now(), now()),
  ('12800000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab128-owner1@test.local', 'x', now(), now()),
  ('12800000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab128-owner2@test.local', 'x', now(), now()),
  ('12800000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab128-owner3@test.local', 'x', now(), now()),
  ('12800000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab128-owner4@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '12800000-0000-0000-0000-000000000001', true);

create temporary table hab128_workspace as
select public.create_admin_workspace(
  'HAB-128 Organization',
  'independent',
  'HAB-128 Condominium',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  4,
  'Torre HAB-128'
) as payload;

reset role;

insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
select
  unit_id,
  (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
  (select (payload #>> '{building,id}')::uuid from hab128_workspace),
  unit_code,
  'apartment',
  'active',
  '12800000-0000-0000-0000-000000000001'
from (
  values
    ('12800000-0000-0000-0000-000000000021'::uuid, 'A-01'),
    ('12800000-0000-0000-0000-000000000022'::uuid, 'A-02'),
    ('12800000-0000-0000-0000-000000000023'::uuid, 'A-03'),
    ('12800000-0000-0000-0000-000000000024'::uuid, 'A-04')
) as units(unit_id, unit_code);

insert into public.people (id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by)
select
  person_id,
  (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
  user_id,
  'Owner',
  person_number,
  email,
  'active',
  '12800000-0000-0000-0000-000000000001'
from (
  values
    ('12800000-0000-0000-0000-000000000031'::uuid, '12800000-0000-0000-0000-000000000011'::uuid, 'One', 'hab128-owner1@test.local'),
    ('12800000-0000-0000-0000-000000000032'::uuid, '12800000-0000-0000-0000-000000000012'::uuid, 'Two', 'hab128-owner2@test.local'),
    ('12800000-0000-0000-0000-000000000033'::uuid, '12800000-0000-0000-0000-000000000013'::uuid, 'Three', 'hab128-owner3@test.local'),
    ('12800000-0000-0000-0000-000000000034'::uuid, '12800000-0000-0000-0000-000000000014'::uuid, 'Four', 'hab128-owner4@test.local')
) as people(person_id, user_id, person_number, email);

insert into public.unit_owners (unit_id, person_id, ownership_percentage, is_primary_contact, created_by)
values
  ('12800000-0000-0000-0000-000000000021', '12800000-0000-0000-0000-000000000031', 100, true, '12800000-0000-0000-0000-000000000001'),
  ('12800000-0000-0000-0000-000000000022', '12800000-0000-0000-0000-000000000032', 100, true, '12800000-0000-0000-0000-000000000001'),
  ('12800000-0000-0000-0000-000000000023', '12800000-0000-0000-0000-000000000033', 100, true, '12800000-0000-0000-0000-000000000001'),
  ('12800000-0000-0000-0000-000000000024', '12800000-0000-0000-0000-000000000034', 100, true, '12800000-0000-0000-0000-000000000001');

insert into public.condominium_memberships (condominium_id, user_id, role)
select (payload #>> '{condominium,id}')::uuid, user_id, 'owner'
from hab128_workspace
cross join (
  values
    ('12800000-0000-0000-0000-000000000011'::uuid),
    ('12800000-0000-0000-0000-000000000012'::uuid),
    ('12800000-0000-0000-0000-000000000013'::uuid),
    ('12800000-0000-0000-0000-000000000014'::uuid)
) as users(user_id);

-- HAB-128 predates frozen option configuration. Build these historical fixtures as drafts,
-- attach their options while mutation is valid, capture the electorate, then close them.
insert into public.governance_proposals (
  id, condominium_id, title, description, category, status, voting_basis,
  quorum_percentage, approval_threshold_percentage, closes_at, created_by
)
select
  proposal_id,
  (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
  proposal_title,
  'HAB-128 decision guard test',
  'community',
  'draft',
  'one_per_unit',
  quorum,
  0,
  now() - interval '1 hour',
  '12800000-0000-0000-0000-000000000001'
from (
  values
    ('12800000-0000-0000-0000-000000000101'::uuid, 'No quorum', 75::numeric),
    ('12800000-0000-0000-0000-000000000102'::uuid, 'Tie result', 50::numeric),
    ('12800000-0000-0000-0000-000000000103'::uuid, 'Approve winner', 50::numeric),
    ('12800000-0000-0000-0000-000000000104'::uuid, 'Reject winner', 50::numeric)
) as proposals(proposal_id, proposal_title, quorum);

insert into public.governance_options (id, proposal_id, condominium_id, label, sort_order)
select
  option_id,
  proposal_id,
  (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
  label,
  sort_order
from (
  values
    ('12800000-0000-0000-0000-000000000111'::uuid, '12800000-0000-0000-0000-000000000101'::uuid, 'Aprobar', 0),
    ('12800000-0000-0000-0000-000000000112'::uuid, '12800000-0000-0000-0000-000000000101'::uuid, 'Rechazar', 1),
    ('12800000-0000-0000-0000-000000000121'::uuid, '12800000-0000-0000-0000-000000000102'::uuid, 'Aprobar', 0),
    ('12800000-0000-0000-0000-000000000122'::uuid, '12800000-0000-0000-0000-000000000102'::uuid, 'Rechazar', 1),
    ('12800000-0000-0000-0000-000000000131'::uuid, '12800000-0000-0000-0000-000000000103'::uuid, 'Aprobar', 0),
    ('12800000-0000-0000-0000-000000000132'::uuid, '12800000-0000-0000-0000-000000000103'::uuid, 'Rechazar', 1),
    ('12800000-0000-0000-0000-000000000141'::uuid, '12800000-0000-0000-0000-000000000104'::uuid, 'Aprobar', 0),
    ('12800000-0000-0000-0000-000000000142'::uuid, '12800000-0000-0000-0000-000000000104'::uuid, 'Rechazar', 1)
) as options(option_id, proposal_id, label, sort_order);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12800000-0000-0000-0000-000000000001', true);
select public.capture_governance_eligibility(
  (select (payload #>> '{condominium,id}')::uuid from hab128_workspace), proposal_id
)
from (
  values
    ('12800000-0000-0000-0000-000000000101'::uuid),
    ('12800000-0000-0000-0000-000000000102'::uuid),
    ('12800000-0000-0000-0000-000000000103'::uuid),
    ('12800000-0000-0000-0000-000000000104'::uuid)
) as proposals(proposal_id);
reset role;

update public.governance_proposals
set status = 'closed', closed_at = now()
where id in (
  '12800000-0000-0000-0000-000000000101',
  '12800000-0000-0000-0000-000000000102',
  '12800000-0000-0000-0000-000000000103',
  '12800000-0000-0000-0000-000000000104'
);

insert into public.governance_votes (proposal_id, option_id, condominium_id, user_id, unit_id)
select proposal_id, option_id, (select (payload #>> '{condominium,id}')::uuid from hab128_workspace), user_id, unit_id
from (
  values
    ('12800000-0000-0000-0000-000000000101'::uuid, '12800000-0000-0000-0000-000000000111'::uuid, '12800000-0000-0000-0000-000000000011'::uuid, '12800000-0000-0000-0000-000000000021'::uuid),
    ('12800000-0000-0000-0000-000000000102'::uuid, '12800000-0000-0000-0000-000000000121'::uuid, '12800000-0000-0000-0000-000000000011'::uuid, '12800000-0000-0000-0000-000000000021'::uuid),
    ('12800000-0000-0000-0000-000000000102'::uuid, '12800000-0000-0000-0000-000000000122'::uuid, '12800000-0000-0000-0000-000000000012'::uuid, '12800000-0000-0000-0000-000000000022'::uuid),
    ('12800000-0000-0000-0000-000000000103'::uuid, '12800000-0000-0000-0000-000000000131'::uuid, '12800000-0000-0000-0000-000000000011'::uuid, '12800000-0000-0000-0000-000000000021'::uuid),
    ('12800000-0000-0000-0000-000000000103'::uuid, '12800000-0000-0000-0000-000000000131'::uuid, '12800000-0000-0000-0000-000000000012'::uuid, '12800000-0000-0000-0000-000000000022'::uuid),
    ('12800000-0000-0000-0000-000000000103'::uuid, '12800000-0000-0000-0000-000000000132'::uuid, '12800000-0000-0000-0000-000000000013'::uuid, '12800000-0000-0000-0000-000000000023'::uuid),
    ('12800000-0000-0000-0000-000000000104'::uuid, '12800000-0000-0000-0000-000000000141'::uuid, '12800000-0000-0000-0000-000000000011'::uuid, '12800000-0000-0000-0000-000000000021'::uuid),
    ('12800000-0000-0000-0000-000000000104'::uuid, '12800000-0000-0000-0000-000000000142'::uuid, '12800000-0000-0000-0000-000000000012'::uuid, '12800000-0000-0000-0000-000000000022'::uuid),
    ('12800000-0000-0000-0000-000000000104'::uuid, '12800000-0000-0000-0000-000000000142'::uuid, '12800000-0000-0000-0000-000000000013'::uuid, '12800000-0000-0000-0000-000000000023'::uuid)
) as votes(proposal_id, option_id, user_id, unit_id);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12800000-0000-0000-0000-000000000001', true);

select is(
  public.get_governance_decision(
    (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
    '12800000-0000-0000-0000-000000000101'
  ) ->> 'decision',
  'no_quorum',
  'no quorum produces no automatic decision'
);
select throws_ok(
  $$select public.transition_governance_proposal((select (payload #>> '{condominium,id}')::uuid from hab128_workspace), '12800000-0000-0000-0000-000000000101', 'approve', 1)$$,
  'P0001',
  'proposal quorum not met',
  'proposal cannot be approved without quorum'
);

select is(
  public.get_governance_decision(
    (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
    '12800000-0000-0000-0000-000000000102'
  ) ->> 'decision',
  'tie',
  'equal winning vote totals are detected as a tie'
);
select throws_ok(
  $$select public.transition_governance_proposal((select (payload #>> '{condominium,id}')::uuid from hab128_workspace), '12800000-0000-0000-0000-000000000102', 'approve', 1)$$,
  'P0001',
  'proposal result is tied',
  'tied proposal cannot be approved automatically'
);

select is(
  public.get_governance_decision(
    (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
    '12800000-0000-0000-0000-000000000103'
  ) ->> 'decision',
  'approve',
  'first option winning with quorum produces approval decision'
);
select is(
  (
    public.transition_governance_proposal(
      (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
      '12800000-0000-0000-0000-000000000103',
      'approve',
      1
    )
  ).status::text,
  'approved',
  'affirmative winner can be formally approved'
);
select is(
  (
    select metadata ->> 'override'
    from public.governance_events
    where proposal_id = '12800000-0000-0000-0000-000000000103'
      and event_type = 'approved'
    order by occurred_at desc
    limit 1
  ),
  'false',
  'normal decision audit event records that no override occurred'
);

select is(
  public.get_governance_decision(
    (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
    '12800000-0000-0000-0000-000000000104'
  ) ->> 'decision',
  'reject',
  'non-affirmative unique winner with quorum produces rejection decision'
);
select throws_ok(
  $$select public.transition_governance_proposal((select (payload #>> '{condominium,id}')::uuid from hab128_workspace), '12800000-0000-0000-0000-000000000104', 'approve', 1)$$,
  'P0001',
  'proposal result requires reject',
  'manager cannot approve against the recorded winner'
);
select is(
  (
    public.transition_governance_proposal(
      (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
      '12800000-0000-0000-0000-000000000104',
      'reject',
      1
    )
  ).status::text,
  'rejected',
  'negative winner can be formally rejected'
);

select is(
  (
    public.override_governance_proposal_decision(
      (select (payload #>> '{condominium,id}')::uuid from hab128_workspace),
      '12800000-0000-0000-0000-000000000101',
      'approve',
      'Acta extraordinaria de la junta documenta la excepción.',
      1
    )
  ).status::text,
  'approved',
  'explicit justified override can resolve an exceptional result'
);
select is(
  (
    select metadata ->> 'reason'
    from public.governance_events
    where proposal_id = '12800000-0000-0000-0000-000000000101'
      and event_type = 'approved'
    order by occurred_at desc
    limit 1
  ),
  'Acta extraordinaria de la junta documenta la excepción.',
  'override reason is preserved in the audit trail'
);

select * from finish();
rollback;
