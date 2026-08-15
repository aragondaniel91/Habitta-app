create or replace function public.schedule_initial_recurring_charge_run()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  period_start date;
begin
  if new.status <> 'active' then
    return new;
  end if;

  period_start := date_trunc('month', new.starts_on)::date;

  insert into public.recurring_charge_runs (
    condominium_id,
    plan_id,
    period,
    issue_date,
    due_date,
    currency_code,
    status
  )
  values (
    new.condominium_id,
    new.id,
    to_char(period_start, 'YYYY-MM'),
    period_start + (new.issue_day - 1),
    period_start + (new.due_day - 1),
    new.currency_code,
    'scheduled'
  )
  on conflict (plan_id, period) do nothing;

  return new;
end;
$$;

create trigger recurring_plan_schedule_initial_run
after insert on public.recurring_charge_plans
for each row execute function public.schedule_initial_recurring_charge_run();

create or replace function public.schedule_next_recurring_charge_run()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  plan public.recurring_charge_plans;
  next_period_start date;
begin
  if new.status <> 'posted' or old.status = 'posted' then
    return new;
  end if;

  select * into plan
  from public.recurring_charge_plans
  where id = new.plan_id;

  if plan.id is null or plan.status <> 'active' then
    return new;
  end if;

  next_period_start := ((new.period || '-01')::date + interval '1 month')::date;

  if plan.ends_on is not null
    and next_period_start > date_trunc('month', plan.ends_on)::date
  then
    return new;
  end if;

  insert into public.recurring_charge_runs (
    condominium_id,
    plan_id,
    period,
    issue_date,
    due_date,
    currency_code,
    status
  )
  values (
    plan.condominium_id,
    plan.id,
    to_char(next_period_start, 'YYYY-MM'),
    next_period_start + (plan.issue_day - 1),
    next_period_start + (plan.due_day - 1),
    plan.currency_code,
    'scheduled'
  )
  on conflict (plan_id, period) do nothing;

  return new;
end;
$$;

create trigger recurring_run_schedule_next_period
after update of status on public.recurring_charge_runs
for each row
when (new.status = 'posted')
execute function public.schedule_next_recurring_charge_run();

revoke all on function public.schedule_initial_recurring_charge_run() from public, anon, authenticated;
revoke all on function public.schedule_next_recurring_charge_run() from public, anon, authenticated;
