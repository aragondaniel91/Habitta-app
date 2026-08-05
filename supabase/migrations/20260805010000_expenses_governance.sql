-- Expenses and governance foundation for Habitta.
-- Keeps every record condominium-scoped and all privileged transitions server-side.

create type public.expense_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'paid',
  'void'
);

create type public.governance_proposal_status as enum (
  'draft',
  'open',
  'closed',
  'approved',
  'rejected',
  'archived'
);

create type public.governance_category as enum (
  'budget',
  'maintenance',
  'improvement',
  'community',
  'policy',
  'other'
);

create type public.governance_voting_basis as enum (
  'one_per_owner',
  'one_per_unit'
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (condominium_id, code)
);

create unique index expense_categories_name_unique
  on public.expense_categories (condominium_id, lower(name));

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null,
  tax_identifier text,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id)
);

create index vendors_condominium_name_idx
  on public.vendors (condominium_id, name);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  category_id uuid not null,
  vendor_id uuid,
  description text not null,
  invoice_number text,
  expense_date date not null,
  due_date date,
  amount numeric(18, 2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status public.expense_status not null default 'draft',
  payment_method text,
  payment_reference text,
  support_url text,
  notes text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (category_id, condominium_id)
    references public.expense_categories(id, condominium_id),
  foreign key (vendor_id, condominium_id)
    references public.vendors(id, condominium_id),
  check (due_date is null or due_date >= expense_date)
);

create index expenses_condominium_status_date_idx
  on public.expenses (condominium_id, status, expense_date desc);

create index expenses_condominium_currency_idx
  on public.expenses (condominium_id, currency_code, expense_date desc);

create table public.expense_events (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  condominium_id uuid not null,
  event_type text not null check (
    event_type in ('created', 'updated', 'submitted', 'approved', 'paid', 'voided')
  ),
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (expense_id, condominium_id)
    references public.expenses(id, condominium_id) on delete cascade
);

create index expense_events_expense_idx
  on public.expense_events (expense_id, occurred_at asc);

create table public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  title text not null,
  summary text,
  description text not null,
  category public.governance_category not null default 'other',
  status public.governance_proposal_status not null default 'draft',
  voting_basis public.governance_voting_basis not null default 'one_per_owner',
  quorum_percentage numeric(5, 2) not null default 50
    check (quorum_percentage >= 0 and quorum_percentage <= 100),
  budget_amount numeric(18, 2) check (budget_amount is null or budget_amount > 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  opens_at timestamptz,
  closes_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (id, condominium_id),
  check (opens_at is null or closes_at > opens_at),
  check (
    (budget_amount is null and currency_code is null)
    or (budget_amount is not null and currency_code is not null)
  )
);

create index governance_proposals_condominium_status_idx
  on public.governance_proposals (condominium_id, status, closes_at desc);

create table public.governance_options (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  condominium_id uuid not null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, proposal_id, condominium_id),
  unique (proposal_id, label),
  foreign key (proposal_id, condominium_id)
    references public.governance_proposals(id, condominium_id) on delete cascade
);

create table public.governance_attachments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  condominium_id uuid not null,
  document_type text not null default 'support'
    check (document_type in ('quote', 'budget', 'support', 'minutes', 'other')),
  file_name text not null,
  url text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (proposal_id, condominium_id)
    references public.governance_proposals(id, condominium_id) on delete cascade
);

create table public.governance_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  option_id uuid not null,
  condominium_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  cast_at timestamptz not null default now(),
  foreign key (proposal_id, condominium_id)
    references public.governance_proposals(id, condominium_id) on delete cascade,
  foreign key (option_id, proposal_id, condominium_id)
    references public.governance_options(id, proposal_id, condominium_id) on delete cascade
);

create unique index governance_votes_owner_unique
  on public.governance_votes (proposal_id, user_id)
  where unit_id is null;

create unique index governance_votes_unit_unique
  on public.governance_votes (proposal_id, unit_id)
  where unit_id is not null;

