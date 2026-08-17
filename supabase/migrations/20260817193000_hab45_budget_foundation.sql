-- HAB-45: authoritative condominium budget domain.
-- Budgets intentionally reuse expense categories and preserve currency boundaries.
-- No exchange-rate conversion is performed anywhere in this domain.

create type public.budget_version_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'superseded'
);

create table public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  starts_on date not null,
  ends_on date not null,
  current_version_number integer not null default 0 check (current_version_number >= 0),
  approved_version_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  check (ends_on >= starts_on)
);

create index budget_periods_condominium_dates_idx
  on public.budget_periods (condominium_id, starts_on desc, ends_on desc);

create table public.budget_versions (
  id uuid primary key default gen_random_uuid(),
  budget_period_id uuid not null,
  condominium_id uuid not null,
  version_number integer not null check (version_number > 0),
  status public.budget_version_status not null default 'draft',
  request_id uuid not null,
  revision_note text check (revision_note is null or char_length(revision_note) <= 1000),
  created_by uuid not null references auth.users(id),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, budget_period_id, condominium_id),
  unique (budget_period_id, version_number),
  unique (condominium_id, request_id),
  foreign key (budget_period_id, condominium_id)
    references public.budget_periods(id, condominium_id) on delete cascade,
  check (
    (status = 'draft' and submitted_at is null and approved_at is null and superseded_at is null)
    or (status = 'pending_approval' and submitted_at is not null and approved_at is null and superseded_at is null)
    or (status = 'approved' and submitted_at is not null and approved_at is not null and superseded_at is null)
    or (status = 'superseded' and superseded_at is not null)
  )
);

create index budget_versions_period_idx
  on public.budget_versions (budget_period_id, version_number desc);

alter table public.budget_periods
  add constraint budget_periods_approved_version_fk
  foreign key (approved_version_id, id, condominium_id)
  references public.budget_versions(id, budget_period_id, condominium_id);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_version_id uuid not null,
  budget_period_id uuid not null,
  condominium_id uuid not null,
  category_id uuid not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount numeric(18, 2) not null check (amount > 0),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (budget_version_id, category_id, currency_code),
  foreign key (budget_version_id, budget_period_id, condominium_id)
    references public.budget_versions(id, budget_period_id, condominium_id) on delete cascade,
  foreign key (category_id, condominium_id)
    references public.expense_categories(id, condominium_id)
);

create index budget_lines_period_currency_idx
  on public.budget_lines (budget_period_id, currency_code, category_id);

create table public.budget_events (
  id uuid primary key default gen_random_uuid(),
  budget_period_id uuid not null,
  budget_version_id uuid not null,
  condominium_id uuid not null,
  event_type text not null check (
    event_type in ('created', 'revised', 'submitted', 'approved', 'superseded')
  ),
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (budget_version_id, budget_period_id, condominium_id)
    references public.budget_versions(id, budget_period_id, condominium_id) on delete cascade
);

create index budget_events_period_idx
  on public.budget_events (budget_period_id, occurred_at asc);

