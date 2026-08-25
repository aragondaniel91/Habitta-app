begin;
select plan(7);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'schedule_recurring_charge_run'
      and position('period outside active plan' in p.prosrc) > 0
  ),
  'schedule keeps the plan-vigency domain error consumed by the API'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'prepare_recurring_charge_run'
      and position('only scheduled recurring runs can be prepared' in p.prosrc) > 0
  ),
  'prepare keeps the invalid-state domain error consumed by the API'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'prepare_recurring_charge_run'
      and position('financial scope has no active units' in p.prosrc) > 0
  ),
  'prepare keeps the empty-scope domain error consumed by the API'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'prepare_recurring_charge_run'
      and position('all scoped units require a participation percentage' in p.prosrc) > 0
  ),
  'prepare keeps the incomplete-participation domain error consumed by the API'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'prepare_recurring_charge_run'
      and position('invalid participation total' in p.prosrc) > 0
  ),
  'prepare keeps the invalid-participation domain error consumed by the API'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'post_recurring_charge_run'
      and position('recurring charge run must be reviewed before posting' in p.prosrc) > 0
  ),
  'post keeps the review-gate domain error consumed by the API'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_recurring_charge_plan'
      and position('concept or financial scope unavailable' in p.prosrc) > 0
  ),
  'plan creation keeps the unavailable-dependency domain error consumed by the API'
);

select * from finish();
rollback;