create index governance_votes_proposal_idx
  on public.governance_votes (proposal_id, option_id);

create table public.governance_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  condominium_id uuid not null,
  event_type text not null check (
    event_type in ('created', 'opened', 'vote_cast', 'closed', 'approved', 'rejected', 'archived')
  ),
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (proposal_id, condominium_id)
    references public.governance_proposals(id, condominium_id) on delete cascade
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
        and cm.role in (
          'condominium_admin',
          'accountant',
          'assistant',
          'payment_reviewer',
          'board_member'
        )
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

create function public.can_approve_expenses(target uuid)
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
        and cm.role = 'condominium_admin'
    );
$$;

create function public.can_manage_governance(target uuid)
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
        and cm.role in ('condominium_admin', 'board_member')
    );
$$;

create function public.can_read_governance(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_read_condominium(target);
$$;

revoke execute on function public.can_read_expenses(uuid) from public;
revoke execute on function public.can_manage_expenses(uuid) from public;
revoke execute on function public.can_approve_expenses(uuid) from public;
revoke execute on function public.can_manage_governance(uuid) from public;
revoke execute on function public.can_read_governance(uuid) from public;
grant execute on function public.can_read_expenses(uuid) to authenticated, service_role;
grant execute on function public.can_manage_expenses(uuid) to authenticated, service_role;
grant execute on function public.can_approve_expenses(uuid) to authenticated, service_role;
grant execute on function public.can_manage_governance(uuid) to authenticated, service_role;
grant execute on function public.can_read_governance(uuid) to authenticated, service_role;

alter table public.expense_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_events enable row level security;
alter table public.governance_proposals enable row level security;
alter table public.governance_options enable row level security;
alter table public.governance_attachments enable row level security;
alter table public.governance_votes enable row level security;
alter table public.governance_events enable row level security;

create policy expense_categories_read on public.expense_categories
for select using (public.can_read_expenses(condominium_id));
create policy expense_categories_manage on public.expense_categories
for all
using (public.can_manage_expenses(condominium_id))
with check (public.can_manage_expenses(condominium_id));

create policy vendors_read on public.vendors
for select using (public.can_read_expenses(condominium_id));
create policy vendors_manage on public.vendors
for all
using (public.can_manage_expenses(condominium_id))
with check (public.can_manage_expenses(condominium_id));

create policy expenses_read on public.expenses
for select using (public.can_read_expenses(condominium_id));

create policy expense_events_read on public.expense_events
for select using (public.can_read_expenses(condominium_id));

create policy governance_proposals_read on public.governance_proposals
for select using (public.can_read_governance(condominium_id));

create policy governance_options_read on public.governance_options
for select using (public.can_read_governance(condominium_id));

create policy governance_attachments_read on public.governance_attachments
for select using (public.can_read_governance(condominium_id));

create policy governance_votes_read on public.governance_votes
for select
using (user_id = auth.uid() or public.can_manage_governance(condominium_id));

create policy governance_events_read on public.governance_events
for select using (public.can_manage_governance(condominium_id));

create function public.seed_default_expense_categories()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.expense_categories (
    condominium_id,
    code,
    name,
    description,
    created_by
  )
  values
    (new.id, 'maintenance', 'Mantenimiento', 'Mantenimiento preventivo y correctivo.', new.created_by),
    (new.id, 'services', 'Servicios', 'Servicios públicos y contratos recurrentes.', new.created_by),
    (new.id, 'staff', 'Personal', 'Nómina, honorarios y servicios profesionales.', new.created_by),
    (new.id, 'security', 'Seguridad', 'Vigilancia, control de acceso y seguridad.', new.created_by),
    (new.id, 'repairs', 'Reparaciones', 'Reparaciones puntuales e incidencias.', new.created_by),
    (new.id, 'projects', 'Proyectos', 'Mejoras y proyectos extraordinarios.', new.created_by),
    (new.id, 'supplies', 'Suministros', 'Materiales, insumos y consumibles.', new.created_by),
    (new.id, 'other', 'Otros', 'Gastos que no pertenecen a otra categoría.', new.created_by)
  on conflict (condominium_id, code) do nothing;

  return new;
end;
$$;

revoke execute on function public.seed_default_expense_categories() from public;

create trigger condominiums_seed_expense_categories
after insert on public.condominiums
for each row execute function public.seed_default_expense_categories();

insert into public.expense_categories (
  condominium_id,
  code,
  name,
  description,
  created_by
)
select
  c.id,
  defaults.code,
  defaults.name,
  defaults.description,
  c.created_by
from public.condominiums c
cross join (
  values
    ('maintenance', 'Mantenimiento', 'Mantenimiento preventivo y correctivo.'),
    ('services', 'Servicios', 'Servicios públicos y contratos recurrentes.'),
    ('staff', 'Personal', 'Nómina, honorarios y servicios profesionales.'),
    ('security', 'Seguridad', 'Vigilancia, control de acceso y seguridad.'),
    ('repairs', 'Reparaciones', 'Reparaciones puntuales e incidencias.'),
    ('projects', 'Proyectos', 'Mejoras y proyectos extraordinarios.'),
    ('supplies', 'Suministros', 'Materiales, insumos y consumibles.'),
    ('other', 'Otros', 'Gastos que no pertenecen a otra categoría.')
) as defaults(code, name, description)
on conflict (condominium_id, code) do nothing;

create function public.create_expense(
  target_condominium uuid,
  target_category uuid,
  target_vendor uuid,
  expense_description text,
  invoice_value text,
  expense_on date,
  due_on date,
  expense_amount numeric,
  expense_currency text,
  payment_method_value text,
  payment_reference_value text,
  support_url_value text,
  notes_value text
)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_expense public.expenses;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium) then
    raise exception 'expense manager required';
  end if;

  if not exists (
    select 1
    from public.expense_categories ec
    where ec.id = target_category
      and ec.condominium_id = target_condominium
      and ec.is_active
  ) then
    raise exception 'invalid expense category';
  end if;

  if target_vendor is not null and not exists (
    select 1
    from public.vendors v
    where v.id = target_vendor
      and v.condominium_id = target_condominium
      and v.is_active
  ) then
    raise exception 'invalid vendor';
  end if;

  if due_on is not null and due_on < expense_on then
    raise exception 'due date must not precede expense date';
  end if;

  insert into public.expenses (
    condominium_id,
    category_id,
    vendor_id,
    description,
    invoice_number,
    expense_date,
    due_date,
    amount,
    currency_code,
    payment_method,
    payment_reference,
    support_url,
    notes,
    created_by
  )
  values (
    target_condominium,
    target_category,
    target_vendor,
    trim(expense_description),
    nullif(trim(invoice_value), ''),
    expense_on,
    due_on,
    expense_amount,
    upper(expense_currency),
    nullif(trim(payment_method_value), ''),
    nullif(trim(payment_reference_value), ''),
    nullif(trim(support_url_value), ''),
    nullif(trim(notes_value), ''),
    auth.uid()
  )
  returning * into created_expense;

  insert into public.expense_events (
    expense_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    created_expense.id,
    target_condominium,
    'created',
    auth.uid(),
    jsonb_build_object('amount', created_expense.amount, 'currency', created_expense.currency_code)
  );

  return created_expense;
