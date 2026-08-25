begin;
select plan(7);

select like(
  pg_get_functiondef((
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'schedule_recurring_charge_run'
    limit 1
  )),
  '%period outside active plan%',
  'schedule keeps the plan-vigency domain error consumed by the API'
);

select like(
  pg_get_functiondef((
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prepare_recurring_charge_run'
    limit 1
  )),
  '%only scheduled recurring runs can be prepared%',
  'prepare keeps the invalid-state domain error consumed by the API'
);

select like(
  pg_get_functiondef((
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prepare_recurring_charge_run'
    limit 1
  )),
  '%financial scope has no active units%',
  'prepare keeps the empty-scope domain error consumed by the API'
);

select like(
  pg_get_functiondef((
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prepare_recurring_charge_run'
    limit 1
  )),
  '%all scoped units require a participation percentage%',
  'prepare keeps the incomplete-participation domain error consumed by the API'
);

select like(
  pg_get_functiondef((
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prepare_recurring_charge_run'
    limit 1
  )),
  '%invalid participation total%',
  'prepare keeps the invalid-participation domain error consumed by the API'
);

select like(
  pg_get_functiondef((
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'post_recurring_charge_run'
    limit 1
  )),
  '%recurring charge run must be reviewed before posting%',
  'post keeps the review-gate domain error consumed by the API'
);

select like(
  pg_get_functiondef((
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_recurring_charge_plan'
    limit 1
  )),
  '%concept or financial scope unavailable%',
  'plan creation keeps the unavailable-dependency domain error consumed by the API'
);

select * from finish();
rollback;
