begin;

select plan(2);

select is(
  (
    select data_type::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'charge_concepts'
      and column_name = 'default_amount'
  ),
  'numeric',
  'charge concept default amount remains a PostgreSQL numeric value'
);

select is(
  jsonb_typeof(to_jsonb(30.00::numeric)),
  'number',
  'PostgreSQL numeric money is represented as a JSON number at the API boundary'
);

select * from finish();
rollback;
