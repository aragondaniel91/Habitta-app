begin;
select plan(6);

select ok(
  (select c.relrowsecurity from pg_class c where c.oid='public.charge_installment_plan_publications'::regclass),
  'private installment publication idempotency table has RLS enabled'
);
select ok(
  not has_table_privilege('anon','public.charge_installment_plan_publications','SELECT'),
  'anon cannot read private publication metadata'
);
select ok(
  not has_table_privilege('authenticated','public.charge_installment_plan_publications','SELECT'),
  'authenticated clients cannot read private publication metadata directly'
);
select ok(
  not has_table_privilege('authenticated','public.charge_installment_plan_publications','INSERT'),
  'authenticated clients cannot insert private publication metadata directly'
);
select ok(
  not has_table_privilege('authenticated','public.charge_installment_plan_publications','UPDATE'),
  'authenticated clients cannot modify private publication metadata directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.post_charge_installment_plans(uuid,uuid,text,text,date,date,numeric,jsonb,jsonb,text)',
    'EXECUTE'
  ),
  'permission-checked publishing RPC remains callable'
);

select * from finish();
rollback;