end;
$$;

create function public.update_expense(
  target_condominium uuid,
  target_expense uuid,
  target_category uuid,
  target_vendor uuid,
  clear_vendor boolean,
  expense_description text,
  invoice_value text,
  expense_on date,
  due_on date,
  clear_due boolean,
  expense_amount numeric,
  expense_currency text,
  payment_method_value text,
  payment_reference_value text,
  support_url_value text,
  notes_value text,
  expected_version integer
)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_expense public.expenses;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium) then
    raise exception 'expense manager required';
  end if;

  select *
  into current_expense
  from public.expenses
  where id = target_expense
    and condominium_id = target_condominium
  for update;

  if current_expense.id is null then
    raise exception 'expense not found';
  end if;

  if current_expense.status <> 'draft' then
    raise exception 'only draft expenses can be edited';
  end if;

  if expected_version is not null and current_expense.version <> expected_version then
    raise exception 'expense version conflict';
  end if;

  if target_category is not null and not exists (
    select 1
    from public.expense_categories ec
    where ec.id = target_category
      and ec.condominium_id = target_condominium
      and ec.is_active
  ) then
    raise exception 'invalid expense category';
  end if;

  if target_vendor is not null and not exists (
    select 1
    from public.vendors v
    where v.id = target_vendor
      and v.condominium_id = target_condominium
      and v.is_active
  ) then
    raise exception 'invalid vendor';
  end if;

  update public.expenses
  set
    category_id = coalesce(target_category, category_id),
    vendor_id = case
      when clear_vendor then null
      when target_vendor is not null then target_vendor
      else vendor_id
    end,
    description = coalesce(nullif(trim(expense_description), ''), description),
    invoice_number = case
      when invoice_value is null then invoice_number
      else nullif(trim(invoice_value), '')
    end,
    expense_date = coalesce(expense_on, expense_date),
    due_date = case
      when clear_due then null
      when due_on is not null then due_on
      else due_date
    end,
    amount = coalesce(expense_amount, amount),
    currency_code = coalesce(upper(expense_currency), currency_code),
    payment_method = case
      when payment_method_value is null then payment_method
      else nullif(trim(payment_method_value), '')
    end,
    payment_reference = case
      when payment_reference_value is null then payment_reference
      else nullif(trim(payment_reference_value), '')
    end,
    support_url = case
      when support_url_value is null then support_url
      else nullif(trim(support_url_value), '')
    end,
    notes = case
      when notes_value is null then notes
      else nullif(trim(notes_value), '')
    end,
    version = version + 1,
    updated_at = now()
  where id = current_expense.id
  returning * into current_expense;

  if current_expense.due_date is not null and current_expense.due_date < current_expense.expense_date then
    raise exception 'due date must not precede expense date';
  end if;

  insert into public.expense_events (
    expense_id,
    condominium_id,
    event_type,
    actor_user_id
  )
  values (current_expense.id, target_condominium, 'updated', auth.uid());

  return current_expense;
