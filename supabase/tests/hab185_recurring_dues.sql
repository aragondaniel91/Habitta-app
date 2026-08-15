begin;
select plan(28);

select has_table('public', 'financial_scopes', 'financial scopes table exists');
select has_table('public', 'recurring_charge_plans', 'recurring charge plans table exists');
select has_table('public', 'recurring_charge_runs', 'recurring charge runs table exists');
select has_function('public', 'prepare_recurring_charge_run', array['uuid'], 'review preparation RPC exists');
select has_function('public', 'post_recurring_charge_run', array['uuid'], 'posting RPC exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.recurring_charge_runs'::regclass),
  true,
  'recurring runs use RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.recurring_charge_runs', 'INSERT'),
  'authenticated clients cannot insert recurring runs directly'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000018501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab185-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000018502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab185-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('18500000-0000-0000-0000-000000000001', 'HAB 185 Org', '00000000-0000-0000-0000-000000018501');

insert into public.condominiums (id, organization_id, name, created_by)
values ('18510000-0000-0000-0000-000000000001', '18500000-0000-0000-0000-000000000001', 'HAB 185 Condo', '00000000-0000-0000-0000-000000018501');

insert into public.organization_memberships (organization_id, user_id, role)
values ('18500000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018501', 'organization_owner');
insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('18510000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018501', 'condominium_admin'),
  ('18510000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000018502', 'board_member');

insert into public.buildings (id, condominium_id, name, created_by)
values
  ('18520000-0000-0000-0000-000000000001', '18510000-0000-0000-0000-000000000001', 'Torre A', '00000000-0000-0000-0000-000000018501'),
  ('18520000-0000-0000-0000-000000000002', '18510000-0000-0000-0000-000000000001', 'Torre B', '00000000-0000-0000-0000-000000018501');

insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
values
  ('18530000-0000-0000-0000-000000000001', '18510000-0000-0000-0000-000000000001', '18520000-0000-0000-0000-000000000001', 'A-01', 'apartment', 33.3333, '00000000-0000-0000-0000-000000018501'),
  ('18530000-0000-0000-0000-000000000002', '18510000-0000-0000-0000-000000000001', '18520000-0000-0000-0000-000000000001', 'A-02', 'apartment', 66.6667, '00000000-0000-0000-0000-000000018501'),
  ('18530000-0000-0000-0000-000000000003', '18510000-0000-0000-0000-000000000001', '18520000-0000-0000-0000-000000000002', 'B-01', 'apartment', 10.0000, '00000000-0000-0000-0000-000000018501');

insert into public.charge_concepts (id, condominium_id, code, name, category, default_currency_code, created_by)
values ('18540000-0000-0000-0000-000000000001', '18510000-0000-0000-0000-000000000001', 'ORD', 'Cuota ordinaria', 'regular_dues', 'USD', '00000000-0000-0000-0000-000000018501');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000018501', true);

select lives_ok(
  $$select public.create_financial_scope(
    '18510000-0000-0000-0000-000000000001',
    'torre-a',
    'Torre A',
    'building',
    '18520000-0000-0000-0000-000000000001',
    null
  )$$,
  'administrator creates a building financial scope'
);
select is(
  (select count(*) from public.financial_scopes where condominium_id = '18510000-0000-0000-0000-000000000001'),
  1::bigint,
  'financial scope is persisted once'
);
select is(
  (select kind::text from public.financial_scopes where code = 'torre-a'),
  'building',
  'scope retains its building semantics'
);

select lives_ok(
  $$select public.create_recurring_charge_plan(
    '18510000-0000-0000-0000-000000000001',
    '18540000-0000-0000-0000-000000000001',
    (select id from public.financial_scopes where code = 'torre-a'),
    'Cuota ordinaria Torre A',
    'participation_percentage',
    100.01,
    'USD',
    '2026-09-01',
    1,
    10,
    null
  )$$,
  'administrator creates a monthly participation plan'
);
select is(
  (select distribution::text from public.recurring_charge_plans where name = 'Cuota ordinaria Torre A'),
  'participation_percentage',
  'plan stores participation distribution policy'
);

