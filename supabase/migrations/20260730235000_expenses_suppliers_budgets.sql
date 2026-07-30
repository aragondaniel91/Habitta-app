create type public.supplier_status as enum ('active', 'inactive');
create type public.expense_status as enum ('draft', 'approved', 'paid', 'void');
create type public.expense_event_type as enum ('created', 'approved', 'paid', 'voided');
create type public.budget_status as enum ('draft', 'approved', 'closed');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (condominium_id, code),
  unique (condominium_id, name),
  unique (id, condominium_id),
  check (length(trim(code)) between 1 and 30),
  check (length(trim(name)) between 1 and 120)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null,
  tax_document text,
  email text,
  phone text,
  address text,
  notes text,
  status public.supplier_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  check (length(trim(name)) between 1 and 160),
  check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create unique index suppliers_condominium_tax_document_unique
  on public.suppliers (condominium_id, lower(tax_document))
  where tax_document is not null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  expense_reference text not null,
  category_id uuid not null,
  supplier_id uuid,
  description text not null,
  currency_code text not null,
  amount numeric(18, 2) not null,
  issue_date date not null,
  due_date date,
  paid_date date,
  status public.expense_status not null default 'draft',
  document_reference text,
  support_metadata jsonb not null default '{}'::jsonb,
  correction_of uuid references public.expenses(id),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  voided_by uuid references auth.users(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (condominium_id, expense_reference),
  unique (id, condominium_id),
  foreign key (category_id, condominium_id)
    references public.expense_categories(id, condominium_id),
  foreign key (supplier_id, condominium_id)
    references public.suppliers(id, condominium_id),
  check (amount > 0),
  check (currency_code ~ '^[A-Z]{3}$'),
  check (length(trim(description)) between 1 and 500),
  check (due_date is null or due_date >= issue_date),
  check (paid_date is null or paid_date >= issue_date),
  check (
    (status = 'paid' and paid_date is not null)
    or (status <> 'paid')
  ),
  check (
    (status = 'void' and void_reason is not null and length(trim(void_reason)) >= 3)
    or status <> 'void'
  )
);

create index expenses_condominium_issue_date_idx
  on public.expenses (condominium_id, issue_date desc);
create index expenses_condominium_status_idx
  on public.expenses (condominium_id, status);
create index expenses_condominium_currency_idx
  on public.expenses (condominium_id, currency_code);

create table public.expense_events (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  expense_id uuid not null,
  event_type public.expense_event_type not null,
  event_data jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (expense_id, condominium_id)
    references public.expenses(id, condominium_id)
    on delete restrict
);

create index expense_events_expense_created_idx
  on public.expense_events (expense_id, created_at);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status public.budget_status not null default 'draft',
  version integer not null default 1,
  notes text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (condominium_id, name, version),
  unique (id, condominium_id),
  check (length(trim(name)) between 1 and 160),
  check (period_end >= period_start),
  check (
    (status = 'approved' and approved_by is not null and approved_at is not null)
    or status <> 'approved'
  )
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  budget_id uuid not null,
  category_id uuid not null,
  currency_code text not null,
  planned_amount numeric(18, 2) not null,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (budget_id, condominium_id)
    references public.budgets(id, condominium_id)
    on delete cascade,
  foreign key (category_id, condominium_id)
    references public.expense_categories(id, condominium_id),
  unique (budget_id, category_id, currency_code),
  check (planned_amount >= 0),
  check (currency_code ~ '^[A-Z]{3}$')
);

