begin;
select plan(7);

select like(
  pg_get_functiondef('public.schedule_recurring_charge_run(uuid,text)'::regprocedure),
  '%period outside active plan%',
  'schedule keeps the plan-vigency domain error consumed by the API'
);

select like(
  pg_get_functiondef('public.prepare_recurring_charge_run(uuid)'::regprocedure),
  '%only scheduled recurring runs can be prepared%',
  'prepare keeps the invalid-state domain error consumed by the API'
);

select like(
  pg_get_functiondef('public.prepare_recurring_charge_run(uuid)'::regprocedure),
  '%financial scope has no active units%',
  'prepare keeps the empty-scope domain error consumed by the API'
);

select like(
  pg_get_functiondef('public.prepare_recurring_charge_run(uuid)'::regprocedure),
  '%all scoped units require a participation percentage%',
  'prepare keeps the incomplete-participation domain error consumed by the API'
);

select like(
  pg_get_functiondef('public.prepare_recurring_charge_run(uuid)'::regprocedure),
  '%invalid participation total%',
  'prepare keeps the invalid-participation domain error consumed by the API'
);

select like(
  pg_get_functiondef('public.post_recurring_charge_run(uuid)'::regprocedure),
  '%recurring charge run must be reviewed before posting%',
  'post keeps the review-gate domain error consumed by the API'
);

select like(
  pg_get_functiondef(
    'public.create_recurring_charge_plan(uuid,uuid,uuid,text,public.recurring_charge_distribution,numeric,text,date,smallint,smallint,date)'::regprocedure
  ),
  '%concept or financial scope unavailable%',
  'plan creation keeps the unavailable-dependency domain error consumed by the API'
);

select * from finish();
rollback;
