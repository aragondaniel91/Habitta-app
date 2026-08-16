begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

create temporary table hab186_exchange_rate_time_guard (
  rate_at timestamptz not null
);
create trigger hab186_exchange_rate_time_guard_trigger
before insert on hab186_exchange_rate_time_guard
for each row execute function public.guard_exchange_rate_observation_time();

select lives_ok(
  $$insert into hab186_exchange_rate_time_guard(rate_at) values (now())$$,
  'exchange-rate evidence accepts an observation timestamp at the present time'
);
select throws_ok(
  $$insert into hab186_exchange_rate_time_guard(rate_at) values (now() + interval '1 day')$$,
  'P0001',
  'exchange rate observation cannot be in the future',
  'exchange-rate evidence rejects a future observation timestamp'
);

create temporary table hab186_solvency_date_guard (
  as_of_date date not null
);
create trigger hab186_solvency_date_guard_trigger
before insert on hab186_solvency_date_guard
for each row execute function public.guard_solvency_certificate_as_of_date();

select lives_ok(
  $$insert into hab186_solvency_date_guard(as_of_date) values (current_date)$$,
  'solvency evidence accepts the current accounting date'
);
select throws_ok(
  $$insert into hab186_solvency_date_guard(as_of_date) values (current_date + 1)$$,
  'P0001',
  'solvency certificate date cannot be in the future',
  'solvency evidence rejects a future accounting date'
);

select finish();
rollback;
