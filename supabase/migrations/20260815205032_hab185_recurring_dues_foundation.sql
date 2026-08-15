create type public.financial_scope_kind as enum (
  'condominium',
  'building',
  'custom'
);

create type public.recurring_charge_frequency as enum ('monthly');
create type public.recurring_charge_distribution as enum (
  'fixed_per_unit',
  'participation_percentage'
);
create type public.recurring_charge_plan_status as enum ('active', 'inactive');
create type public.recurring_charge_run_status as enum (
  'scheduled',
  'pending_review',
  'posted',
  'cancelled'
);

create table public.financial_scopes (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  kind public.financial_scope_kind not null,
  building_id uuid references public.buildings(id) on delete restrict,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (condominium_id, code),
  unique (id, condominium_id),
  check (
    (kind = 'building' and building_id is not null)
    or (kind <> 'building' and building_id is null)
  )
);

create unique index financial_scopes_single_condominium_scope
  on public.financial_scopes (condominium_id)
  where kind = 'condominium';

create unique index financial_scopes_single_building_scope
  on public.financial_scopes (condominium_id, building_id)
  where kind = 'building';

create table public.financial_scope_units (
  scope_id uuid not null,
  condominium_id uuid not null,
  unit_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (scope_id, unit_id),
  foreign key (scope_id, condominium_id)
    references public.financial_scopes(id, condominium_id) on delete cascade,
  foreign key (unit_id, condominium_id)
    references public.units(id, condominium_id) on delete cascade
);

create table public.recurring_charge_plans (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  concept_id uuid not null,
  financial_scope_id uuid not null,
  name text not null,
  frequency public.recurring_charge_frequency not null default 'monthly',
  distribution public.recurring_charge_distribution not null,
  amount numeric(18,2) not null check (amount > 0 and amount = round(amount, 2)),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  issue_day smallint not null default 1 check (issue_day between 1 and 28),
  due_day smallint not null default 10 check (due_day between 1 and 28 and due_day >= issue_day),
  starts_on date not null,
  ends_on date,
  status public.recurring_charge_plan_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (concept_id, condominium_id)
    references public.charge_concepts(id, condominium_id),
  foreign key (financial_scope_id, condominium_id)
    references public.financial_scopes(id, condominium_id),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.recurring_charge_runs (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  plan_id uuid not null,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  issue_date date not null,
  due_date date not null check (due_date >= issue_date),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status public.recurring_charge_run_status not null default 'scheduled',
  distribution_snapshot jsonb,
  total_amount numeric(18,2),
  charge_batch_id uuid,
  prepared_at timestamptz,
  prepared_by uuid references auth.users(id),
  posted_at timestamptz,
  posted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, period),
  unique (id, condominium_id),
  foreign key (plan_id, condominium_id)
    references public.recurring_charge_plans(id, condominium_id) on delete cascade,
  foreign key (charge_batch_id, condominium_id)
    references public.charge_batches(id, condominium_id),
  check (
    (status = 'scheduled' and distribution_snapshot is null and total_amount is null)
    or (
      status in ('pending_review', 'posted')
      and distribution_snapshot is not null
      and jsonb_typeof(distribution_snapshot) = 'array'
      and total_amount is not null
      and total_amount > 0
    )
    or status = 'cancelled'
  ),
  check (
    (status = 'posted' and charge_batch_id is not null and posted_at is not null and posted_by is not null)
    or status <> 'posted'
  )
);

create index recurring_charge_runs_review_idx
  on public.recurring_charge_runs (condominium_id, status, period);

create or replace function public.assert_financial_scope_building_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.kind = 'building' and not exists (
    select 1
    from public.buildings b
    where b.id = new.building_id
      and b.condominium_id = new.condominium_id
  ) then
    raise exception 'building and financial scope must share condominium';
  end if;
  return new;
end;
$$;

create trigger financial_scope_building_tenant
before insert or update on public.financial_scopes
for each row execute function public.assert_financial_scope_building_tenant();

create or replace function public.protect_posted_recurring_run()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'posted' then
    raise exception 'posted recurring charge runs are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger recurring_run_immutable
