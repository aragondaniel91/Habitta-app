begin;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at
)
values
  ('45000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab45-admin-a@test.local', 'x', '{"full_name":"HAB 45 Admin A"}'::jsonb, now(), now()),
  ('45000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab45-admin-b@test.local', 'x', '{"full_name":"HAB 45 Admin B"}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true);

create temporary table hab45_workspace_a as
select public.create_admin_workspace(
  'HAB-45 Organization A', 'independent', 'HAB-45 Condominium A', 'VE', 'Caracas',
  'America/Caracas', 'USD', 'VES', 1, 'Torre HAB-45 A'
) as payload;

select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000002', true);

create temporary table hab45_workspace_b as
select public.create_admin_workspace(
  'HAB-45 Organization B', 'independent', 'HAB-45 Condominium B', 'VE', 'Valencia',
  'America/Caracas', 'USD', 'VES', 1, 'Torre HAB-45 B'
) as payload;

select has_table('public', 'budget_periods', 'budget periods are authoritative entities');
select has_table('public', 'budget_versions', 'budget versions preserve approval history');
select has_table('public', 'budget_lines', 'budget lines are category and currency scoped');

select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true);

create temporary table hab45_budget_a as
select public.create_budget_period(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  'Presupuesto 2026',
  date '2026-01-01',
  date '2026-12-31',
  jsonb_build_array(
    jsonb_build_object(
      'category_id', (
        select id from public.expense_categories
        where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a)
          and code = 'maintenance'
      ),
      'currency_code', 'USD',
      'amount', 1000
    ),
    jsonb_build_object(
      'category_id', (
        select id from public.expense_categories
        where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a)
          and code = 'maintenance'
      ),
      'currency_code', 'VES',
      'amount', 20000
    )
  ),
  '45000000-0000-0000-0000-000000000101',
  'Versión inicial'
) as version;

select is(
  (select ((version).status)::text from hab45_budget_a),
  'draft',
  'new budgets start as draft'
);

select is(
  (
    select (public.create_budget_period(
      (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
      'Ignored retry name',
      date '2026-01-01',
      date '2026-12-31',
      jsonb_build_array(
        jsonb_build_object(
          'category_id', (
            select id from public.expense_categories
            where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a)
              and code = 'maintenance'
          ),
          'currency_code', 'USD',
          'amount', 999
        )
      ),
      '45000000-0000-0000-0000-000000000101',
      null
    )).id
  ),
  (select (version).id from hab45_budget_a),
  'create is idempotent for the same condominium request id'
);

select is(
  (
    select count(*)::integer
    from public.budget_lines
    where budget_version_id = (select (version).id from hab45_budget_a)
  ),
  2,
  'the initial version preserves separate USD and VES lines'
);

select is(
  (
    public.submit_budget_version(
      (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
      (select (version).budget_period_id from hab45_budget_a),
      (select (version).id from hab45_budget_a)
    )
  ).status::text,
  'pending_approval',
  'budget managers can submit the current draft'
);

select is(
  (
    public.approve_budget_version(
      (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
      (select (version).budget_period_id from hab45_budget_a),
      (select (version).id from hab45_budget_a)
    )
  ).status::text,
  'approved',
  'budget approvers can approve the pending version'
);

select is(
  (
    select approved_version_id
    from public.budget_periods
    where id = (select (version).budget_period_id from hab45_budget_a)
  ),
  (select (version).id from hab45_budget_a),
  'the period points at its approved authoritative version'
);

create temporary table hab45_expense as
select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  (
    select id from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a)
      and code = 'maintenance'
  ),
  null,
  'Mantenimiento HAB-45',
  null,
  date '2026-06-15',
  null,
  250,
  'USD',
  null,
  null,
  null,
  null
) as expense;

select public.transition_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  (select (expense).id from hab45_expense),
  'submit',
  null,
  1
);
select public.transition_expense(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  (select (expense).id from hab45_expense),
  'approve',
  null,
  2
);