end;
$$;

create function public.transition_expense(
  target_condominium uuid,
  target_expense uuid,
  action_name text,
  reason_value text default null,
  expected_version integer default null
)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_expense public.expenses;
  next_status public.expense_status;
  event_name text;
begin
  select *
  into current_expense
  from public.expenses
  where id = target_expense
    and condominium_id = target_condominium
  for update;

  if current_expense.id is null then
    raise exception 'expense not found';
  end if;

  if expected_version is not null and current_expense.version <> expected_version then
    raise exception 'expense version conflict';
  end if;

  if action_name = 'submit' then
    if not public.can_manage_expenses(target_condominium) or current_expense.status <> 'draft' then
      raise exception 'invalid expense transition';
    end if;
    next_status := 'pending_approval';
    event_name := 'submitted';
  elsif action_name = 'approve' then
    if not public.can_approve_expenses(target_condominium)
      or current_expense.status <> 'pending_approval'
    then
      raise exception 'invalid expense transition';
    end if;
    next_status := 'approved';
    event_name := 'approved';
  elsif action_name = 'mark_paid' then
    if not public.can_manage_expenses(target_condominium)
      or current_expense.status <> 'approved'
    then
      raise exception 'invalid expense transition';
    end if;
    next_status := 'paid';
    event_name := 'paid';
  elsif action_name = 'void' then
    if not public.can_approve_expenses(target_condominium)
      or current_expense.status not in ('draft', 'pending_approval', 'approved')
      or nullif(trim(reason_value), '') is null
    then
      raise exception 'invalid expense transition';
    end if;
    next_status := 'void';
    event_name := 'voided';
  else
    raise exception 'unknown expense action';
  end if;

  update public.expenses
  set
    status = next_status,
    approved_by = case when next_status = 'approved' then auth.uid() else approved_by end,
    approved_at = case when next_status = 'approved' then now() else approved_at end,
    paid_at = case when next_status = 'paid' then now() else paid_at end,
    voided_at = case when next_status = 'void' then now() else voided_at end,
    version = version + 1,
    updated_at = now()
  where id = current_expense.id
  returning * into current_expense;

  insert into public.expense_events (
    expense_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    current_expense.id,
    target_condominium,
    event_name,
    auth.uid(),
    case
      when reason_value is null then '{}'::jsonb
      else jsonb_build_object('reason', trim(reason_value))
    end
  );

  return current_expense;