before update or delete on public.recurring_charge_runs
for each row execute function public.protect_posted_recurring_run();

alter table public.financial_scopes enable row level security;
alter table public.financial_scope_units enable row level security;
alter table public.recurring_charge_plans enable row level security;
alter table public.recurring_charge_runs enable row level security;

create policy financial_scopes_read on public.financial_scopes
for select using (public.can_read_receivables(condominium_id));

create policy financial_scope_units_read on public.financial_scope_units
for select using (public.can_read_receivables(condominium_id));

create policy recurring_charge_plans_read on public.recurring_charge_plans
for select using (public.can_read_receivables(condominium_id));

create policy recurring_charge_runs_read on public.recurring_charge_runs
for select using (public.can_read_receivables(condominium_id));

revoke insert, update, delete on public.financial_scopes from authenticated;
revoke insert, update, delete on public.financial_scope_units from authenticated;
revoke insert, update, delete on public.recurring_charge_plans from authenticated;
revoke insert, update, delete on public.recurring_charge_runs from authenticated;

grant select on public.financial_scopes to authenticated;
grant select on public.financial_scope_units to authenticated;
grant select on public.recurring_charge_plans to authenticated;
grant select on public.recurring_charge_runs to authenticated;

create or replace function public.create_financial_scope(
  target uuid,
  scope_code text,
  scope_name text,
  scope_kind public.financial_scope_kind default 'condominium',
  target_building uuid default null,
  target_units uuid[] default null
)
returns public.financial_scopes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  scope public.financial_scopes;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  if trim(scope_code) = '' or trim(scope_name) = '' then
    raise exception 'scope code and name are required';
  end if;

  if scope_kind = 'custom' and coalesce(cardinality(target_units), 0) = 0 then
    raise exception 'custom financial scope requires units';
  end if;

  insert into public.financial_scopes (
    condominium_id,
    kind,
    building_id,
    code,
    name,
    created_by
  )
  values (
    target,
    scope_kind,
    target_building,
    lower(trim(scope_code)),
    trim(scope_name),
    auth.uid()
  )
  returning * into scope;

  if scope_kind = 'custom' then
    if exists (
      select 1
      from unnest(target_units) unit_id
      where not exists (
        select 1
        from public.units u
        where u.id = unit_id
          and u.condominium_id = target
      )
    ) then
      raise exception 'scope unit and financial scope must share condominium';
    end if;

    insert into public.financial_scope_units (scope_id, condominium_id, unit_id, created_by)
    select scope.id, target, unit_id, auth.uid()
    from unnest(target_units) unit_id;
  end if;

  return scope;
end;
$$;