select lives_ok(
  $$select public.schedule_recurring_charge_run(
    (select id from public.recurring_charge_plans where name = 'Cuota ordinaria Torre A'),
    '2026-09'
  )$$,
  'September occurrence is scheduled without posting money'
);
select is(
  (select status::text from public.recurring_charge_runs where period = '2026-09'),
  'scheduled',
  'new occurrence starts scheduled'
);
select lives_ok(
  $$select public.schedule_recurring_charge_run(
    (select id from public.recurring_charge_plans where name = 'Cuota ordinaria Torre A'),
    '2026-09'
  )$$,
  'scheduling the same period is idempotent'
);
select is(
  (select count(*) from public.recurring_charge_runs where period = '2026-09'),
  1::bigint,
  'idempotent scheduling creates one occurrence'
);
select throws_ok(
  $$select public.post_recurring_charge_run((select id from public.recurring_charge_runs where period = '2026-09'))$$,
  'P0001',
  'recurring charge run must be reviewed before posting',
  'scheduled run cannot post without human review'
);

select lives_ok(
  $$select public.prepare_recurring_charge_run((select id from public.recurring_charge_runs where period = '2026-09'))$$,
  'administrator prepares occurrence for review'
);
select is(
  (select status::text from public.recurring_charge_runs where period = '2026-09'),
  'pending_review',
  'prepared occurrence waits for approval'
);
select is(
  (select jsonb_array_length(distribution_snapshot) from public.recurring_charge_runs where period = '2026-09'),
  2,
  'building scope includes only its two active units'
);
select is(
  (
    select sum((row ->> 'amount')::numeric)
    from public.recurring_charge_runs r,
      lateral jsonb_array_elements(r.distribution_snapshot) row
    where r.period = '2026-09'
  ),
  100.01::numeric,
  'deterministic cent allocation reconciles exactly to requested total'
);
select is(
  (select total_amount from public.recurring_charge_runs where period = '2026-09'),
  100.01::numeric,
  'review snapshot freezes requested total'
);
select is(
  (select count(*) from public.integration_outbox where event_type = 'finance.recurring_charge.pending_review'),
  1::bigint,
  'pending review emits one durable outbox event'
);

select lives_ok(
  $$select public.post_recurring_charge_run((select id from public.recurring_charge_runs where period = '2026-09'))$$,
  'authorized administrator approves and posts reviewed occurrence'
);
select is(
  (select status::text from public.recurring_charge_runs where period = '2026-09'),
  'posted',
  'approved recurring occurrence becomes posted'
);
select is(
  (select status::text from public.charge_batches where id = (select charge_batch_id from public.recurring_charge_runs where period = '2026-09')),
  'posted',
  'recurring posting reuses immutable charge batch ledger path'
);
select is(
  (select count(*) from public.receivable_items where charge_batch_id = (select charge_batch_id from public.recurring_charge_runs where period = '2026-09')),
  2::bigint,
  'posting creates one receivable per scoped unit'
);
select is(
  (select sum(original_amount) from public.receivable_items where charge_batch_id = (select charge_batch_id from public.recurring_charge_runs where period = '2026-09')),
  100.01::numeric,
  'posted receivables reconcile to frozen occurrence total'
);
select is(
  (select count(*) from public.integration_outbox where event_type = 'finance.recurring_charge.posted'),
  1::bigint,
  'posting emits one durable integration event'
);
select throws_ok(
  $$update public.recurring_charge_runs set total_amount = 1 where period = '2026-09'$$,
  'P0001',
  'posted recurring charge runs are immutable',
  'posted occurrence snapshot cannot be repriced'
);

select lives_ok(
  $$select public.schedule_recurring_charge_run(
    (select id from public.recurring_charge_plans where name = 'Cuota ordinaria Torre A'),
    '2026-10'
  )$$,
  'next month can be scheduled independently'
);
select is(
  (select status::text from public.recurring_charge_runs where period = '2026-10'),
  'scheduled',
  'next month remains scheduled after prior month posts'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000018502', true);
select throws_ok(
  $$select public.schedule_recurring_charge_run(
    (select id from public.recurring_charge_plans where name = 'Cuota ordinaria Torre A'),
    '2026-11'
  )$$,
  'P0001',
  'permission denied',
  'board member cannot create financial ledger work without finance permission'
);

select * from finish();
rollback;