create function public.can_read_expenses(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner_for_condominium(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and cm.role in ('condominium_admin', 'accountant', 'board_member')
    );
$$;

create function public.can_manage_expenses(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner_for_condominium(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and cm.role in ('condominium_admin', 'accountant')
    );
$$;

revoke execute on function public.can_read_expenses(uuid) from public;
revoke execute on function public.can_manage_expenses(uuid) from public;
grant execute on function public.can_read_expenses(uuid) to authenticated, service_role;
grant execute on function public.can_manage_expenses(uuid) to authenticated, service_role;

alter table public.expense_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_events enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;

create policy expense_categories_read on public.expense_categories
for select using (public.can_read_expenses(condominium_id));
create policy expense_categories_write on public.expense_categories
for all using (public.can_manage_expenses(condominium_id))
with check (public.can_manage_expenses(condominium_id));

create policy suppliers_read on public.suppliers
for select using (public.can_read_expenses(condominium_id));
create policy suppliers_write on public.suppliers
for all using (public.can_manage_expenses(condominium_id))
with check (public.can_manage_expenses(condominium_id));

create policy expenses_read on public.expenses
for select using (public.can_read_expenses(condominium_id));
create policy expense_events_read on public.expense_events
for select using (public.can_read_expenses(condominium_id));
create policy budgets_read on public.budgets
for select using (public.can_read_expenses(condominium_id));
create policy budget_lines_read on public.budget_lines
for select using (public.can_read_expenses(condominium_id));

create function public.create_expense(
  target_condominium_id uuid,
  target_category_id uuid,
  target_supplier_id uuid,
  expense_description text,
  expense_amount numeric,
  expense_currency_code text,
  expense_issue_date date,
  expense_due_date date default null,
  expense_document_reference text default null,
  expense_support_metadata jsonb default '{}'::jsonb
)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.expenses;
  normalized_currency text := upper(trim(expense_currency_code));
  reference_value text;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium_id) then
    raise exception 'expense manager required';
  end if;
  if expense_amount <= 0 then raise exception 'invalid expense amount'; end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency code'; end if;
  if expense_due_date is not null and expense_due_date < expense_issue_date then
    raise exception 'invalid due date';
  end if;
  if not exists (
    select 1 from public.expense_categories
    where id = target_category_id
      and condominium_id = target_condominium_id
      and is_active
  ) then raise exception 'invalid expense category'; end if;
  if target_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = target_supplier_id
      and condominium_id = target_condominium_id
      and status = 'active'
  ) then raise exception 'invalid supplier'; end if;

  reference_value := 'EXP-' || to_char(current_date, 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.expenses (
    condominium_id,
    expense_reference,
    category_id,
    supplier_id,
    description,
    currency_code,
    amount,
    issue_date,
    due_date,
    document_reference,
    support_metadata,
    created_by
  ) values (
    target_condominium_id,
    reference_value,
    target_category_id,
    target_supplier_id,
    trim(expense_description),
    normalized_currency,
    round(expense_amount, 2),
    expense_issue_date,
    expense_due_date,
    nullif(trim(expense_document_reference), ''),
    coalesce(expense_support_metadata, '{}'::jsonb),
    auth.uid()
  ) returning * into created;

  insert into public.expense_events (
    condominium_id, expense_id, event_type, event_data, actor_user_id
  ) values (
    target_condominium_id,
    created.id,
    'created',
    jsonb_build_object('status', created.status, 'amount', created.amount, 'currency_code', created.currency_code),
    auth.uid()
  );

  return created;
end;
$$;

create function public.approve_expense(target_condominium_id uuid, target_expense_id uuid)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare updated public.expenses;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium_id) then
    raise exception 'expense manager required';
  end if;

  update public.expenses
  set status = 'approved',
      approved_by = auth.uid(),
      version = version + 1,
      updated_at = now()
  where id = target_expense_id
    and condominium_id = target_condominium_id
    and status = 'draft'
  returning * into updated;

  if updated.id is null then raise exception 'expense not in draft state'; end if;

  insert into public.expense_events (
    condominium_id, expense_id, event_type, event_data, actor_user_id
  ) values (target_condominium_id, updated.id, 'approved', '{}'::jsonb, auth.uid());

  return updated;
end;
$$;

