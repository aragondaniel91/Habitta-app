begin;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('a6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab166-admin@test.local', 'x', now(), now()),
  ('a6000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab166-owner1@test.local', 'x', now(), now()),
  ('a6000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab166-owner2@test.local', 'x', now(), now()),
  ('a6000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab166-outsider@test.local', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);

create temporary table hab166_workspace as
select public.create_admin_workspace(
  'HAB-166 Organization',
  'independent',
  'HAB-166 Condominium',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  2,
  'Torre HAB-166'
) as payload;

reset role;

insert into public.units (id, condominium_id, building_id, code, type, status, created_by)
select unit_id,
       (select (payload #>> '{condominium,id}')::uuid from hab166_workspace),
       (select (payload #>> '{building,id}')::uuid from hab166_workspace),
       code, 'apartment', 'active', 'a6000000-0000-0000-0000-000000000001'
from (values
  ('a6000000-0000-0000-0000-000000000021'::uuid, 'A-01'),
  ('a6000000-0000-0000-0000-000000000022'::uuid, 'A-02')
) units(unit_id, code);

insert into public.people (
  id, condominium_id, auth_user_id, first_name, last_name, email, status, created_by
)
select person_id,
       (select (payload #>> '{condominium,id}')::uuid from hab166_workspace),
       user_id, 'Owner', label, email, 'active', 'a6000000-0000-0000-0000-000000000001'
from (values
  ('a6000000-0000-0000-0000-000000000031'::uuid, 'a6000000-0000-0000-0000-000000000011'::uuid, 'One', 'hab166-owner1@test.local'),
  ('a6000000-0000-0000-0000-000000000032'::uuid, 'a6000000-0000-0000-0000-000000000012'::uuid, 'Two', 'hab166-owner2@test.local')
) people(person_id, user_id, label, email);

insert into public.unit_owners (unit_id, person_id, ownership_percentage, is_primary_contact, created_by) values
  ('a6000000-0000-0000-0000-000000000021', 'a6000000-0000-0000-0000-000000000031', 100, true, 'a6000000-0000-0000-0000-000000000001'),
  ('a6000000-0000-0000-0000-000000000022', 'a6000000-0000-0000-0000-000000000032', 100, true, 'a6000000-0000-0000-0000-000000000001');

insert into public.condominium_memberships (condominium_id, user_id, role)
select (payload #>> '{condominium,id}')::uuid, user_id, 'owner'
from hab166_workspace
cross join (values
  ('a6000000-0000-0000-0000-000000000011'::uuid),
  ('a6000000-0000-0000-0000-000000000012'::uuid)
) users(user_id);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);

create temporary table hab166_proposal as
select public.create_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from hab166_workspace),
  'Renovación del lobby',
  'Decidir la renovación del lobby principal',
  'Propuesta HAB-166 para validar notificaciones sin exponer votos.',
  'improvement',
  'one_per_unit',
  50,
  5000,
  'USD',
  'VES',
  now() + interval '12 hours',
  '[{"label":"Aprobar"},{"label":"Rechazar"}]'::jsonb,
  '[]'::jsonb
) as proposal;

select public.transition_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from hab166_workspace),
  (select (proposal).id from hab166_proposal),
  'open',
  1
);

reset role;

select is(
  (select count(*) from public.notification_events where event_type = 'governance_opened'),
  1::bigint,
  'opening a proposal emits one governance notification event'
);
select is(
  (select count(*) from public.notifications where notification_type = 'governance_opened'),
  2::bigint,
  'all two eligible owners receive the opened proposal notification'
);

select is(
  public.generate_governance_due_notification_events(now()),
  1,
  'first due-soon scheduler pass emits one reminder event'
);
select is(
  public.generate_governance_due_notification_events(now()),
  0,
  'second due-soon scheduler pass is idempotent'
);
select is(
  (select count(*) from public.notification_events where event_type = 'governance_due_soon'),
  1::bigint,
  'only one due-soon event exists for the proposal deadline'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000011', true);

select public.cast_governance_vote(
  (select (payload #>> '{condominium,id}')::uuid from hab166_workspace),
  (select (proposal).id from hab166_proposal),
  (
    select id from public.governance_options
    where proposal_id = (select (proposal).id from hab166_proposal)
    order by sort_order limit 1
  ),
  'a6000000-0000-0000-0000-000000000021'
);

reset role;

select is(
  (select count(*) from public.notification_events
   where aggregate_type = 'governance'
     and deduplication_key like 'governance-event:%'
     and event_type not in ('governance_opened','governance_result_available','governance_decision_final')),
  0::bigint,
  'casting a ballot never fans out a governance notification'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);

select public.transition_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from hab166_workspace),
  (select (proposal).id from hab166_proposal),
  'close',
  2
);

select public.transition_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from hab166_workspace),
  (select (proposal).id from hab166_proposal),
  'approve',
  3
);

reset role;

select is(
  (select count(*) from public.notification_events where event_type = 'governance_result_available'),
  1::bigint,
  'closing the ballot emits one result-available event'
);
select is(
  (select count(*) from public.notification_events where event_type = 'governance_decision_final'),
  1::bigint,
  'formal approval emits one final-decision event'
);
select ok(
  not exists (
    select 1
    from public.notifications n
    join public.notification_events e on e.id = n.event_id
    where n.notification_type in (
      'governance_opened','governance_due_soon','governance_result_available','governance_decision_final'
    )
      and e.aggregate_type <> 'governance'
  ),
  'governance notification rows are linked only to governance aggregate events'
);
select ok(
  not exists (
    select 1
    from public.notification_events
    where aggregate_type = 'governance'
      and (
        payload ? 'option_id' or payload ? 'option' or payload ? 'vote'
        or payload ? 'votes' or payload ? 'user_id' or payload ? 'voter_id'
      )
  ),
  'governance notification payloads never expose ballots or voter identity'
);
select is(
  (select count(*) from public.notifications
   where recipient_user_id = 'a6000000-0000-0000-0000-000000000099'),
  0::bigint,
  'unrelated user never receives governance notifications'
);
select ok(
  not exists (
    select 1
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    where e.aggregate_type = 'governance'
      and d.status <> 'skipped'
  ),
  'HAB-130 keeps governance email deliveries fail-closed'
);
select is(
  (select count(*) from public.notification_events
   where aggregate_type = 'governance'),
  (select count(distinct deduplication_key) from public.notification_events
   where aggregate_type = 'governance'),
  'governance notification events remain deduplicated'
);

select * from finish();
rollback;
