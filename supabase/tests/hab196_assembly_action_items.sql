begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('public', 'assembly_action_items', 'assembly action items exist');
select has_table('public', 'assembly_action_item_events', 'assembly action item audit events exist');
select has_type('public', 'assembly_action_item_status', 'assembly action item status enum exists');

insert into auth.users(id, email)
values
  ('19600000-0000-4000-8000-000000000001', 'hab196-admin@example.com'),
  ('19600000-0000-4000-8000-000000000002', 'hab196-board@example.com'),
  ('19600000-0000-4000-8000-000000000003', 'hab196-reviewer@example.com'),
  ('19600000-0000-4000-8000-000000000004', 'hab196-outsider@example.com'),
  ('19600000-0000-4000-8000-000000000005', 'hab196-other-admin@example.com');

insert into public.organizations(id, name, created_by)
values
  ('19610000-0000-4000-8000-000000000001', 'HAB-196 Org A', '19600000-0000-4000-8000-000000000001'),
  ('19610000-0000-4000-8000-000000000002', 'HAB-196 Org B', '19600000-0000-4000-8000-000000000005');

insert into public.organization_memberships(organization_id, user_id, role)
values
  ('19610000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000001', 'organization_owner'),
  ('19610000-0000-4000-8000-000000000002', '19600000-0000-4000-8000-000000000005', 'organization_owner');

insert into public.condominiums(id, organization_id, name, created_by)
values
  ('19620000-0000-4000-8000-000000000001', '19610000-0000-4000-8000-000000000001', 'HAB-196 Condo A', '19600000-0000-4000-8000-000000000001'),
  ('19620000-0000-4000-8000-000000000002', '19610000-0000-4000-8000-000000000002', 'HAB-196 Condo B', '19600000-0000-4000-8000-000000000005');

insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('19620000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('19620000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000002', 'board_member'),
  ('19620000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000003', 'payment_reviewer'),
  ('19620000-0000-4000-8000-000000000002', '19600000-0000-4000-8000-000000000005', 'condominium_admin');

insert into public.assemblies(
  id, condominium_id, title, scheduled_at, status, started_at, created_by, updated_by
)
values
  ('19630000-0000-4000-8000-000000000001', '19620000-0000-4000-8000-000000000001', 'Assembly A', now(), 'in_progress', now(), '19600000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000001'),
  ('19630000-0000-4000-8000-000000000002', '19620000-0000-4000-8000-000000000002', 'Assembly B', now(), 'in_progress', now(), '19600000-0000-4000-8000-000000000005', '19600000-0000-4000-8000-000000000005');

insert into public.assembly_resolutions(
  id, assembly_id, condominium_id, title, resolution_text, adopted_at, published_at, published_by, created_by
)
values
  ('19640000-0000-4000-8000-000000000001', '19630000-0000-4000-8000-000000000001', '19620000-0000-4000-8000-000000000001', 'Published A', 'Approve elevator repair', now(), now(), '19600000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000001'),
  ('19640000-0000-4000-8000-000000000002', '19630000-0000-4000-8000-000000000001', '19620000-0000-4000-8000-000000000001', 'Draft A', 'Pending publication', now(), null, null, '19600000-0000-4000-8000-000000000001'),
  ('19640000-0000-4000-8000-000000000003', '19630000-0000-4000-8000-000000000002', '19620000-0000-4000-8000-000000000002', 'Published B', 'Other condominium decision', now(), now(), '19600000-0000-4000-8000-000000000005', '19600000-0000-4000-8000-000000000005');

insert into public.service_requests(
  id, condominium_id, category_id, submitted_by_user_id, title, description
)
values
  ('19650000-0000-4000-8000-000000000001', '19620000-0000-4000-8000-000000000001', (select id from public.service_request_categories where condominium_id = '19620000-0000-4000-8000-000000000001' and code = 'maintenance'), '19600000-0000-4000-8000-000000000001', 'Elevator follow-up', 'Track the approved elevator repair'),
  ('19650000-0000-4000-8000-000000000002', '19620000-0000-4000-8000-000000000002', (select id from public.service_request_categories where condominium_id = '19620000-0000-4000-8000-000000000002' and code = 'maintenance'), '19600000-0000-4000-8000-000000000005', 'Other condo request', 'Must never be linkable from condo A');

insert into public.maintenance_work_orders(
  id, condominium_id, kind, title, description, created_by
)
values
  ('19660000-0000-4000-8000-000000000001', '19620000-0000-4000-8000-000000000001', 'corrective', 'Elevator repair', 'Execute assembly-approved corrective work', '19600000-0000-4000-8000-000000000001'),
  ('19660000-0000-4000-8000-000000000002', '19620000-0000-4000-8000-000000000002', 'corrective', 'Other condo work', 'Must never be linkable from condo A', '19600000-0000-4000-8000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.sub', '19600000-0000-4000-8000-000000000001', true);

select ok(
  public.is_valid_assembly_action_assignee('19620000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000002'),
  'board member is a valid action item assignee'
);
select ok(
  not public.is_valid_assembly_action_assignee('19620000-0000-4000-8000-000000000001', '19600000-0000-4000-8000-000000000003'),
  'payment reviewer is not implicitly an action item assignee'
);
select lives_ok(
  $$select public.create_assembly_action_item(
    '19620000-0000-4000-8000-000000000001',
    '19630000-0000-4000-8000-000000000001',
    'Coordinate elevator repair',
    'Execute and report the approved work',
    '19640000-0000-4000-8000-000000000001',
    '19600000-0000-4000-8000-000000000002',
    current_date + 30,
    null,
    null
  )$$,
  'manager can create an action item from a published resolution'
);
select is((select count(*)::integer from public.assembly_action_items), 1, 'one action item was created');
select is((select version from public.assembly_action_items limit 1), 1, 'new action item starts at version one');
select is((select status::text from public.assembly_action_items limit 1), 'open', 'new action item starts open');

select throws_ok(
  $$select public.create_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', '19630000-0000-4000-8000-000000000001',
    'Invalid draft resolution', null, '19640000-0000-4000-8000-000000000002'
  )$$,
  'P0001', 'published resolution required',
  'unpublished resolution cannot anchor an action item'
);
select throws_ok(
  $$select public.create_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', '19630000-0000-4000-8000-000000000001',
    'Cross request', null, null, null, null, '19650000-0000-4000-8000-000000000002', null
  )$$,
  'P0001', 'service request not found in condominium',
  'service request links cannot cross condominium boundaries'
);
select throws_ok(
  $$select public.create_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', '19630000-0000-4000-8000-000000000001',
    'Cross work order', null, null, null, null, null, '19660000-0000-4000-8000-000000000002'
  )$$,
  'P0001', 'maintenance work order not found in condominium',
  'maintenance links cannot cross condominium boundaries'
);

