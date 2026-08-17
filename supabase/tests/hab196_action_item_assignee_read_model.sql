begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

select has_function(
  'public',
  'list_assembly_action_assignees',
  array['uuid'],
  'assembly action item assignee selector exists'
);
select has_function(
  'public',
  'list_assembly_action_item_assignee_labels',
  array['uuid'],
  'reader-safe assigned identity read model exists'
);

insert into auth.users(id, email, raw_user_meta_data)
values
  ('19670000-0000-4000-8000-000000000001', 'selector-admin@example.com', '{"full_name":"Ada Admin"}'::jsonb),
  ('19670000-0000-4000-8000-000000000002', 'selector-board@example.com', '{"full_name":"Beto Board"}'::jsonb),
  ('19670000-0000-4000-8000-000000000003', 'selector-reviewer@example.com', '{}'::jsonb),
  ('19670000-0000-4000-8000-000000000004', 'selector-org-owner@example.com', '{"full_name":"Olga Owner"}'::jsonb),
  ('19670000-0000-4000-8000-000000000005', 'selector-outsider@example.com', '{}'::jsonb),
  ('19670000-0000-4000-8000-000000000006', 'selector-other-admin@example.com', '{"full_name":"Otto Other"}'::jsonb);

insert into public.organizations(id, name, created_by)
values
  ('19671000-0000-4000-8000-000000000001', 'HAB-196 Selector Org A', '19670000-0000-4000-8000-000000000001'),
  ('19671000-0000-4000-8000-000000000002', 'HAB-196 Selector Org B', '19670000-0000-4000-8000-000000000006');

insert into public.organization_memberships(organization_id, user_id, role)
values
  ('19671000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000001', 'organization_owner'),
  ('19671000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000004', 'organization_owner'),
  ('19671000-0000-4000-8000-000000000002', '19670000-0000-4000-8000-000000000006', 'organization_owner');

insert into public.condominiums(id, organization_id, name, created_by)
values
  ('19672000-0000-4000-8000-000000000001', '19671000-0000-4000-8000-000000000001', 'HAB-196 Selector Condo A', '19670000-0000-4000-8000-000000000001'),
  ('19672000-0000-4000-8000-000000000002', '19671000-0000-4000-8000-000000000002', 'HAB-196 Selector Condo B', '19670000-0000-4000-8000-000000000006');

insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('19672000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000001', 'condominium_admin'),
  ('19672000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000002', 'board_member'),
  ('19672000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000003', 'payment_reviewer'),
  ('19672000-0000-4000-8000-000000000002', '19670000-0000-4000-8000-000000000006', 'condominium_admin');

insert into public.assemblies(
  id, condominium_id, title, scheduled_at, status, started_at, created_by, updated_by
)
values
  ('19673000-0000-4000-8000-000000000001', '19672000-0000-4000-8000-000000000001', 'Selector Assembly A', now(), 'in_progress', now(), '19670000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000001'),
  ('19673000-0000-4000-8000-000000000002', '19672000-0000-4000-8000-000000000002', 'Selector Assembly B', now(), 'in_progress', now(), '19670000-0000-4000-8000-000000000006', '19670000-0000-4000-8000-000000000006');

insert into public.assembly_action_items(
  id, condominium_id, assembly_id, title, assigned_to_user_id, created_by, updated_by
)
values
  ('19674000-0000-4000-8000-000000000001', '19672000-0000-4000-8000-000000000001', '19673000-0000-4000-8000-000000000001', 'Assigned board follow-up', '19670000-0000-4000-8000-000000000002', '19670000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000001'),
  ('19674000-0000-4000-8000-000000000002', '19672000-0000-4000-8000-000000000001', '19673000-0000-4000-8000-000000000001', 'Unassigned follow-up', null, '19670000-0000-4000-8000-000000000001', '19670000-0000-4000-8000-000000000001'),
  ('19674000-0000-4000-8000-000000000003', '19672000-0000-4000-8000-000000000002', '19673000-0000-4000-8000-000000000002', 'Other condominium follow-up', '19670000-0000-4000-8000-000000000006', '19670000-0000-4000-8000-000000000006', '19670000-0000-4000-8000-000000000006');

set local role authenticated;
select set_config('request.jwt.claim.sub', '19670000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')),
  3,
  'manager selector returns exactly the valid assignees in the condominium scope'
);
select ok(
  exists (
    select 1
    from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')
    where user_id = '19670000-0000-4000-8000-000000000002'
      and role = 'board_member'
  ),
  'board member is exposed as an assignable governance member'
);
select ok(
  exists (
    select 1
    from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')
    where user_id = '19670000-0000-4000-8000-000000000004'
      and role = 'organization_owner'
  ),
  'organization owner is exposed even without a condominium membership'
);
select ok(
  not exists (
    select 1
    from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')
    where user_id in (
      '19670000-0000-4000-8000-000000000003'::uuid,
      '19670000-0000-4000-8000-000000000006'::uuid
    )
  ),
  'payment reviewer and another-condominium administrator are excluded from candidates'
);
select is(
  (select count(*)::integer from public.list_assembly_action_item_assignee_labels('19672000-0000-4000-8000-000000000001')),
  1,
  'assigned identity read model exposes only users referenced by action items in the target condominium'
);
select is(
  (select display_name from public.list_assembly_action_item_assignee_labels('19672000-0000-4000-8000-000000000001') where user_id = '19670000-0000-4000-8000-000000000002'),
  'Beto Board',
  'assigned identity prefers the authenticated profile name'
);

select set_config('request.jwt.claim.sub', '19670000-0000-4000-8000-000000000003', true);
select ok(
  public.can_read_governance('19672000-0000-4000-8000-000000000001'),
  'payment reviewer is a legitimate governance reader through condominium membership'
);
select ok(
  not public.can_manage_governance('19672000-0000-4000-8000-000000000001'),
  'payment reviewer does not acquire governance management rights'
);
select is(
  (select display_name from public.list_assembly_action_item_assignee_labels('19672000-0000-4000-8000-000000000001') where user_id = '19670000-0000-4000-8000-000000000002'),
  'Beto Board',
  'read-only governance member can resolve an already-assigned responsible identity'
);
select throws_ok(
  $$select * from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')$$,
  'P0001',
  'not authorized to list assembly action assignees',
  'read-only governance member cannot enumerate assignment candidates'
);

select set_config('request.jwt.claim.sub', '19670000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.list_assembly_action_item_assignee_labels('19672000-0000-4000-8000-000000000001')$$,
  'P0001',
  'not authorized to list assembly action item assignee labels',
  'outsider cannot resolve assigned identities'
);
select throws_ok(
  $$select * from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')$$,
  'P0001',
  'not authorized to list assembly action assignees',
  'outsider cannot enumerate valid assignees'
);

select * from finish();
rollback;
