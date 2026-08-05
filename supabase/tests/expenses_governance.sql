begin;
select plan(23);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-0000000000e1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'expense-admin@test.local',
    'x',
    '{"full_name":"Expense Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000e2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner-voter@test.local',
    'x',
    '{"full_name":"Owner Voter"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000e3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'outsider-voter@test.local',
    'x',
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

create temporary table operations_workspace as
select public.create_admin_workspace(
  'Habitta Operations Test',
  'independent',
  'Condominio Operaciones',
  'VE',
  'Caracas',
  'America/Caracas',
  'USD',
  'VES',
  20,
  'Torre Única'
) as payload;

select cmp_ok(
  (
    select count(*)
    from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from operations_workspace)
  ),
  '>=',
  8::bigint,
  'new condominiums receive default expense categories'
);

create temporary table test_expense as
select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
  (
    select id
    from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from operations_workspace)
      and code = 'maintenance'
  ),
  null,
  'Mantenimiento del ascensor',
  'FAC-100',
  current_date,
  current_date + 10,
  125.00,
  'USD',
  null,
  null,
  'https://mihabitta.com/support/fac-100',
  'Prueba de gasto'
) as expense;

select is((select (expense).status::text from test_expense), 'draft', 'expenses start as drafts');
select is(
  (
    select ec.code
    from public.expenses e
    join public.expense_categories ec on ec.id = e.category_id
    where e.id = (select (expense).id from test_expense)
  ),
  'maintenance',
  'expense category remains condominium scoped'
);
select is(
  (
    select (public.transition_expense(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (expense).id from test_expense),
      'submit',
      null,
      1
    )).status::text
  ),
  'pending_approval',
  'draft expense can be submitted'
);
select is(
  (
    select (public.transition_expense(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (expense).id from test_expense),
      'approve',
      null,
      2
    )).status::text
  ),
  'approved',
  'authorized administrator can approve an expense'
);
select is(
  (
    select (public.transition_expense(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (expense).id from test_expense),
      'mark_paid',
      null,
      3
    )).status::text
  ),
  'paid',
  'approved expense can be marked paid'
);
select is(
  (
    select count(*)
    from public.expense_events
    where expense_id = (select (expense).id from test_expense)
  ),
  4::bigint,
  'expense lifecycle is recorded in the audit trail'
);
select is(
  (
    select (entry ->> 'total_amount')::numeric
    from jsonb_array_elements(
      public.get_expense_summary(
        (select (payload #>> '{condominium,id}')::uuid from operations_workspace)
      ) -> 'totals_by_currency'
    ) entry
    where entry ->> 'currency_code' = 'USD'
  ),
  125.00::numeric,
  'expense summary preserves the USD total'
);

select public.create_expense(
  (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
  (
    select id
    from public.expense_categories
    where condominium_id = (select (payload #>> '{condominium,id}')::uuid from operations_workspace)
      and code = 'services'
  ),
  null,
  'Servicio eléctrico',
  null,
  current_date,
  null,
  500.00,
  'VES',
  null,
  null,
  null,
  null
);

select is(
  jsonb_array_length(
    public.get_expense_summary(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace)
    ) -> 'totals_by_currency'
  ),
  2,
  'expense totals keep different currencies in separate rows'
);

reset role;

insert into public.units (
  id,
  condominium_id,
  building_id,
  code,
  type,
  status,
  created_by
)
values (
  '00000000-0000-0000-0000-0000000000e4',
  (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
  (select (payload #>> '{building,id}')::uuid from operations_workspace),
  'A-01',
  'apartment',
  'active',
  '00000000-0000-0000-0000-0000000000e1'
);

insert into public.people (
  id,
  condominium_id,
  auth_user_id,
  first_name,
  last_name,
  email,
  status,
  created_by
)
values (
  '00000000-0000-0000-0000-0000000000e5',
  (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
  '00000000-0000-0000-0000-0000000000e2',
  'Owner',
  'Voter',
  'owner-voter@test.local',
  'active',
  '00000000-0000-0000-0000-0000000000e1'
);

insert into public.unit_owners (
  unit_id,
  person_id,
  ownership_percentage,
  is_primary_contact,
  created_by
)
values (
  '00000000-0000-0000-0000-0000000000e4'::uuid,
  '00000000-0000-0000-0000-0000000000e5'::uuid,
  100,
  true,
  '00000000-0000-0000-0000-0000000000e1'
);

insert into public.condominium_memberships (condominium_id, user_id, role)
values (
  (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
  '00000000-0000-0000-0000-0000000000e2',
  'owner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

create temporary table test_proposal as
select public.create_governance_proposal(
  (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
  'Renovación de fachada',
  'Evaluar presupuesto para la fachada',
  'Propuesta comunitaria con dos opciones y soporte documental.',
  'improvement',
  'one_per_unit',
  50,
  10000,
  'USD',
  null,
  now() + interval '7 days',
  '[{"label":"Aprobar"},{"label":"Rechazar"}]'::jsonb,
  '[{"documentType":"quote","fileName":"Cotización","url":"https://mihabitta.com/quote.pdf"}]'::jsonb
) as proposal;

select is((select (proposal).status::text from test_proposal), 'draft', 'proposals start as drafts');
select is(
  (
    select count(*)
    from public.governance_options
    where proposal_id = (select (proposal).id from test_proposal)
  ),
  2::bigint,
  'proposal creates all voting options transactionally'
);
select is(
  (
    select count(*)
    from public.governance_attachments
    where proposal_id = (select (proposal).id from test_proposal)
  ),
  1::bigint,
  'proposal stores its support document metadata'
);
select is(
  (
    select (public.transition_governance_proposal(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (proposal).id from test_proposal),
      'open',
      1
    )).status::text
  ),
  'open',
  'draft proposal can be opened by a governance manager'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);

select is(
  (
    public.get_governance_eligibility(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (proposal).id from test_proposal)
    ) ->> 'eligible'
  )::boolean,
  true,
  'linked active owner is eligible to vote'
);
select is(
  jsonb_array_length(
    public.get_governance_eligibility(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (proposal).id from test_proposal)
    ) -> 'units'
  ),
  1,
  'unit-based voting lists only owned eligible units'
);
select lives_ok(
  format(
    'select public.cast_governance_vote(%L::uuid, %L::uuid, %L::uuid, %L::uuid)',
    (select payload #>> '{condominium,id}' from operations_workspace),
    (select (proposal).id::text from test_proposal),
    (
      select id::text
      from public.governance_options
      where proposal_id = (select (proposal).id from test_proposal)
      order by sort_order
      limit 1
    ),
    '00000000-0000-0000-0000-0000000000e4'
  ),
  'eligible owner can cast a unit vote'
);
select throws_ok(
  format(
    'select public.cast_governance_vote(%L::uuid, %L::uuid, %L::uuid, %L::uuid)',
    (select payload #>> '{condominium,id}' from operations_workspace),
    (select (proposal).id::text from test_proposal),
    (
      select id::text
      from public.governance_options
      where proposal_id = (select (proposal).id from test_proposal)
      order by sort_order desc
      limit 1
    ),
    '00000000-0000-0000-0000-0000000000e4'
  ),
  '23505',
  null,
  'one unit cannot vote twice on the same proposal'
);
select is(
  (
    public.get_governance_results(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (proposal).id from test_proposal)
    ) ->> 'votes_cast'
  )::integer,
  1,
  'governance results count the recorded vote'
);
select is(
  (
    public.get_governance_results(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (proposal).id from test_proposal)
    ) ->> 'quorum_met'
  )::boolean,
  true,
  'quorum calculation uses eligible voting units'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', true);
select throws_ok(
  format(
    'select public.cast_governance_vote(%L::uuid, %L::uuid, %L::uuid, null)',
    (select payload #>> '{condominium,id}' from operations_workspace),
    (select (proposal).id::text from test_proposal),
    (
      select id::text
      from public.governance_options
      where proposal_id = (select (proposal).id from test_proposal)
      limit 1
    )
  ),
  'P0001',
  null,
  'unrelated user cannot cast a governance vote'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select is(
  (
    select (public.transition_governance_proposal(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (proposal).id from test_proposal),
      'close',
      2
    )).status::text
  ),
  'closed',
  'open proposal can be closed'
);
select is(
  (
    select (public.transition_governance_proposal(
      (select (payload #>> '{condominium,id}')::uuid from operations_workspace),
      (select (proposal).id from test_proposal),
      'approve',
      3
    )).status::text
  ),
  'approved',
  'closed proposal can be formally approved'
);
select is(
  (
    select count(*)
    from public.governance_events
    where proposal_id = (select (proposal).id from test_proposal)
  ),
  5::bigint,
  'proposal lifecycle and vote are recorded in the audit trail'
);

select * from finish();
rollback;