create function public.mark_expense_paid(
  target_condominium_id uuid,
  target_expense_id uuid,
  paid_on date
)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare updated public.expenses;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium_id) then
    raise exception 'expense manager required';
  end if;

  update public.expenses
  set status = 'paid',
      paid_date = paid_on,
      version = version + 1,
      updated_at = now()
  where id = target_expense_id
    and condominium_id = target_condominium_id
    and status = 'approved'
    and paid_on >= issue_date
  returning * into updated;

  if updated.id is null then raise exception 'expense not approved or paid date invalid'; end if;

  insert into public.expense_events (
    condominium_id, expense_id, event_type, event_data, actor_user_id
  ) values (
    target_condominium_id,
    updated.id,
    'paid',
    jsonb_build_object('paid_date', paid_on),
    auth.uid()
  );

  return updated;
end;
$$;

create function public.void_expense(
  target_condominium_id uuid,
  target_expense_id uuid,
  reason text
)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare updated public.expenses;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium_id) then
    raise exception 'expense manager required';
  end if;
  if length(trim(reason)) < 3 then raise exception 'void reason required'; end if;

  update public.expenses
  set status = 'void',
      voided_by = auth.uid(),
      void_reason = trim(reason),
      version = version + 1,
      updated_at = now()
  where id = target_expense_id
    and condominium_id = target_condominium_id
    and status <> 'void'
  returning * into updated;

  if updated.id is null then raise exception 'expense not found or already void'; end if;

  insert into public.expense_events (
    condominium_id, expense_id, event_type, event_data, actor_user_id
  ) values (
    target_condominium_id,
    updated.id,
    'voided',
    jsonb_build_object('reason', trim(reason), 'previous_version', updated.version - 1),
    auth.uid()
  );

  return updated;
end;
$$;

create function public.create_budget(
  target_condominium_id uuid,
  budget_name text,
  starts_on date,
  ends_on date,
  budget_notes text default null
)
returns public.budgets
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare created public.budgets;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium_id) then
    raise exception 'expense manager required';
  end if;
  if ends_on < starts_on then raise exception 'invalid budget period'; end if;

  insert into public.budgets (
    condominium_id, name, period_start, period_end, notes, created_by
  ) values (
    target_condominium_id, trim(budget_name), starts_on, ends_on, nullif(trim(budget_notes), ''), auth.uid()
  ) returning * into created;

  return created;
end;
$$;

create function public.upsert_budget_line(
  target_condominium_id uuid,
  target_budget_id uuid,
  target_category_id uuid,
  line_currency_code text,
  line_planned_amount numeric,
  line_notes text default null
)
returns public.budget_lines
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare updated public.budget_lines;
declare normalized_currency text := upper(trim(line_currency_code));
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium_id) then
    raise exception 'expense manager required';
  end if;
  if line_planned_amount < 0 then raise exception 'invalid planned amount'; end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency code'; end if;
  if not exists (
    select 1 from public.budgets
    where id = target_budget_id
      and condominium_id = target_condominium_id
      and status = 'draft'
  ) then raise exception 'draft budget required'; end if;
  if not exists (
    select 1 from public.expense_categories
    where id = target_category_id
      and condominium_id = target_condominium_id
      and is_active
  ) then raise exception 'invalid expense category'; end if;

  insert into public.budget_lines (
    condominium_id,
    budget_id,
    category_id,
    currency_code,
    planned_amount,
    notes,
    created_by
  ) values (
    target_condominium_id,
    target_budget_id,
    target_category_id,
    normalized_currency,
    round(line_planned_amount, 2),
    nullif(trim(line_notes), ''),
    auth.uid()
  )
  on conflict (budget_id, category_id, currency_code)
  do update set
    planned_amount = excluded.planned_amount,
    notes = excluded.notes,
    updated_at = now()
  returning * into updated;

  return updated;
end;
$$;