end;
$$;

create function public.get_expense_summary(target_condominium uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  totals jsonb;
begin
  if auth.uid() is null or not public.can_read_expenses(target_condominium) then
    raise exception 'expense reader required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currency_code', currency_code,
        'total_amount', total_amount,
        'draft_amount', draft_amount,
        'pending_amount', pending_amount,
        'approved_amount', approved_amount,
        'paid_amount', paid_amount,
        'void_amount', void_amount,
        'expense_count', expense_count
      )
      order by currency_code
    ),
    '[]'::jsonb
  )
  into totals
  from (
    select
      currency_code,
      sum(amount) filter (where status <> 'void') as total_amount,
      coalesce(sum(amount) filter (where status = 'draft'), 0) as draft_amount,
      coalesce(sum(amount) filter (where status = 'pending_approval'), 0) as pending_amount,
      coalesce(sum(amount) filter (where status = 'approved'), 0) as approved_amount,
      coalesce(sum(amount) filter (where status = 'paid'), 0) as paid_amount,
      coalesce(sum(amount) filter (where status = 'void'), 0) as void_amount,
      count(*) as expense_count
    from public.expenses
    where condominium_id = target_condominium
    group by currency_code
  ) summary;

  return jsonb_build_object(
    'totals_by_currency', totals,
    'pending_approval_count', (
      select count(*)
      from public.expenses
      where condominium_id = target_condominium
        and status = 'pending_approval'
    ),
    'active_vendor_count', (
      select count(*)
      from public.vendors
      where condominium_id = target_condominium
        and is_active
    )
  );
end;
$$;

create function public.create_governance_proposal(
  target_condominium uuid,
  proposal_title text,
  proposal_summary text,
  proposal_description text,
  proposal_category text,
  proposal_voting_basis text,
  proposal_quorum numeric,
  proposal_budget_amount numeric,
  proposal_currency text,
  opens_on timestamptz,
  closes_on timestamptz,
  options_value jsonb,
  attachments_value jsonb default '[]'::jsonb
)
returns public.governance_proposals
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_proposal public.governance_proposals;
  option_value jsonb;
  attachment_value jsonb;