select lives_ok(
  format($q$select public.update_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', %L, 1,
    'Coordinate elevator repair', 'Execute and report the approved work',
    '19600000-0000-4000-8000-000000000002', current_date + 21,
    '19650000-0000-4000-8000-000000000001', '19660000-0000-4000-8000-000000000001'
  )$q$, (select id from public.assembly_action_items limit 1)),
  'manager can attach same-condominium request and work order'
);
select is((select version from public.assembly_action_items limit 1), 2, 'metadata update increments optimistic version');
select is((select service_request_id from public.assembly_action_items limit 1), '19650000-0000-4000-8000-000000000001'::uuid, 'request link is persisted');
select is((select maintenance_work_order_id from public.assembly_action_items limit 1), '19660000-0000-4000-8000-000000000001'::uuid, 'work order link is persisted');

select lives_ok(
  format($q$select public.transition_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', %L, 2, 'in_progress'
  )$q$, (select id from public.assembly_action_items limit 1)),
  'open action item can move to in progress'
);
select lives_ok(
  format($q$select public.transition_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', %L, 3, 'completed'
  )$q$, (select id from public.assembly_action_items limit 1)),
  'in-progress action item can complete'
);
select ok((select completed_at is not null from public.assembly_action_items limit 1), 'completion timestamp is server generated');
select is((select completed_by from public.assembly_action_items limit 1), '19600000-0000-4000-8000-000000000001'::uuid, 'completion actor is authenticated user');
select is((select version from public.assembly_action_items limit 1), 4, 'completion increments version');

select throws_ok(
  format($q$select public.update_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', %L, 4,
    'Mutated after complete', null, null, null, null, null
  )$q$, (select id from public.assembly_action_items limit 1)),
  'P0001', 'finalized action item is immutable',
  'completed action item metadata is immutable'
);
select throws_ok(
  format($q$select public.transition_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', %L, 4, 'open'
  )$q$, (select id from public.assembly_action_items limit 1)),
  'P0001', 'invalid action item status transition',
  'completed action item cannot reopen'
);
select is((select count(*)::integer from public.assembly_action_item_events), 4, 'create update progress and completion are audited');

reset role;
select throws_ok(
  $$delete from public.assembly_action_item_events$$,
  'P0001', 'assembly action item events are append-only',
  'audit events cannot be deleted even by an elevated session'
);
select throws_ok(
  $$delete from public.assembly_action_items$$,
  'P0001', 'assembly action item history cannot be deleted',
  'action item history cannot be hard deleted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '19600000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.create_assembly_action_item(
    '19620000-0000-4000-8000-000000000001', '19630000-0000-4000-8000-000000000001',
    'Unauthorized action', null
  )$$,
  'P0001', 'not authorized to manage assembly action items',
  'outsider cannot create assembly action items'
);

select * from finish();
rollback;
