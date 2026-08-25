create or replace function public.update_recurring_charge_plan(
  target uuid,
  target_plan uuid,
  target_concept uuid,
  target_scope uuid,
  plan_name text,
  plan_distribution public.recurring_charge_distribution,
  plan_amount numeric,
  plan_currency text,
  plan_starts_on date,
  plan_issue_day smallint default 1,
  plan_due_day smallint default 10,
  plan_ends_on date default null
)
returns public.recurring_charge_plans
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_plan public.recurring_charge_plans;
  updated_plan public.recurring_charge_plans;
  starts_period date;
  ends_period date;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  select * into current_plan
  from public.recurring_charge_plans
  where id = target_plan
    and condominium_id = target
  for update;

  if current_plan.id is null or current_plan.status <> 'active' then
    raise exception 'recurring plan unavailable';
  end if;

  if trim(plan_name) = ''
    or plan_amount <= 0
    or plan_amount <> round(plan_amount, 2)
    or upper(plan_currency) !~ '^[A-Z]{3}$'
    or plan_issue_day not between 1 and 28
    or plan_due_day not between plan_issue_day and 28
    or (plan_ends_on is not null and plan_ends_on < plan_starts_on)
  then
    raise exception 'invalid recurring charge plan';
  end if;

  if not exists (
    select 1
    from public.charge_concepts c
    where c.id = target_concept
      and c.condominium_id = target
      and c.is_active
  ) or not exists (
    select 1
    from public.financial_scopes s
    where s.id = target_scope
      and s.condominium_id = target
      and s.is_active
  ) then
    raise exception 'concept or financial scope unavailable';
  end if;

  if exists (
    select 1
    from public.recurring_charge_runs r
    where r.plan_id = target_plan
      and r.status = 'pending_review'
  ) then
    raise exception 'recurring plan has pending review run';
  end if;

  starts_period := date_trunc('month', plan_starts_on)::date;
  ends_period := case
    when plan_ends_on is null then null
    else date_trunc('month', plan_ends_on)::date
  end;

  if exists (
    select 1
    from public.recurring_charge_runs r
    where r.plan_id = target_plan
      and r.status = 'posted'
      and (
        (r.period || '-01')::date < starts_period
        or (ends_period is not null and (r.period || '-01')::date > ends_period)
      )
  ) then
    raise exception 'posted recurring history outside edited plan';
  end if;

  if exists (
    select 1
    from public.recurring_charge_runs r
    where r.plan_id = target_plan
      and r.status = 'scheduled'
      and (
        (r.period || '-01')::date < starts_period
        or (ends_period is not null and (r.period || '-01')::date > ends_period)
      )
  ) then
    raise exception 'scheduled recurring period outside edited plan';
  end if;

  update public.recurring_charge_plans
  set concept_id = target_concept,
      financial_scope_id = target_scope,
      name = trim(plan_name),
      distribution = plan_distribution,
      amount = plan_amount,
      currency_code = upper(plan_currency),
      starts_on = plan_starts_on,
      ends_on = plan_ends_on,
      issue_day = plan_issue_day,
      due_day = plan_due_day,
      updated_at = now()
  where id = current_plan.id
  returning * into updated_plan;

  update public.recurring_charge_runs
  set issue_date = (period || '-01')::date + (plan_issue_day - 1),
      due_date = (period || '-01')::date + (plan_due_day - 1),
      currency_code = upper(plan_currency),
      updated_at = now()
  where plan_id = current_plan.id
    and status = 'scheduled';

  return updated_plan;
end;
$$;

revoke all on function public.update_recurring_charge_plan(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  public.recurring_charge_distribution,
  numeric,
  text,
  date,
  smallint,
  smallint,
  date
) from public, anon;

grant execute on function public.update_recurring_charge_plan(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  public.recurring_charge_distribution,
  numeric,
  text,
  date,
  smallint,
  smallint,
  date
) to authenticated;