begin
  if auth.uid() is null or not public.can_manage_governance(target_condominium) then
    raise exception 'governance manager required';
  end if;

  if jsonb_typeof(options_value) <> 'array' or jsonb_array_length(options_value) < 2 then
    raise exception 'at least two voting options are required';
  end if;

  if closes_on <= coalesce(opens_on, now()) then
    raise exception 'closing date must follow opening date';
  end if;

  insert into public.governance_proposals (
    condominium_id,
    title,
    summary,
    description,
    category,
    voting_basis,
    quorum_percentage,
    budget_amount,
    currency_code,
    opens_at,
    closes_at,
    created_by
  )
  values (
    target_condominium,
    trim(proposal_title),
    nullif(trim(proposal_summary), ''),
    trim(proposal_description),
    proposal_category::public.governance_category,
    proposal_voting_basis::public.governance_voting_basis,
    proposal_quorum,
    proposal_budget_amount,
    case when proposal_currency is null then null else upper(proposal_currency) end,
    opens_on,
    closes_on,
    auth.uid()
  )
  returning * into created_proposal;

  for option_value in
    select value from jsonb_array_elements(options_value)
  loop
    if nullif(trim(option_value ->> 'label'), '') is null then
      raise exception 'voting option label is required';
    end if;

    insert into public.governance_options (
      proposal_id,
      condominium_id,
      label,
      description,
      sort_order
    )
    values (
      created_proposal.id,
      target_condominium,
      trim(option_value ->> 'label'),
      nullif(trim(option_value ->> 'description'), ''),
      coalesce((option_value ->> 'sortOrder')::integer, 0)
    );
  end loop;

  if attachments_value is not null and jsonb_typeof(attachments_value) = 'array' then
    for attachment_value in
      select value from jsonb_array_elements(attachments_value)
    loop
      if nullif(trim(attachment_value ->> 'url'), '') is not null then
        insert into public.governance_attachments (
          proposal_id,
          condominium_id,
          document_type,
          file_name,
          url,
          created_by
        )
        values (
          created_proposal.id,
          target_condominium,
          coalesce(nullif(trim(attachment_value ->> 'documentType'), ''), 'support'),
          coalesce(
            nullif(trim(attachment_value ->> 'fileName'), ''),
            'Documento de soporte'
          ),
          trim(attachment_value ->> 'url'),
          auth.uid()
        );
      end if;
    end loop;
  end if;

  insert into public.governance_events (
    proposal_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    created_proposal.id,
    target_condominium,
    'created',
    auth.uid(),
    jsonb_build_object(
      'voting_basis',
      created_proposal.voting_basis,
      'quorum_percentage',
      created_proposal.quorum_percentage
    )
  );

  return created_proposal;
end;
$$;

create function public.transition_governance_proposal(
  target_condominium uuid,
  target_proposal uuid,
  action_name text,
  expected_version integer default null
)
returns public.governance_proposals
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
  next_status public.governance_proposal_status;
  event_name text;
begin
  if auth.uid() is null or not public.can_manage_governance(target_condominium) then
    raise exception 'governance manager required';
  end if;

  select *
  into proposal
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium
  for update;

  if proposal.id is null then
    raise exception 'proposal not found';
  end if;

  if expected_version is not null and proposal.version <> expected_version then
    raise exception 'proposal version conflict';
  end if;

  if action_name = 'open' then
    if proposal.status <> 'draft'
      or proposal.closes_at <= now()
      or (select count(*) from public.governance_options where proposal_id = proposal.id) < 2
    then
      raise exception 'proposal cannot be opened';
    end if;
    next_status := 'open';
    event_name := 'opened';
  elsif action_name = 'close' then
    if proposal.status <> 'open' then
      raise exception 'proposal cannot be closed';
    end if;
    next_status := 'closed';
    event_name := 'closed';
  elsif action_name = 'approve' then
    if proposal.status <> 'closed' then
      raise exception 'proposal cannot be approved';
    end if;
    next_status := 'approved';
    event_name := 'approved';
  elsif action_name = 'reject' then
    if proposal.status <> 'closed' then
      raise exception 'proposal cannot be rejected';
    end if;
    next_status := 'rejected';
    event_name := 'rejected';
  elsif action_name = 'archive' then
    if proposal.status = 'open' then
      raise exception 'open proposal cannot be archived';
    end if;
    next_status := 'archived';
    event_name := 'archived';
  else
    raise exception 'unknown proposal action';
  end if;

  update public.governance_proposals
  set
    status = next_status,
    opens_at = case
      when next_status = 'open' then coalesce(opens_at, now())
      else opens_at
    end,
    closed_at = case
      when next_status in ('closed', 'approved', 'rejected') then coalesce(closed_at, now())
      else closed_at
    end,
    version = version + 1,
    updated_at = now()
  where id = proposal.id
  returning * into proposal;

  insert into public.governance_events (
    proposal_id,
    condominium_id,
    event_type,
    actor_user_id
  )
  values (proposal.id, target_condominium, event_name, auth.uid());

  return proposal;
end;
$$;

