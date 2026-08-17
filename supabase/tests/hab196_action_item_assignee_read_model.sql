begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

select has_function(
  'public',
  'list_assembly_action_assignees',
  array['uuid'],
  'assembly action item assignee read model exists'
);

insert into auth.users(id, email, raw_user_meta_data)
values
  ('19670000-0000-4000-8000-000000000001', 'selector-admin@example.com', '{"full_name":"Ada Admin"}'::jsonb),
  ('19670000-0000-4000-8000-000000000002', 'selector-board@example.com', '{"full_name":"Beto Board"}'::jsonb),
  ('19670000-0000-4000-8000-000000000003', 'selector-reviewer@example.com', '{}'::jsonb),
  ('19670000-0000-4000-8000-000000000004', 'selector-org-owner@example.com', '{"full_name":"Olga Owner"}'::jsonb),
  ('19670000-0000-4000-8000-000000000005', 'selector-outsider@example.com', '{}'::jsonb),
  ('19670000-0000-4000-8000-000000000006', 'selector-other-admin@example.com', '{}'::jsonb);

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

set local role authenticated;
select set_config('request.jwt.claim.sub', '19670000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')),
  3,
  'selector returns exactly the three valid assignees in the condominium scope'
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
  'payment reviewer and another-condominium administrator are excluded'
);

select set_config('request.jwt.claim.sub', '19670000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.list_assembly_action_assignees('19672000-0000-4000-8000-000000000001')$$,
  'P0001',
  'not authorized to list assembly action assignees',
  'non-governance user cannot enumerate valid assignees'
);

select * from finish();
rollback;