create or replace function public.create_recurring_charge_plan(
  target uuid,
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
  plan public.recurring_charge_plans;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
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

  insert into public.recurring_charge_plans (
    condominium_id,
    concept_id,
    financial_scope_id,
    name,
    distribution,
    amount,
    currency_code,
    issue_day,
    due_day,
    starts_on,
    ends_on,
    created_by
  )
  values (
    target,
    target_concept,
    target_scope,
    trim(plan_name),
    plan_distribution,
    plan_amount,
    upper(plan_currency),
    plan_issue_day,
    plan_due_day,
    plan_starts_on,
    plan_ends_on,
    auth.uid()
  )
  returning * into plan;

  return plan;
end;
$$;

create or replace function public.schedule_recurring_charge_run(
  target_plan uuid,
  target_period text
)
returns public.recurring_charge_runs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  plan public.recurring_charge_plans;
  period_start date;
  issue_on date;
  due_on date;
  run public.recurring_charge_runs;
begin
  if target_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid recurring period';
  end if;

  select * into plan
  from public.recurring_charge_plans
  where id = target_plan;

  if plan.id is null or auth.uid() is null or not public.can_manage_receivables(plan.condominium_id) then
    raise exception 'permission denied';
  end if;

  period_start := (target_period || '-01')::date;

  if plan.status <> 'active'
    or period_start < date_trunc('month', plan.starts_on)::date
    or (plan.ends_on is not null and period_start > date_trunc('month', plan.ends_on)::date)
  then
    raise exception 'period outside active plan';
  end if;

  issue_on := period_start + (plan.issue_day - 1);
  due_on := period_start + (plan.due_day - 1);

  insert into public.recurring_charge_runs (
    condominium_id,
    plan_id,
    period,
    issue_date,
    due_date,
    currency_code
  )
  values (
    plan.condominium_id,
    plan.id,
    target_period,
    issue_on,
    due_on,
    plan.currency_code
  )
  on conflict (plan_id, period) do update
    set period = excluded.period
  returning * into run;

  return run;
end;
$$;

create or replace function public.prepare_recurring_charge_run(target_run uuid)
returns public.recurring_charge_runs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.recurring_charge_runs;
  plan public.recurring_charge_plans;
  scope public.financial_scopes;
  rows jsonb;
  unit_count integer;
  total_weight numeric;
  target_cents bigint;
  distributed_cents bigint;
  remainder_cents bigint;
  calculated_total numeric(18,2);
begin
  select * into run
  from public.recurring_charge_runs
  where id = target_run
  for update;

  if run.id is null or auth.uid() is null or not public.can_manage_receivables(run.condominium_id) then
    raise exception 'permission denied';
  end if;

  if run.status = 'pending_review' then
    return run;
  end if;

  if run.status <> 'scheduled' then
    raise exception 'only scheduled recurring runs can be prepared';
  end if;

  select * into plan from public.recurring_charge_plans where id = run.plan_id;
  select * into scope from public.financial_scopes where id = plan.financial_scope_id;

  create temporary table hab185_scope_units on commit drop as
  select u.id, u.code, u.ownership_percentage
  from public.units u
  where u.condominium_id = run.condominium_id
    and u.status = 'active'
    and (
      scope.kind = 'condominium'
      or (scope.kind = 'building' and u.building_id = scope.building_id)
      or (
        scope.kind = 'custom'
        and exists (
          select 1
          from public.financial_scope_units su
          where su.scope_id = scope.id
            and su.unit_id = u.id
        )
      )
    );

  select count(*) into unit_count from hab185_scope_units;
  if unit_count = 0 then
    raise exception 'financial scope has no active units';
  end if;

  if plan.distribution = 'fixed_per_unit' then
    select jsonb_agg(
      jsonb_build_object(
        'unit_id', id,
        'unit_code', code,
        'amount', to_char(plan.amount, 'FM999999999999990.00')
      )
      order by code, id
    )
    into rows
    from hab185_scope_units;

    calculated_total := plan.amount * unit_count;
  else
    if exists (
      select 1
      from hab185_scope_units
      where ownership_percentage is null or ownership_percentage <= 0
    ) then
      raise exception 'all scoped units require a participation percentage';
    end if;

    select sum(ownership_percentage) into total_weight from hab185_scope_units;
    if coalesce(total_weight, 0) <= 0 then
      raise exception 'invalid participation total';
    end if;

    target_cents := round(plan.amount * 100)::bigint;

    create temporary table hab185_allocations on commit drop as
    select
      id,
      code,
      ownership_percentage,
      floor(target_cents * ownership_percentage / total_weight)::bigint as base_cents,
      (target_cents * ownership_percentage / total_weight)
        - floor(target_cents * ownership_percentage / total_weight) as fractional_cents
    from hab185_scope_units;

    select sum(base_cents) into distributed_cents from hab185_allocations;
    remainder_cents := target_cents - distributed_cents;

    with ranked as (
      select
        a.*,
        row_number() over (order by fractional_cents desc, code, id) as remainder_rank
      from hab185_allocations a
    )
    select jsonb_agg(
      jsonb_build_object(
        'unit_id', id,
        'unit_code', code,
        'participation_percentage', to_char(ownership_percentage, 'FM999990.0000'),
        'amount', to_char(
          (base_cents + case when remainder_rank <= remainder_cents then 1 else 0 end)::numeric / 100,
          'FM999999999999990.00'
        )
      )
      order by code, id
    )
    into rows
    from ranked;

    calculated_total := plan.amount;
  end if;

  update public.recurring_charge_runs
  set status = 'pending_review',
      distribution_snapshot = rows,
      total_amount = calculated_total,
      prepared_at = now(),
      prepared_by = auth.uid(),
      updated_at = now()
  where id = run.id
  returning * into run;

  perform public.emit_integration_outbox_event(
    run.condominium_id,
    'finance.recurring_charge.pending_review',
    'recurring_charge_run',
    run.id,
    jsonb_build_object(
      'run_id', run.id,
      'plan_id', run.plan_id,
      'period', run.period,
      'currency_code', run.currency_code,
      'total_amount', to_char(run.total_amount, 'FM999999999999990.00')
    ),
    'recurring-charge-pending-review:' || run.id::text
  );

  return run;
end;
$$;

create or replace function public.post_recurring_charge_run(target_run uuid)
returns public.recurring_charge_runs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.recurring_charge_runs;
  plan public.recurring_charge_plans;
  batch_result jsonb;
  batch_id uuid;
  batch_rows jsonb;
begin
  select * into run
  from public.recurring_charge_runs
  where id = target_run
  for update;

  if run.id is null or auth.uid() is null or not public.can_manage_receivables(run.condominium_id) then
    raise exception 'permission denied';
  end if;

  if run.status = 'posted' then
    return run;
  end if;

  if run.status <> 'pending_review' then
    raise exception 'recurring charge run must be reviewed before posting';
  end if;

  select * into plan
  from public.recurring_charge_plans
  where id = run.plan_id;

  select jsonb_agg(
    jsonb_build_object(
      'unit_id', value ->> 'unit_id',
      'amount', (value ->> 'amount')::numeric
    )
  )
  into batch_rows
  from jsonb_array_elements(run.distribution_snapshot);

  batch_result := public.post_charge_batch(
    run.condominium_id,
    plan.concept_id,
    plan.name || ' · ' || run.period,
    run.currency_code,
    run.issue_date,
    run.due_date,
    'custom_per_unit',
    batch_rows,
    'recurring:' || run.id::text,
    null
  );

  batch_id := (batch_result ->> 'batch_id')::uuid;

  update public.recurring_charge_runs
  set status = 'posted',
      charge_batch_id = batch_id,
      posted_at = now(),
      posted_by = auth.uid(),
      updated_at = now()
  where id = run.id
  returning * into run;

  perform public.emit_integration_outbox_event(
    run.condominium_id,
    'finance.recurring_charge.posted',
    'recurring_charge_run',
    run.id,
    jsonb_build_object(
      'run_id', run.id,
      'plan_id', run.plan_id,
      'charge_batch_id', run.charge_batch_id,
      'period', run.period,
      'currency_code', run.currency_code,
      'total_amount', to_char(run.total_amount, 'FM999999999999990.00')
    ),
    'recurring-charge-posted:' || run.id::text
  );

  return run;
end;
$$;

revoke all on function public.assert_financial_scope_building_tenant() from public, anon, authenticated;
revoke all on function public.protect_posted_recurring_run() from public, anon, authenticated;
revoke all on function public.create_financial_scope(uuid, text, text, public.financial_scope_kind, uuid, uuid[]) from public, anon;
revoke all on function public.create_recurring_charge_plan(uuid, uuid, uuid, text, public.recurring_charge_distribution, numeric, text, date, smallint, smallint, date) from public, anon;
revoke all on function public.schedule_recurring_charge_run(uuid, text) from public, anon;
revoke all on function public.prepare_recurring_charge_run(uuid) from public, anon;
revoke all on function public.post_recurring_charge_run(uuid) from public, anon;

grant execute on function public.create_financial_scope(uuid, text, text, public.financial_scope_kind, uuid, uuid[]) to authenticated;
grant execute on function public.create_recurring_charge_plan(uuid, uuid, uuid, text, public.recurring_charge_distribution, numeric, text, date, smallint, smallint, date) to authenticated;
grant execute on function public.schedule_recurring_charge_run(uuid, text) to authenticated;
grant execute on function public.prepare_recurring_charge_run(uuid) to authenticated;
grant execute on function public.post_recurring_charge_run(uuid) to authenticated;