create function public.get_governance_eligibility(
  target_condominium uuid,
  target_proposal uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  basis public.governance_voting_basis;
  eligible_units jsonb;
  owner_eligible boolean;
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'governance membership required';
  end if;

  select voting_basis
  into basis
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium;

  if basis is null then
    raise exception 'proposal not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', unit_rows.id, 'code', unit_rows.code)
      order by unit_rows.code
    ),
    '[]'::jsonb
  )
  into eligible_units
  from (
    select distinct u.id, u.code
    from public.people p
    join public.unit_owners uo
      on uo.person_id = p.id
      and uo.ends_at is null
    join public.units u
      on u.id = uo.unit_id
      and u.condominium_id = target_condominium
      and u.status = 'active'
    where p.condominium_id = target_condominium
      and p.auth_user_id = auth.uid()
      and p.status = 'active'
  ) unit_rows;

  owner_eligible := jsonb_array_length(eligible_units) > 0;

  return jsonb_build_object(
    'basis', basis,
    'eligible', owner_eligible,
    'units', eligible_units,
    'votes', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', gv.id,
            'option_id', gv.option_id,
            'unit_id', gv.unit_id,
            'cast_at', gv.cast_at
          )
          order by gv.cast_at
        ),
        '[]'::jsonb
      )
      from public.governance_votes gv
      where gv.proposal_id = target_proposal
        and gv.user_id = auth.uid()
    )
  );
end;
$$;

create function public.cast_governance_vote(
  target_condominium uuid,
  target_proposal uuid,
  target_option uuid,
  target_unit uuid default null
)
returns public.governance_votes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
  voter_person_id uuid;
  created_vote public.governance_votes;
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'governance membership required';
  end if;

  select *
  into proposal
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium
  for update;

  if proposal.id is null
    or proposal.status <> 'open'
    or coalesce(proposal.opens_at, proposal.created_at) > now()
    or proposal.closes_at <= now()
  then
    raise exception 'proposal is not open for voting';
  end if;

  if not exists (
    select 1
    from public.governance_options go
    where go.id = target_option
      and go.proposal_id = proposal.id
      and go.condominium_id = target_condominium
  ) then
    raise exception 'invalid voting option';
  end if;

  select p.id
  into voter_person_id
  from public.people p
  where p.condominium_id = target_condominium
    and p.auth_user_id = auth.uid()
    and p.status = 'active'
  limit 1;

  if voter_person_id is null then
    raise exception 'owner profile required';
  end if;

  if proposal.voting_basis = 'one_per_owner' then
    if target_unit is not null then
      raise exception 'unit is not valid for owner voting';
    end if;

    if not exists (
      select 1
      from public.unit_owners uo
      join public.units u on u.id = uo.unit_id
      where uo.person_id = voter_person_id
        and uo.ends_at is null
        and u.condominium_id = target_condominium
        and u.status = 'active'
    ) then
      raise exception 'active ownership required';
    end if;
  else
    if target_unit is null or not exists (
      select 1
      from public.unit_owners uo
      join public.units u on u.id = uo.unit_id
      where uo.person_id = voter_person_id
        and uo.unit_id = target_unit
        and uo.ends_at is null
        and u.condominium_id = target_condominium
        and u.status = 'active'
    ) then
      raise exception 'owned unit required';
    end if;
  end if;

  insert into public.governance_votes (
    proposal_id,
    option_id,
    condominium_id,
    user_id,
    unit_id
  )
  values (
    proposal.id,
    target_option,
    target_condominium,
    auth.uid(),
    target_unit
  )
  returning * into created_vote;

  insert into public.governance_events (
    proposal_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    proposal.id,
    target_condominium,
    'vote_cast',
    auth.uid(),
    jsonb_build_object('unit_id', target_unit)
  );

  return created_vote;
end;
$$;