select is(
  (
    select actual_amount
    from public.get_budget_actual_vs_budget(
      (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
      (select (version).budget_period_id from hab45_budget_a)
    )
    where currency_code = 'USD'
  ),
  250::numeric,
  'approved USD expenses are actuals for the matching USD line'
);

select is(
  (
    select budget_amount
    from public.get_budget_actual_vs_budget(
      (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
      (select (version).budget_period_id from hab45_budget_a)
    )
    where currency_code = 'USD'
  ),
  1000::numeric,
  'USD budget amount is reported without conversion'
);

select is(
  (
    select actual_amount
    from public.get_budget_actual_vs_budget(
      (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
      (select (version).budget_period_id from hab45_budget_a)
    )
    where currency_code = 'VES'
  ),
  0::numeric,
  'USD actuals never leak into the VES budget line'
);

create temporary table hab45_revision as
select public.create_budget_revision(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  (select (version).budget_period_id from hab45_budget_a),
  jsonb_build_array(
    jsonb_build_object(
      'category_id', (
        select id from public.expense_categories
        where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a)
          and code = 'maintenance'
      ),
      'currency_code', 'USD',
      'amount', 1200
    )
  ),
  '45000000-0000-0000-0000-000000000102',
  'Ajuste aprobado por administración'
) as version;

select is(
  (select (version).version_number from hab45_revision),
  2,
  'revision creates a new immutable version instead of rewriting version one'
);

select public.submit_budget_version(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  (select (version).budget_period_id from hab45_revision),
  (select (version).id from hab45_revision)
);
select public.approve_budget_version(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  (select (version).budget_period_id from hab45_revision),
  (select (version).id from hab45_revision)
);

select is(
  (
    select status::text from public.budget_versions
    where id = (select (version).id from hab45_budget_a)
  ),
  'superseded',
  'approving a revision supersedes the previously approved version'
);

reset role;
select throws_ok(
  format(
    'update public.budget_lines set amount = 999 where id = %L::uuid',
    (
      select id::text from public.budget_lines
      where budget_version_id = (select (version).id from hab45_budget_a)
      limit 1
    )
  ),
  'P0001',
  'budget history is immutable',
  'budget line history cannot be rewritten even by privileged SQL'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true);

create temporary table hab45_document as
select public.create_community_document(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
  'Presupuesto aprobado 2026',
  'Documento asociado al presupuesto autoritativo.',
  null,
  null,
  'management',
  null
) as document;

select is(
  (
    public.link_community_document(
      (select (document).id from hab45_document),
      'budget'::public.community_document_link_type,
      (select (version).budget_period_id from hab45_revision)
    )
  ).target_type::text,
  'budget',
  'Community Documents can link to an authoritative budget period'
);

select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000002', true);

create temporary table hab45_budget_b as
select public.create_budget_period(
  (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_b),
  'Presupuesto B',
  date '2026-01-01',
  date '2026-12-31',
  jsonb_build_array(
    jsonb_build_object(
      'category_id', (
        select id from public.expense_categories
        where condominium_id = (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_b)
          and code = 'maintenance'
      ),
      'currency_code', 'USD',
      'amount', 500
    )
  ),
  '45000000-0000-0000-0000-000000000201',
  null
) as version;

select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true);

select throws_ok(
  format(
    'select public.link_community_document(%L::uuid, %L::public.community_document_link_type, %L::uuid)',
    (select (document).id::text from hab45_document),
    'budget',
    (select (version).budget_period_id::text from hab45_budget_b)
  ),
  'P0001',
  'related record not found in condominium',
  'document links reject a budget from another condominium'
);

select is(
  (
    select count(*)::integer
    from public.budget_periods
    where id = (select (version).budget_period_id from hab45_budget_b)
  ),
  0,
  'RLS hides another condominium budget period'
);

select is(
  (
    select count(*)::integer
    from public.budget_versions
    where budget_period_id = (select (version).budget_period_id from hab45_revision)
  ),
  2,
  'both approved budget versions remain available as history'
);

select is(
  (
    select variance_amount
    from public.get_budget_actual_vs_budget(
      (select (payload #>> '{condominium,id}')::uuid from hab45_workspace_a),
      (select (version).budget_period_id from hab45_revision)
    )
    where currency_code = 'USD'
  ),
  950::numeric,
  'actual-vs-budget switches to the newly approved revision'
);

select * from finish();
rollback;