create function public.can_read_budgets(target_condominium uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_read_expenses(target_condominium);
$$;

create function public.can_manage_budgets(target_condominium uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_manage_expenses(target_condominium);
$$;

create function public.can_approve_budgets(target_condominium uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_approve_expenses(target_condominium);
$$;

revoke execute on function public.can_read_budgets(uuid) from public;
revoke execute on function public.can_manage_budgets(uuid) from public;
revoke execute on function public.can_approve_budgets(uuid) from public;
grant execute on function public.can_read_budgets(uuid) to authenticated, service_role;
grant execute on function public.can_manage_budgets(uuid) to authenticated, service_role;
grant execute on function public.can_approve_budgets(uuid) to authenticated, service_role;

alter table public.budget_periods enable row level security;
alter table public.budget_versions enable row level security;
alter table public.budget_lines enable row level security;
alter table public.budget_events enable row level security;

create policy budget_periods_read on public.budget_periods
for select using (public.can_read_budgets(condominium_id));

create policy budget_versions_read on public.budget_versions
for select using (public.can_read_budgets(condominium_id));

create policy budget_lines_read on public.budget_lines
for select using (public.can_read_budgets(condominium_id));

create policy budget_events_read on public.budget_events
for select using (public.can_read_budgets(condominium_id));

grant select on public.budget_periods to authenticated;
grant select on public.budget_versions to authenticated;
grant select on public.budget_lines to authenticated;
grant select on public.budget_events to authenticated;

revoke insert, update, delete on public.budget_periods from anon, authenticated;
revoke insert, update, delete on public.budget_versions from anon, authenticated;
revoke insert, update, delete on public.budget_lines from anon, authenticated;
revoke insert, update, delete on public.budget_events from anon, authenticated;

create function public.reject_budget_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'budget history is immutable';
end;
$$;

revoke execute on function public.reject_budget_history_mutation() from public;

create trigger budget_lines_immutable
before update or delete on public.budget_lines
for each row execute function public.reject_budget_history_mutation();

create trigger budget_events_immutable
before update or delete on public.budget_events
for each row execute function public.reject_budget_history_mutation();

create function public.insert_budget_lines_from_json(
  target_version uuid,
  target_period uuid,
  target_condominium uuid,
  lines_value jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(lines_value) <> 'array'
    or jsonb_array_length(lines_value) < 1
    or jsonb_array_length(lines_value) > 500
  then
    raise exception 'budget lines must contain between 1 and 500 entries';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(lines_value) as line(
      category_id uuid,
      currency_code text,
      amount numeric,
      note text
    )
    left join public.expense_categories category
      on category.id = line.category_id
     and category.condominium_id = target_condominium
     and category.is_active
    where category.id is null
       or line.currency_code is null
       or upper(line.currency_code) !~ '^[A-Z]{3}$'
       or line.amount is null
       or line.amount <= 0
       or (line.note is not null and char_length(line.note) > 1000)
  ) then
    raise exception 'invalid budget line';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(lines_value) as line(
      category_id uuid,
      currency_code text,
      amount numeric,
      note text
    )
    group by line.category_id, upper(line.currency_code)
    having count(*) > 1
  ) then
    raise exception 'duplicate budget category and currency';
  end if;

  insert into public.budget_lines (
    budget_version_id,
    budget_period_id,
    condominium_id,
    category_id,
    currency_code,
    amount,
    note
  )
  select
    target_version,
    target_period,
    target_condominium,
    line.category_id,
    upper(line.currency_code),
    line.amount,
    nullif(trim(coalesce(line.note, '')), '')
  from jsonb_to_recordset(lines_value) as line(
    category_id uuid,
    currency_code text,
    amount numeric,
    note text
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.insert_budget_lines_from_json(uuid, uuid, uuid, jsonb) from public;

create function public.create_budget_period(
  target_condominium uuid,
  period_name text,
  starts_on_value date,
  ends_on_value date,
  lines_value jsonb,
  request_id_value uuid,
  revision_note_value text default null
)
returns public.budget_versions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  existing_version public.budget_versions;
  created_period public.budget_periods;
  created_version public.budget_versions;
begin
  if auth.uid() is null or not public.can_manage_budgets(target_condominium) then
    raise exception 'budget manager required';
  end if;

  if request_id_value is null then
    raise exception 'budget request id required';
  end if;

  select * into existing_version
  from public.budget_versions
  where condominium_id = target_condominium
    and request_id = request_id_value;

  if existing_version.id is not null then
    return existing_version;
  end if;

  if char_length(trim(coalesce(period_name, ''))) not between 1 and 160 then
    raise exception 'invalid budget period name';
  end if;

  if starts_on_value is null or ends_on_value is null or ends_on_value < starts_on_value then
    raise exception 'invalid budget period dates';
  end if;

  if revision_note_value is not null and char_length(revision_note_value) > 1000 then
    raise exception 'budget revision note too long';
  end if;

  insert into public.budget_periods (
    condominium_id, name, starts_on, ends_on, created_by
  ) values (
    target_condominium, trim(period_name), starts_on_value, ends_on_value, auth.uid()
  ) returning * into created_period;

  insert into public.budget_versions (
    budget_period_id,
    condominium_id,
    version_number,
    status,
    request_id,
    revision_note,
    created_by
  ) values (
    created_period.id,
    target_condominium,
    1,
    'draft',
    request_id_value,
    nullif(trim(coalesce(revision_note_value, '')), ''),
    auth.uid()
  ) returning * into created_version;

  perform public.insert_budget_lines_from_json(
    created_version.id,
    created_period.id,
    target_condominium,
    lines_value
  );

  update public.budget_periods
  set current_version_number = 1,
      updated_at = now()
  where id = created_period.id;

  insert into public.budget_events (
    budget_period_id, budget_version_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    created_period.id,
    created_version.id,
    target_condominium,
    'created',
    auth.uid(),
    jsonb_build_object('version_number', 1)
  );

  return created_version;
end;
$$;

create function public.create_budget_revision(
  target_condominium uuid,
  target_budget_period uuid,
  lines_value jsonb,
  request_id_value uuid,
  revision_note_value text default null
)
returns public.budget_versions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  period_row public.budget_periods;
  latest_version public.budget_versions;
  existing_version public.budget_versions;
  created_version public.budget_versions;
  next_version integer;
begin
  if auth.uid() is null or not public.can_manage_budgets(target_condominium) then
    raise exception 'budget manager required';
  end if;

  if request_id_value is null then
    raise exception 'budget request id required';
  end if;

  select * into existing_version
  from public.budget_versions
  where condominium_id = target_condominium
    and request_id = request_id_value;

  if existing_version.id is not null then
    if existing_version.budget_period_id <> target_budget_period then
      raise exception 'budget request id belongs to another period';
    end if;
    return existing_version;
  end if;

  select * into period_row
  from public.budget_periods
  where id = target_budget_period
    and condominium_id = target_condominium
  for update;

  if period_row.id is null then
    raise exception 'budget period not found';
  end if;

  select * into latest_version
  from public.budget_versions
  where budget_period_id = period_row.id
    and version_number = period_row.current_version_number
  for update;

  if latest_version.status = 'pending_approval' then
    raise exception 'pending budget must be approved before revision';
  end if;

  if latest_version.status = 'draft' then
    update public.budget_versions
    set status = 'superseded',
        superseded_at = now()
    where id = latest_version.id;

    insert into public.budget_events (
      budget_period_id, budget_version_id, condominium_id, event_type, actor_user_id, metadata
    ) values (
      period_row.id,
      latest_version.id,
      target_condominium,
      'superseded',
      auth.uid(),
      jsonb_build_object('reason', 'revised_before_submission')
    );
  end if;

  next_version := period_row.current_version_number + 1;

  insert into public.budget_versions (
    budget_period_id,
    condominium_id,
    version_number,
    status,
    request_id,
    revision_note,
    created_by
  ) values (
    period_row.id,
    target_condominium,
    next_version,
    'draft',
    request_id_value,
    nullif(trim(coalesce(revision_note_value, '')), ''),
    auth.uid()
  ) returning * into created_version;

  perform public.insert_budget_lines_from_json(
    created_version.id,
    period_row.id,
    target_condominium,
    lines_value
  );

  update public.budget_periods
  set current_version_number = next_version,
      updated_at = now()
  where id = period_row.id;

  insert into public.budget_events (
    budget_period_id, budget_version_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    period_row.id,
    created_version.id,
    target_condominium,
    'revised',
    auth.uid(),
    jsonb_build_object('version_number', next_version)
  );

  return created_version;
end;
$$;

create function public.submit_budget_version(
  target_condominium uuid,
  target_budget_period uuid,
  target_budget_version uuid
)
returns public.budget_versions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  period_row public.budget_periods;
  version_row public.budget_versions;
begin
  if auth.uid() is null or not public.can_manage_budgets(target_condominium) then
    raise exception 'budget manager required';
  end if;

  select * into period_row
  from public.budget_periods
  where id = target_budget_period
    and condominium_id = target_condominium
  for update;

  if period_row.id is null then
    raise exception 'budget period not found';
  end if;

  select * into version_row
  from public.budget_versions
  where id = target_budget_version
    and budget_period_id = period_row.id
    and condominium_id = target_condominium
  for update;

  if version_row.id is null
    or version_row.version_number <> period_row.current_version_number
    or version_row.status <> 'draft'
  then
    raise exception 'current draft budget version required';
  end if;

  update public.budget_versions
  set status = 'pending_approval',
      submitted_by = auth.uid(),
      submitted_at = now()
  where id = version_row.id
  returning * into version_row;

  insert into public.budget_events (
    budget_period_id, budget_version_id, condominium_id, event_type, actor_user_id
  ) values (
    period_row.id, version_row.id, target_condominium, 'submitted', auth.uid()
  );

  return version_row;
end;
$$;

create function public.approve_budget_version(
  target_condominium uuid,
  target_budget_period uuid,
  target_budget_version uuid
)
returns public.budget_versions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  period_row public.budget_periods;
  version_row public.budget_versions;
  previous_approved public.budget_versions;
begin
  if auth.uid() is null or not public.can_approve_budgets(target_condominium) then
    raise exception 'budget approver required';
  end if;

  select * into period_row
  from public.budget_periods
  where id = target_budget_period
    and condominium_id = target_condominium
  for update;

  if period_row.id is null then
    raise exception 'budget period not found';
  end if;

  select * into version_row
  from public.budget_versions
  where id = target_budget_version
    and budget_period_id = period_row.id
    and condominium_id = target_condominium
  for update;

  if version_row.id is null
    or version_row.version_number <> period_row.current_version_number
    or version_row.status <> 'pending_approval'
  then
    raise exception 'current pending budget version required';
  end if;

  if period_row.approved_version_id is not null
    and period_row.approved_version_id <> version_row.id
  then
    select * into previous_approved
    from public.budget_versions
    where id = period_row.approved_version_id
    for update;

    update public.budget_versions
    set status = 'superseded',
        superseded_at = now()
    where id = previous_approved.id;

    insert into public.budget_events (
      budget_period_id, budget_version_id, condominium_id, event_type, actor_user_id, metadata
    ) values (
      period_row.id,
      previous_approved.id,
      target_condominium,
      'superseded',
      auth.uid(),
      jsonb_build_object('replaced_by_version_id', version_row.id)
    );
  end if;

  update public.budget_versions
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  where id = version_row.id
  returning * into version_row;

  update public.budget_periods
  set approved_version_id = version_row.id,
      updated_at = now()
  where id = period_row.id;

  insert into public.budget_events (
    budget_period_id, budget_version_id, condominium_id, event_type, actor_user_id,
    metadata
  ) values (
    period_row.id,
    version_row.id,
    target_condominium,
    'approved',
    auth.uid(),
    jsonb_build_object('version_number', version_row.version_number)
  );

  return version_row;
end;
$$;

create function public.get_budget_actual_vs_budget(
  target_condominium uuid,
  target_budget_period uuid
)
returns table (
  category_id uuid,
  category_name text,
  currency_code text,
  budget_amount numeric,
  actual_amount numeric,
  variance_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  period_row public.budget_periods;
begin
  if auth.uid() is null or not public.can_read_budgets(target_condominium) then
    raise exception 'budget reader required';
  end if;

  select * into period_row
  from public.budget_periods
  where id = target_budget_period
    and condominium_id = target_condominium;

  if period_row.id is null then
    raise exception 'budget period not found';
  end if;

  if period_row.approved_version_id is null then
    raise exception 'approved budget required';
  end if;

  return query
  with budget as (
    select
      bl.category_id,
      bl.currency_code,
      sum(bl.amount)::numeric(18, 2) as amount
    from public.budget_lines bl
    where bl.budget_version_id = period_row.approved_version_id
      and bl.condominium_id = target_condominium
    group by bl.category_id, bl.currency_code
  ),
  actual as (
    select
      e.category_id,
      e.currency_code,
      sum(e.amount)::numeric(18, 2) as amount
    from public.expenses e
    where e.condominium_id = target_condominium
      and e.expense_date between period_row.starts_on and period_row.ends_on
      and e.status in ('approved', 'paid')
    group by e.category_id, e.currency_code
  )
  select
    coalesce(budget.category_id, actual.category_id),
    category.name,
    coalesce(budget.currency_code, actual.currency_code),
    coalesce(budget.amount, 0)::numeric(18, 2),
    coalesce(actual.amount, 0)::numeric(18, 2),
    (coalesce(budget.amount, 0) - coalesce(actual.amount, 0))::numeric(18, 2)
  from budget
  full outer join actual
    on actual.category_id = budget.category_id
   and actual.currency_code = budget.currency_code
  join public.expense_categories category
    on category.id = coalesce(budget.category_id, actual.category_id)
   and category.condominium_id = target_condominium
  order by coalesce(budget.currency_code, actual.currency_code), category.name;
end;
$$;

revoke execute on function public.create_budget_period(uuid, text, date, date, jsonb, uuid, text) from public;
revoke execute on function public.create_budget_revision(uuid, uuid, jsonb, uuid, text) from public;
revoke execute on function public.submit_budget_version(uuid, uuid, uuid) from public;
revoke execute on function public.approve_budget_version(uuid, uuid, uuid) from public;
revoke execute on function public.get_budget_actual_vs_budget(uuid, uuid) from public;

grant execute on function public.create_budget_period(uuid, text, date, date, jsonb, uuid, text)
  to authenticated, service_role;
grant execute on function public.create_budget_revision(uuid, uuid, jsonb, uuid, text)
  to authenticated, service_role;
grant execute on function public.submit_budget_version(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.approve_budget_version(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.get_budget_actual_vs_budget(uuid, uuid)
  to authenticated, service_role;