create function public.get_governance_results(
  target_condominium uuid,
  target_proposal uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
  eligible_count bigint;
  vote_count bigint;
  options_result jsonb;
  quorum_value numeric;
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'governance membership required';
  end if;

  select *
  into proposal
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium;

  if proposal.id is null then
    raise exception 'proposal not found';
  end if;

  if proposal.voting_basis = 'one_per_owner' then
    select count(distinct p.auth_user_id)
    into eligible_count
    from public.people p
    join public.unit_owners uo
      on uo.person_id = p.id
      and uo.ends_at is null
    join public.units u
      on u.id = uo.unit_id
      and u.condominium_id = target_condominium
      and u.status = 'active'
    where p.condominium_id = target_condominium
      and p.auth_user_id is not null
      and p.status = 'active';
  else
    select count(distinct u.id)
    into eligible_count
    from public.units u
    join public.unit_owners uo
      on uo.unit_id = u.id
      and uo.ends_at is null
    join public.people p
      on p.id = uo.person_id
      and p.auth_user_id is not null
      and p.status = 'active'
    where u.condominium_id = target_condominium
      and u.status = 'active';
  end if;

  select count(*)
  into vote_count
  from public.governance_votes gv
  where gv.proposal_id = proposal.id;

  quorum_value := case
    when eligible_count = 0 then 0
    else round((vote_count::numeric / eligible_count::numeric) * 100, 2)
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', option_rows.id,
        'label', option_rows.label,
        'description', option_rows.description,
        'sort_order', option_rows.sort_order,
        'votes', option_rows.votes,
        'percentage', case
          when vote_count = 0 then 0
          else round((option_rows.votes::numeric / vote_count::numeric) * 100, 2)
        end
      )
      order by option_rows.sort_order, option_rows.label
    ),
    '[]'::jsonb
  )
  into options_result
  from (
    select
      go.id,
      go.label,
      go.description,
      go.sort_order,
      count(gv.id) as votes
    from public.governance_options go
    left join public.governance_votes gv
      on gv.option_id = go.id
      and gv.proposal_id = go.proposal_id
    where go.proposal_id = proposal.id
    group by go.id, go.label, go.description, go.sort_order
  ) option_rows;

  return jsonb_build_object(
    'proposal_id', proposal.id,
    'status', proposal.status,
    'voting_basis', proposal.voting_basis,
    'eligible_count', eligible_count,
    'votes_cast', vote_count,
    'participation_percentage', quorum_value,
    'quorum_percentage', proposal.quorum_percentage,
    'quorum_met', quorum_value >= proposal.quorum_percentage,
    'options', options_result
  );
end;
$$;

revoke execute on function public.create_expense(
  uuid, uuid, uuid, text, text, date, date, numeric, text, text, text, text, text
) from public;
revoke execute on function public.update_expense(
  uuid, uuid, uuid, uuid, boolean, text, text, date, date, boolean, numeric, text, text, text, text, text, integer
) from public;
revoke execute on function public.transition_expense(uuid, uuid, text, text, integer) from public;
revoke execute on function public.get_expense_summary(uuid) from public;
revoke execute on function public.create_governance_proposal(
  uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, jsonb, jsonb
) from public;
revoke execute on function public.transition_governance_proposal(uuid, uuid, text, integer) from public;
revoke execute on function public.get_governance_eligibility(uuid, uuid) from public;
revoke execute on function public.cast_governance_vote(uuid, uuid, uuid, uuid) from public;
revoke execute on function public.get_governance_results(uuid, uuid) from public;

grant execute on function public.create_expense(
  uuid, uuid, uuid, text, text, date, date, numeric, text, text, text, text, text
) to authenticated;
grant execute on function public.update_expense(
  uuid, uuid, uuid, uuid, boolean, text, text, date, date, boolean, numeric, text, text, text, text, text, integer
) to authenticated;
grant execute on function public.transition_expense(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.get_expense_summary(uuid) to authenticated;
grant execute on function public.create_governance_proposal(
  uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, jsonb, jsonb
) to authenticated;
grant execute on function public.transition_governance_proposal(uuid, uuid, text, integer) to authenticated;
grant execute on function public.get_governance_eligibility(uuid, uuid) to authenticated;
grant execute on function public.cast_governance_vote(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_governance_results(uuid, uuid) to authenticated;
