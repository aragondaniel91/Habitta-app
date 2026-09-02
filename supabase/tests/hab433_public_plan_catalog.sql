begin;
select plan(12);

select has_function(
  'public',
  'get_public_plan_catalog',
  array[]::text[],
  'the public plan catalogue contract exists'
);

select ok(
  (select has_function_privilege('anon', p.oid, 'EXECUTE')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_public_plan_catalog'),
  'anon may execute the narrow public catalogue contract'
);

select ok(
  (select has_function_privilege('authenticated', p.oid, 'EXECUTE')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_public_plan_catalog'),
  'authenticated callers may execute the same catalogue contract'
);

select ok(
  not has_table_privilege('anon', 'public.plans', 'SELECT'),
  'anon still cannot select the underlying plan table directly'
);
select ok(
  not has_table_privilege('anon', 'public.capabilities', 'SELECT'),
  'anon still cannot select the capability registry directly'
);
select ok(
  not has_table_privilege('anon', 'public.plan_capabilities', 'SELECT'),
  'anon still cannot select plan capability rows directly'
);
select ok(
  not has_table_privilege('anon', 'public.subscription_terms', 'SELECT'),
  'anon cannot read customer contracted terms'
);
select ok(
  not has_table_privilege('anon', 'public.subscriptions', 'SELECT'),
  'anon cannot enumerate customer subscriptions'
);

select is(
  (
    select jsonb_agg(
      jsonb_build_array(
        code,
        name,
        catalog_monthly_usd,
        catalog_annual_usd,
        default_unit_limit,
        sort_order
      )
      order by sort_order
    )
    from public.get_public_plan_catalog()
  ),
  '[
    ["esencial", "Habitta Esencial", 29.00, 290.00, 30, 1],
    ["comunidad", "Habitta Comunidad", 49.00, 490.00, 80, 2],
    ["pro", "Habitta Pro", 79.00, 790.00, 150, 3],
    ["plus", "Habitta Plus", 129.00, 1290.00, 300, 4],
    ["enterprise", "Habitta Enterprise", 169.00, 1690.00, 500, 5]
  ]'::jsonb,
  'public catalogue prices, limits and order come from authoritative plan rows'
);

select is(
  (
    select count(*)
    from public.get_public_plan_catalog() p,
      lateral jsonb_array_elements(p.capabilities) capability
    where capability ?| array[
      'customer_id',
      'condominium_id',
      'subscription_id',
      'contracted_period_amount',
      'catalog_reference_amount',
      'authorized_by'
    ]
  ),
  0::bigint,
  'public capability summaries contain no customer-specific commercial fields'
);

update public.plans set is_public = false where code = 'enterprise';
select is(
  (select count(*) from public.get_public_plan_catalog()),
  4::bigint,
  'non-public plans disappear from the public contract'
);
update public.plans set is_public = true where code = 'enterprise';

set local role anon;
select lives_ok(
  $$select * from public.get_public_plan_catalog()$$,
  'anon can actually execute the public catalogue contract under its own role'
);

select * from finish();
rollback;