create function public.approve_budget(target_condominium_id uuid, target_budget_id uuid)
returns public.budgets
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare updated public.budgets;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium_id) then
    raise exception 'expense manager required';
  end if;
  if not exists (
    select 1 from public.budget_lines
    where budget_id = target_budget_id
      and condominium_id = target_condominium_id
  ) then raise exception 'budget requires at least one line'; end if;

  update public.budgets
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = target_budget_id
    and condominium_id = target_condominium_id
    and status = 'draft'
  returning * into updated;

  if updated.id is null then raise exception 'draft budget required'; end if;
  return updated;
end;
$$;

revoke execute on function public.create_expense(uuid, uuid, uuid, text, numeric, text, date, date, text, jsonb) from public;
revoke execute on function public.approve_expense(uuid, uuid) from public;
revoke execute on function public.mark_expense_paid(uuid, uuid, date) from public;
revoke execute on function public.void_expense(uuid, uuid, text) from public;
revoke execute on function public.create_budget(uuid, text, date, date, text) from public;
revoke execute on function public.upsert_budget_line(uuid, uuid, uuid, text, numeric, text) from public;
revoke execute on function public.approve_budget(uuid, uuid) from public;

grant execute on function public.create_expense(uuid, uuid, uuid, text, numeric, text, date, date, text, jsonb) to authenticated;
grant execute on function public.approve_expense(uuid, uuid) to authenticated;
grant execute on function public.mark_expense_paid(uuid, uuid, date) to authenticated;
grant execute on function public.void_expense(uuid, uuid, text) to authenticated;
grant execute on function public.create_budget(uuid, text, date, date, text) to authenticated;
grant execute on function public.upsert_budget_line(uuid, uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.approve_budget(uuid, uuid) to authenticated;

create view public.expense_register
with (security_invoker = true)
as
select
  e.*,
  ec.code as category_code,
  ec.name as category_name,
  s.name as supplier_name,
  s.tax_document as supplier_tax_document
from public.expenses e
join public.expense_categories ec on ec.id = e.category_id
left join public.suppliers s on s.id = e.supplier_id;

create view public.expense_summary_by_currency
with (security_invoker = true)
as
select
  condominium_id,
  currency_code,
  coalesce(sum(amount) filter (where status in ('approved', 'paid')), 0)::numeric(18, 2) as committed_amount,
  coalesce(sum(amount) filter (where status = 'paid'), 0)::numeric(18, 2) as paid_amount,
  coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric(18, 2) as payable_amount,
  coalesce(sum(amount) filter (where status = 'draft'), 0)::numeric(18, 2) as draft_amount
from public.expenses
where status <> 'void'
group by condominium_id, currency_code;

create view public.budget_actuals
with (security_invoker = true)
as
select
  bl.id as budget_line_id,
  bl.condominium_id,
  bl.budget_id,
  b.name as budget_name,
  b.status as budget_status,
  b.period_start,
  b.period_end,
  bl.category_id,
  ec.name as category_name,
  bl.currency_code,
  bl.planned_amount,
  coalesce(sum(e.amount) filter (where e.status in ('approved', 'paid')), 0)::numeric(18, 2) as actual_amount,
  (bl.planned_amount - coalesce(sum(e.amount) filter (where e.status in ('approved', 'paid')), 0))::numeric(18, 2) as variance_amount
from public.budget_lines bl
join public.budgets b on b.id = bl.budget_id
join public.expense_categories ec on ec.id = bl.category_id
left join public.expenses e
  on e.condominium_id = bl.condominium_id
  and e.category_id = bl.category_id
  and e.currency_code = bl.currency_code
  and e.issue_date between b.period_start and b.period_end
  and e.status <> 'void'
group by bl.id, b.id, ec.id;

grant select on public.expense_register to authenticated;
grant select on public.expense_summary_by_currency to authenticated;
grant select on public.budget_actuals to authenticated;
