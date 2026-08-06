-- Assets and maintenance foundation for Habitta.
-- Keeps operational records condominium-scoped, lifecycle-driven and auditable.

create type public.maintenance_asset_status as enum (
  'active',
  'out_of_service',
  'retired'
);
create type public.maintenance_plan_kind as enum ('preventive', 'inspection');
create type public.maintenance_frequency_unit as enum ('days', 'weeks', 'months', 'years');
create type public.maintenance_work_order_kind as enum (
  'preventive',
  'corrective',
  'inspection',
  'emergency'
);
create type public.maintenance_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.maintenance_work_order_status as enum (
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);
create type public.maintenance_event_type as enum (
  'created',
  'updated',
  'status_changed',
  'generated',
  'service_logged',
  'activated',
  'deactivated',
  'retired'
);

create sequence public.maintenance_work_order_number_seq;

create table public.maintenance_assets (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  building_id uuid,
  unit_id uuid,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  category text not null check (char_length(trim(category)) between 2 and 80),
  manufacturer text check (manufacturer is null or char_length(trim(manufacturer)) between 2 and 120),
  model text check (model is null or char_length(trim(model)) between 1 and 120),
  serial_number text check (serial_number is null or char_length(trim(serial_number)) between 1 and 160),
  installed_on date,
  warranty_expires_on date,
  status public.maintenance_asset_status not null default 'active',
  location_notes text check (location_notes is null or char_length(location_notes) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  retired_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (condominium_id, code),
  foreign key (building_id, condominium_id)
    references public.buildings(id, condominium_id),
  foreign key (unit_id, condominium_id)
    references public.units(id, condominium_id),
  check (num_nonnulls(building_id, unit_id) <= 1),
  check (warranty_expires_on is null or installed_on is null or warranty_expires_on >= installed_on),
  check (
    (status = 'retired' and retired_at is not null)
    or (status <> 'retired' and retired_at is null)
  )
);

create unique index maintenance_assets_serial_unique
  on public.maintenance_assets (condominium_id, lower(serial_number))
  where serial_number is not null;
create index maintenance_assets_status_idx
  on public.maintenance_assets (condominium_id, status, category, name);
create index maintenance_assets_building_idx
  on public.maintenance_assets (building_id, status, name)
  where building_id is not null;
create index maintenance_assets_unit_idx
  on public.maintenance_assets (unit_id, status, name)
  where unit_id is not null;

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  asset_id uuid not null,
  default_vendor_id uuid,
  assigned_to_user_id uuid references auth.users(id),
  name text not null check (char_length(trim(name)) between 2 and 160),
  kind public.maintenance_plan_kind not null default 'preventive',
  instructions text not null check (char_length(trim(instructions)) between 3 and 5000),
  frequency_value integer not null check (frequency_value between 1 and 365),
  frequency_unit public.maintenance_frequency_unit not null,
  next_due_on date not null,
  last_generated_due_on date,
  estimated_duration_minutes integer check (
    estimated_duration_minutes is null or estimated_duration_minutes between 1 and 10080
  ),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (asset_id, condominium_id)
    references public.maintenance_assets(id, condominium_id),
  foreign key (default_vendor_id, condominium_id)
    references public.vendors(id, condominium_id),
  check (last_generated_due_on is null or last_generated_due_on < next_due_on),
  check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

create index maintenance_plans_due_idx
  on public.maintenance_plans (condominium_id, is_active, next_due_on);
create index maintenance_plans_asset_idx
  on public.maintenance_plans (asset_id, is_active, next_due_on);

create table public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  work_order_number text not null default (
    'WO-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.maintenance_work_order_number_seq')::text, 6, '0')
  ),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  asset_id uuid,
  plan_id uuid,
  plan_due_on date,
  request_id uuid,
  vendor_id uuid,
  assigned_to_user_id uuid references auth.users(id),
  kind public.maintenance_work_order_kind not null,
  priority public.maintenance_priority not null default 'normal',
  status public.maintenance_work_order_status not null default 'draft',
  title text not null check (char_length(trim(title)) between 3 and 180),
  description text not null check (char_length(trim(description)) between 3 and 5000),
  scheduled_for timestamptz,
  due_on date,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  completion_summary text check (
    completion_summary is null or char_length(trim(completion_summary)) between 3 and 4000
  ),
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (work_order_number),
  foreign key (asset_id, condominium_id)
    references public.maintenance_assets(id, condominium_id),
  foreign key (plan_id, condominium_id)
    references public.maintenance_plans(id, condominium_id),
  foreign key (request_id, condominium_id)
    references public.service_requests(id, condominium_id),
  foreign key (vendor_id, condominium_id)
    references public.vendors(id, condominium_id),
  check (
    (plan_id is null and plan_due_on is null)
    or (plan_id is not null and plan_due_on is not null)
  ),
  check (due_on is null or scheduled_for is null or due_on >= scheduled_for::date),
  check (
    (status in ('draft', 'scheduled')
      and started_at is null and completed_at is null and cancelled_at is null)
    or (status = 'in_progress'
      and started_at is not null and completed_at is null and cancelled_at is null)
    or (status = 'completed'
      and started_at is not null and completed_at is not null and cancelled_at is null
      and completion_summary is not null)
    or (status = 'cancelled'
      and completed_at is null and cancelled_at is not null)
  )
);

create unique index maintenance_work_orders_plan_due_unique
  on public.maintenance_work_orders (plan_id, plan_due_on)
  where plan_id is not null and plan_due_on is not null;
create index maintenance_work_orders_status_idx
  on public.maintenance_work_orders (condominium_id, status, priority, due_on, updated_at desc);
create index maintenance_work_orders_asset_idx
  on public.maintenance_work_orders (asset_id, created_at desc)
  where asset_id is not null;
create index maintenance_work_orders_request_idx
  on public.maintenance_work_orders (request_id)
  where request_id is not null;
create index maintenance_work_orders_assignee_idx
  on public.maintenance_work_orders (condominium_id, assigned_to_user_id, status, due_on)
  where assigned_to_user_id is not null;

create table public.maintenance_service_logs (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  work_order_id uuid not null,
  vendor_id uuid,
  performed_by_user_id uuid references auth.users(id),
  technician_name text check (
    technician_name is null or char_length(trim(technician_name)) between 2 and 160
  ),
  serviced_on date not null,
  summary text not null check (char_length(trim(summary)) between 3 and 5000),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 10080),
  service_amount numeric(18, 2) check (service_amount is null or service_amount >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  reference text check (reference is null or char_length(trim(reference)) <= 160),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (work_order_id, condominium_id)
    references public.maintenance_work_orders(id, condominium_id) on delete cascade,
  foreign key (vendor_id, condominium_id)
    references public.vendors(id, condominium_id),
  check (
    (service_amount is null and currency_code is null)
    or (service_amount is not null and currency_code is not null)
  ),
  check (num_nonnulls(performed_by_user_id, technician_name, vendor_id) >= 1)
);

create index maintenance_service_logs_work_order_idx
  on public.maintenance_service_logs (work_order_id, serviced_on, created_at, id);
create index maintenance_service_logs_asset_history_idx
  on public.maintenance_service_logs (condominium_id, serviced_on desc, created_at desc);

create table public.maintenance_events (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  entity_type text not null check (
    entity_type in ('asset', 'plan', 'work_order', 'service_log')
  ),
  entity_id uuid not null,
  event_type public.maintenance_event_type not null,
  actor_user_id uuid references auth.users(id),
  from_value jsonb,
  to_value jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index maintenance_events_entity_idx
  on public.maintenance_events (entity_type, entity_id, occurred_at, id);
create index maintenance_events_condominium_idx
  on public.maintenance_events (condominium_id, occurred_at desc, id desc);

create function public.can_read_maintenance(target uuid)
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
        and cm.role in ('condominium_admin', 'assistant', 'board_member', 'accountant')
    );
$$;

create function public.can_manage_maintenance(target uuid)
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
        and cm.role in ('condominium_admin', 'assistant')
    );
$$;

create function public.is_valid_maintenance_assignee(target uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.condominiums c
    join public.organization_memberships om
      on om.organization_id = c.organization_id
    where c.id = target
      and om.user_id = target_user
      and om.role = 'organization_owner'
  ) or exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = target_user
      and cm.role in ('condominium_admin', 'assistant')
  );
$$;

create function public.maintenance_transition_allowed(
  current_status public.maintenance_work_order_status,
  next_status public.maintenance_work_order_status
)
returns boolean
language sql
immutable
as $$
  select case current_status
    when 'draft' then next_status in ('scheduled', 'cancelled')
    when 'scheduled' then next_status in ('in_progress', 'completed', 'cancelled')
    when 'in_progress' then next_status in ('completed', 'cancelled')
    when 'completed' then false
    when 'cancelled' then false
  end;
$$;

create function public.maintenance_next_due(
  current_due date,
  recurrence_value integer,
  recurrence_unit public.maintenance_frequency_unit
)
returns date
language sql
immutable
as $$
  select case recurrence_unit
    when 'days' then current_due + recurrence_value
    when 'weeks' then current_due + (recurrence_value * 7)
    when 'months' then (current_due + make_interval(months => recurrence_value))::date
    when 'years' then (current_due + make_interval(years => recurrence_value))::date
  end;
$$;

revoke execute on function public.can_read_maintenance(uuid) from public;
revoke execute on function public.can_manage_maintenance(uuid) from public;
revoke execute on function public.is_valid_maintenance_assignee(uuid, uuid) from public;
revoke execute on function public.maintenance_transition_allowed(
  public.maintenance_work_order_status,
  public.maintenance_work_order_status
) from public;
revoke execute on function public.maintenance_next_due(
  date,
  integer,
  public.maintenance_frequency_unit
) from public;
grant execute on function public.can_read_maintenance(uuid) to authenticated, service_role;
grant execute on function public.can_manage_maintenance(uuid) to authenticated, service_role;
grant execute on function public.is_valid_maintenance_assignee(uuid, uuid) to authenticated, service_role;
grant execute on function public.maintenance_transition_allowed(
  public.maintenance_work_order_status,
  public.maintenance_work_order_status
) to authenticated, service_role;
grant execute on function public.maintenance_next_due(
  date,
  integer,
  public.maintenance_frequency_unit
) to authenticated, service_role;

alter table public.maintenance_assets enable row level security;
alter table public.maintenance_plans enable row level security;
alter table public.maintenance_work_orders enable row level security;
alter table public.maintenance_service_logs enable row level security;
alter table public.maintenance_events enable row level security;

create policy maintenance_assets_read on public.maintenance_assets
for select using (public.can_read_maintenance(condominium_id));
create policy maintenance_plans_read on public.maintenance_plans
for select using (public.can_read_maintenance(condominium_id));
create policy maintenance_work_orders_read on public.maintenance_work_orders
for select using (public.can_read_maintenance(condominium_id));
create policy maintenance_service_logs_read on public.maintenance_service_logs
for select using (public.can_read_maintenance(condominium_id));
create policy maintenance_events_read on public.maintenance_events
for select using (public.can_read_maintenance(condominium_id));

create function public.maintenance_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger maintenance_service_logs_append_only
before update or delete on public.maintenance_service_logs
for each row execute function public.maintenance_append_only();
create trigger maintenance_events_append_only
before update or delete on public.maintenance_events
for each row execute function public.maintenance_append_only();

revoke execute on function public.maintenance_append_only() from public;

create function public.create_maintenance_asset(
  target_condominium uuid,
  asset_code text,
  asset_name text,
  asset_category text,
  target_building uuid default null,
  target_unit uuid default null,
  manufacturer_value text default null,
  model_value text default null,
  serial_value text default null,
  installed_date date default null,
  warranty_date date default null,
  location_value text default null,
  notes_value text default null
)
returns public.maintenance_assets
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.maintenance_assets;
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;
  if char_length(trim(asset_code)) not between 2 and 40
    or trim(asset_code) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$'
    or char_length(trim(asset_name)) not between 2 and 160
    or char_length(trim(asset_category)) not between 2 and 80 then
    raise exception 'invalid maintenance asset';
  end if;
  if target_building is not null and target_unit is not null then
    raise exception 'asset location must use either building or unit';
  end if;
  if target_building is not null and not exists (
    select 1 from public.buildings b
    where b.id = target_building and b.condominium_id = target_condominium
  ) then
    raise exception 'invalid asset building';
  end if;
  if target_unit is not null and not exists (
    select 1 from public.units u
    where u.id = target_unit and u.condominium_id = target_condominium
  ) then
    raise exception 'invalid asset unit';
  end if;
  if warranty_date is not null and installed_date is not null and warranty_date < installed_date then
    raise exception 'warranty date must not precede installation date';
  end if;

  insert into public.maintenance_assets (
    condominium_id,
    building_id,
    unit_id,
    code,
    name,
    category,
    manufacturer,
    model,
    serial_number,
    installed_on,
    warranty_expires_on,
    location_notes,
    notes,
    created_by
  ) values (
    target_condominium,
    target_building,
    target_unit,
    trim(asset_code),
    trim(asset_name),
    trim(asset_category),
    nullif(trim(manufacturer_value), ''),
    nullif(trim(model_value), ''),
    nullif(trim(serial_value), ''),
    installed_date,
    warranty_date,
    nullif(trim(location_value), ''),
    nullif(trim(notes_value), ''),
    auth.uid()
  ) returning * into created;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, to_value
  ) values (
    target_condominium,
    'asset',
    created.id,
    'created',
    auth.uid(),
    jsonb_build_object('code', created.code, 'status', created.status)
  );

  return created;
end;
$$;

create function public.update_maintenance_asset(
  target_condominium uuid,
  target_asset uuid,
  asset_code text,
  asset_name text,
  asset_category text,
  target_building uuid,
  target_unit uuid,
  manufacturer_value text,
  model_value text,
  serial_value text,
  installed_date date,
  warranty_date date,
  location_value text,
  notes_value text,
  next_status public.maintenance_asset_status,
  expected_version integer
)
returns public.maintenance_assets
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_asset public.maintenance_assets;
  updated_asset public.maintenance_assets;
  resolved_event public.maintenance_event_type := 'updated';
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;

  select * into current_asset
  from public.maintenance_assets a
  where a.id = target_asset and a.condominium_id = target_condominium
  for update;

  if current_asset.id is null then
    raise exception 'maintenance asset not found';
  end if;
  if current_asset.status = 'retired' then
    raise exception 'retired assets cannot be edited';
  end if;
  if expected_version is not null and current_asset.version <> expected_version then
    raise exception 'maintenance asset version conflict';
  end if;
  if next_status is null then
    raise exception 'maintenance asset status required';
  end if;
  if target_building is not null and target_unit is not null then
    raise exception 'asset location must use either building or unit';
  end if;
  if target_building is not null and not exists (
    select 1 from public.buildings b
    where b.id = target_building and b.condominium_id = target_condominium
  ) then
    raise exception 'invalid asset building';
  end if;
  if target_unit is not null and not exists (
    select 1 from public.units u
    where u.id = target_unit and u.condominium_id = target_condominium
  ) then
    raise exception 'invalid asset unit';
  end if;
  if warranty_date is not null and installed_date is not null and warranty_date < installed_date then
    raise exception 'warranty date must not precede installation date';
  end if;
  if char_length(trim(asset_code)) not between 2 and 40
    or trim(asset_code) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$'
    or char_length(trim(asset_name)) not between 2 and 160
    or char_length(trim(asset_category)) not between 2 and 80 then
    raise exception 'invalid maintenance asset';
  end if;

  if next_status = 'retired' then
    resolved_event := 'retired';
  elsif current_asset.status <> next_status then
    resolved_event := 'status_changed';
  end if;

  update public.maintenance_assets
  set building_id = target_building,
      unit_id = target_unit,
      code = trim(asset_code),
      name = trim(asset_name),
      category = trim(asset_category),
      manufacturer = nullif(trim(manufacturer_value), ''),
      model = nullif(trim(model_value), ''),
      serial_number = nullif(trim(serial_value), ''),
      installed_on = installed_date,
      warranty_expires_on = warranty_date,
      location_notes = nullif(trim(location_value), ''),
      notes = nullif(trim(notes_value), ''),
      status = next_status,
      retired_at = case when next_status = 'retired' then now() else null end,
      version = current_asset.version + 1,
      updated_at = now()
  where id = current_asset.id
  returning * into updated_asset;

  if next_status = 'retired' then
    update public.maintenance_plans
    set is_active = false,
        deactivated_at = coalesce(deactivated_at, now()),
        version = version + 1,
        updated_at = now()
    where asset_id = updated_asset.id and is_active;
  end if;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, from_value, to_value
  ) values (
    target_condominium,
    'asset',
    updated_asset.id,
    resolved_event,
    auth.uid(),
    jsonb_build_object(
      'code', current_asset.code,
      'name', current_asset.name,
      'status', current_asset.status,
      'version', current_asset.version
    ),
    jsonb_build_object(
      'code', updated_asset.code,
      'name', updated_asset.name,
      'status', updated_asset.status,
      'version', updated_asset.version
    )
  );

  return updated_asset;
end;
$$;

create function public.create_maintenance_plan(
  target_condominium uuid,
  target_asset uuid,
  plan_name text,
  plan_kind public.maintenance_plan_kind,
  plan_instructions text,
  recurrence_value integer,
  recurrence_unit public.maintenance_frequency_unit,
  first_due_on date,
  target_vendor uuid default null,
  target_assignee uuid default null,
  duration_minutes integer default null
)
returns public.maintenance_plans
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.maintenance_plans;
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;
  if char_length(trim(plan_name)) not between 2 and 160
    or char_length(trim(plan_instructions)) not between 3 and 5000
    or recurrence_value not between 1 and 365 then
    raise exception 'invalid maintenance plan';
  end if;
  if not exists (
    select 1 from public.maintenance_assets a
    where a.id = target_asset
      and a.condominium_id = target_condominium
      and a.status <> 'retired'
  ) then
    raise exception 'invalid maintenance asset';
  end if;
  if target_vendor is not null and not exists (
    select 1 from public.vendors v
    where v.id = target_vendor
      and v.condominium_id = target_condominium
      and v.is_active
  ) then
    raise exception 'invalid maintenance vendor';
  end if;
  if target_assignee is not null
    and not public.is_valid_maintenance_assignee(target_condominium, target_assignee) then
    raise exception 'invalid maintenance assignee';
  end if;

  insert into public.maintenance_plans (
    condominium_id,
    asset_id,
    default_vendor_id,
    assigned_to_user_id,
    name,
    kind,
    instructions,
    frequency_value,
    frequency_unit,
    next_due_on,
    estimated_duration_minutes,
    created_by
  ) values (
    target_condominium,
    target_asset,
    target_vendor,
    target_assignee,
    trim(plan_name),
    plan_kind,
    trim(plan_instructions),
    recurrence_value,
    recurrence_unit,
    first_due_on,
    duration_minutes,
    auth.uid()
  ) returning * into created;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, to_value
  ) values (
    target_condominium,
    'plan',
    created.id,
    'created',
    auth.uid(),
    jsonb_build_object(
      'asset_id', created.asset_id,
      'next_due_on', created.next_due_on,
      'frequency_value', created.frequency_value,
      'frequency_unit', created.frequency_unit
    )
  );

  return created;
end;
$$;

create function public.update_maintenance_plan(
  target_condominium uuid,
  target_plan uuid,
  plan_name text,
  plan_kind public.maintenance_plan_kind,
  plan_instructions text,
  recurrence_value integer,
  recurrence_unit public.maintenance_frequency_unit,
  next_due_date date,
  target_vendor uuid,
  target_assignee uuid,
  duration_minutes integer,
  active_value boolean,
  expected_version integer
)
returns public.maintenance_plans
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_plan public.maintenance_plans;
  updated_plan public.maintenance_plans;
  resolved_event public.maintenance_event_type := 'updated';
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;

  select * into current_plan
  from public.maintenance_plans p
  where p.id = target_plan and p.condominium_id = target_condominium
  for update;

  if current_plan.id is null then
    raise exception 'maintenance plan not found';
  end if;
  if expected_version is not null and current_plan.version <> expected_version then
    raise exception 'maintenance plan version conflict';
  end if;
  if char_length(trim(plan_name)) not between 2 and 160
    or char_length(trim(plan_instructions)) not between 3 and 5000
    or recurrence_value not between 1 and 365 then
    raise exception 'invalid maintenance plan';
  end if;
  if not exists (
    select 1 from public.maintenance_assets a
    where a.id = current_plan.asset_id
      and a.condominium_id = target_condominium
      and a.status <> 'retired'
  ) and active_value then
    raise exception 'retired asset plan cannot be activated';
  end if;
  if target_vendor is not null and not exists (
    select 1 from public.vendors v
    where v.id = target_vendor
      and v.condominium_id = target_condominium
      and v.is_active
  ) then
    raise exception 'invalid maintenance vendor';
  end if;
  if target_assignee is not null
    and not public.is_valid_maintenance_assignee(target_condominium, target_assignee) then
    raise exception 'invalid maintenance assignee';
  end if;

  if current_plan.is_active and not active_value then
    resolved_event := 'deactivated';
  elsif not current_plan.is_active and active_value then
    resolved_event := 'activated';
  end if;

  update public.maintenance_plans
  set default_vendor_id = target_vendor,
      assigned_to_user_id = target_assignee,
      name = trim(plan_name),
      kind = plan_kind,
      instructions = trim(plan_instructions),
      frequency_value = recurrence_value,
      frequency_unit = recurrence_unit,
      next_due_on = next_due_date,
      last_generated_due_on = case
        when last_generated_due_on is not null and last_generated_due_on >= next_due_date then null
        else last_generated_due_on
      end,
      estimated_duration_minutes = duration_minutes,
      is_active = active_value,
      deactivated_at = case when active_value then null else coalesce(deactivated_at, now()) end,
      version = current_plan.version + 1,
      updated_at = now()
  where id = current_plan.id
  returning * into updated_plan;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, from_value, to_value
  ) values (
    target_condominium,
    'plan',
    updated_plan.id,
    resolved_event,
    auth.uid(),
    jsonb_build_object(
      'next_due_on', current_plan.next_due_on,
      'is_active', current_plan.is_active,
      'version', current_plan.version
    ),
    jsonb_build_object(
      'next_due_on', updated_plan.next_due_on,
      'is_active', updated_plan.is_active,
      'version', updated_plan.version
    )
  );

  return updated_plan;
end;
$$;

create function public.create_maintenance_work_order(
  target_condominium uuid,
  target_asset uuid,
  target_request uuid,
  target_vendor uuid,
  target_assignee uuid,
  work_kind public.maintenance_work_order_kind,
  work_priority public.maintenance_priority,
  work_title text,
  work_description text,
  scheduled_at timestamptz default null,
  due_date date default null
)
returns public.maintenance_work_orders
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.maintenance_work_orders;
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;
  if char_length(trim(work_title)) not between 3 and 180
    or char_length(trim(work_description)) not between 3 and 5000 then
    raise exception 'invalid maintenance work order';
  end if;
  if target_asset is not null and not exists (
    select 1 from public.maintenance_assets a
    where a.id = target_asset
      and a.condominium_id = target_condominium
      and a.status <> 'retired'
  ) then
    raise exception 'invalid maintenance asset';
  end if;
  if target_request is not null and not exists (
    select 1 from public.service_requests r
    where r.id = target_request and r.condominium_id = target_condominium
  ) then
    raise exception 'invalid maintenance request';
  end if;
  if target_vendor is not null and not exists (
    select 1 from public.vendors v
    where v.id = target_vendor
      and v.condominium_id = target_condominium
      and v.is_active
  ) then
    raise exception 'invalid maintenance vendor';
  end if;
  if target_assignee is not null
    and not public.is_valid_maintenance_assignee(target_condominium, target_assignee) then
    raise exception 'invalid maintenance assignee';
  end if;
  if scheduled_at is not null and due_date is not null and due_date < scheduled_at::date then
    raise exception 'maintenance due date must not precede schedule';
  end if;

  insert into public.maintenance_work_orders (
    condominium_id,
    asset_id,
    request_id,
    vendor_id,
    assigned_to_user_id,
    kind,
    priority,
    title,
    description,
    scheduled_for,
    due_on,
    created_by
  ) values (
    target_condominium,
    target_asset,
    target_request,
    target_vendor,
    target_assignee,
    work_kind,
    work_priority,
    trim(work_title),
    trim(work_description),
    scheduled_at,
    due_date,
    auth.uid()
  ) returning * into created;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, to_value
  ) values (
    target_condominium,
    'work_order',
    created.id,
    'created',
    auth.uid(),
    jsonb_build_object(
      'work_order_number', created.work_order_number,
      'status', created.status,
      'asset_id', created.asset_id,
      'request_id', created.request_id
    )
  );

  return created;
end;
$$;

create function public.update_maintenance_work_order(
  target_condominium uuid,
  target_work_order uuid,
  target_asset uuid,
  target_request uuid,
  target_vendor uuid,
  target_assignee uuid,
  work_kind public.maintenance_work_order_kind,
  work_priority public.maintenance_priority,
  work_title text,
  work_description text,
  scheduled_at timestamptz,
  due_date date,
  expected_version integer
)
returns public.maintenance_work_orders
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_order public.maintenance_work_orders;
  updated_order public.maintenance_work_orders;
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;

  select * into current_order
  from public.maintenance_work_orders w
  where w.id = target_work_order and w.condominium_id = target_condominium
  for update;

  if current_order.id is null then
    raise exception 'maintenance work order not found';
  end if;
  if current_order.status <> 'draft' then
    raise exception 'only draft maintenance work orders can be edited';
  end if;
  if expected_version is not null and current_order.version <> expected_version then
    raise exception 'maintenance work order version conflict';
  end if;
  if char_length(trim(work_title)) not between 3 and 180
    or char_length(trim(work_description)) not between 3 and 5000 then
    raise exception 'invalid maintenance work order';
  end if;
  if target_asset is not null and not exists (
    select 1 from public.maintenance_assets a
    where a.id = target_asset
      and a.condominium_id = target_condominium
      and a.status <> 'retired'
  ) then
    raise exception 'invalid maintenance asset';
  end if;
  if target_request is not null and not exists (
    select 1 from public.service_requests r
    where r.id = target_request and r.condominium_id = target_condominium
  ) then
    raise exception 'invalid maintenance request';
  end if;
  if target_vendor is not null and not exists (
    select 1 from public.vendors v
    where v.id = target_vendor
      and v.condominium_id = target_condominium
      and v.is_active
  ) then
    raise exception 'invalid maintenance vendor';
  end if;
  if target_assignee is not null
    and not public.is_valid_maintenance_assignee(target_condominium, target_assignee) then
    raise exception 'invalid maintenance assignee';
  end if;
  if scheduled_at is not null and due_date is not null and due_date < scheduled_at::date then
    raise exception 'maintenance due date must not precede schedule';
  end if;

  update public.maintenance_work_orders
  set asset_id = target_asset,
      request_id = target_request,
      vendor_id = target_vendor,
      assigned_to_user_id = target_assignee,
      kind = work_kind,
      priority = work_priority,
      title = trim(work_title),
      description = trim(work_description),
      scheduled_for = scheduled_at,
      due_on = due_date,
      version = current_order.version + 1,
      updated_at = now()
  where id = current_order.id
  returning * into updated_order;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, from_value, to_value
  ) values (
    target_condominium,
    'work_order',
    updated_order.id,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'title', current_order.title,
      'priority', current_order.priority,
      'version', current_order.version
    ),
    jsonb_build_object(
      'title', updated_order.title,
      'priority', updated_order.priority,
      'version', updated_order.version
    )
  );

  return updated_order;
end;
$$;

create function public.transition_maintenance_work_order(
  target_condominium uuid,
  target_work_order uuid,
  next_status public.maintenance_work_order_status,
  transition_note text default null,
  expected_version integer default null
)
returns public.maintenance_work_orders
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_order public.maintenance_work_orders;
  updated_order public.maintenance_work_orders;
  normalized_note text := nullif(trim(transition_note), '');
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;

  select * into current_order
  from public.maintenance_work_orders w
  where w.id = target_work_order and w.condominium_id = target_condominium
  for update;

  if current_order.id is null then
    raise exception 'maintenance work order not found';
  end if;
  if expected_version is not null and current_order.version <> expected_version then
    raise exception 'maintenance work order version conflict';
  end if;
  if next_status is null
    or not public.maintenance_transition_allowed(current_order.status, next_status) then
    raise exception 'invalid maintenance work order transition';
  end if;
  if next_status = 'scheduled'
    and current_order.scheduled_for is null
    and current_order.due_on is null then
    raise exception 'scheduled maintenance requires a schedule or due date';
  end if;
  if next_status in ('completed', 'cancelled')
    and coalesce(char_length(normalized_note), 0) < 3 then
    raise exception 'maintenance transition note required';
  end if;

  update public.maintenance_work_orders
  set status = next_status,
      started_at = case
        when next_status in ('in_progress', 'completed') then coalesce(started_at, now())
        else started_at
      end,
      completed_at = case when next_status = 'completed' then now() else null end,
      cancelled_at = case when next_status = 'cancelled' then now() else null end,
      completion_summary = case
        when next_status in ('completed', 'cancelled') then normalized_note
        else completion_summary
      end,
      version = current_order.version + 1,
      updated_at = now()
  where id = current_order.id
  returning * into updated_order;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, from_value, to_value
  ) values (
    target_condominium,
    'work_order',
    updated_order.id,
    'status_changed',
    auth.uid(),
    jsonb_build_object('status', current_order.status, 'version', current_order.version),
    jsonb_build_object(
      'status', updated_order.status,
      'version', updated_order.version,
      'note', normalized_note
    )
  );

  return updated_order;
end;
$$;

create function public.add_maintenance_service_log(
  target_condominium uuid,
  target_work_order uuid,
  service_date date,
  service_summary text,
  target_vendor uuid default null,
  performed_by_user uuid default null,
  technician_value text default null,
  duration_minutes integer default null,
  amount_value numeric default null,
  currency_value text default null,
  reference_value text default null,
  metadata_value jsonb default '{}'::jsonb
)
returns public.maintenance_service_logs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_order public.maintenance_work_orders;
  created public.maintenance_service_logs;
  normalized_currency text := nullif(upper(trim(currency_value)), '');
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;

  select * into current_order
  from public.maintenance_work_orders w
  where w.id = target_work_order and w.condominium_id = target_condominium;

  if current_order.id is null then
    raise exception 'maintenance work order not found';
  end if;
  if current_order.status not in ('scheduled', 'in_progress', 'completed') then
    raise exception 'service logs require an active or completed work order';
  end if;
  if char_length(trim(service_summary)) not between 3 and 5000 then
    raise exception 'invalid maintenance service summary';
  end if;
  if target_vendor is not null and not exists (
    select 1 from public.vendors v
    where v.id = target_vendor and v.condominium_id = target_condominium
  ) then
    raise exception 'invalid maintenance vendor';
  end if;
  if performed_by_user is not null
    and not public.is_valid_maintenance_assignee(target_condominium, performed_by_user) then
    raise exception 'invalid maintenance service user';
  end if;
  if num_nonnulls(performed_by_user, nullif(trim(technician_value), ''), target_vendor) < 1 then
    raise exception 'maintenance service performer required';
  end if;
  if (amount_value is null) <> (normalized_currency is null) then
    raise exception 'maintenance service amount and currency must be provided together';
  end if;
  if normalized_currency is not null and normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid maintenance service currency';
  end if;
  if metadata_value is null or jsonb_typeof(metadata_value) <> 'object' then
    raise exception 'maintenance service metadata must be an object';
  end if;

  insert into public.maintenance_service_logs (
    condominium_id,
    work_order_id,
    vendor_id,
    performed_by_user_id,
    technician_name,
    serviced_on,
    summary,
    duration_minutes,
    service_amount,
    currency_code,
    reference,
    metadata,
    created_by
  ) values (
    target_condominium,
    target_work_order,
    target_vendor,
    performed_by_user,
    nullif(trim(technician_value), ''),
    service_date,
    trim(service_summary),
    duration_minutes,
    amount_value,
    normalized_currency,
    nullif(trim(reference_value), ''),
    metadata_value,
    auth.uid()
  ) returning * into created;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, to_value, metadata
  ) values (
    target_condominium,
    'service_log',
    created.id,
    'service_logged',
    auth.uid(),
    jsonb_build_object(
      'work_order_id', created.work_order_id,
      'serviced_on', created.serviced_on,
      'vendor_id', created.vendor_id
    ),
    jsonb_build_object('work_order_number', current_order.work_order_number)
  );

  return created;
end;
$$;

create function public.generate_due_maintenance_work_orders(
  target_condominium uuid,
  through_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_plan public.maintenance_plans;
  current_due date;
  next_due date;
  created_order public.maintenance_work_orders;
  generated_count integer := 0;
  iteration_count integer;
begin
  if through_date is null then
    raise exception 'maintenance generation date required';
  end if;
  if auth.role() <> 'service_role'
    and (auth.uid() is null or not public.can_manage_maintenance(target_condominium)) then
    raise exception 'maintenance generation denied';
  end if;

  for current_plan in
    select p.*
    from public.maintenance_plans p
    join public.maintenance_assets a
      on a.id = p.asset_id and a.condominium_id = p.condominium_id
    where p.condominium_id = target_condominium
      and p.is_active
      and p.next_due_on <= through_date
      and a.status <> 'retired'
    order by p.next_due_on, p.id
    for update of p
  loop
    current_due := current_plan.next_due_on;
    iteration_count := 0;

    while current_due <= through_date loop
      iteration_count := iteration_count + 1;
      if iteration_count > 60 then
        raise exception 'maintenance plan backlog exceeds generation limit';
      end if;

      created_order := null;
      insert into public.maintenance_work_orders (
        condominium_id,
        asset_id,
        plan_id,
        plan_due_on,
        vendor_id,
        assigned_to_user_id,
        kind,
        priority,
        status,
        title,
        description,
        due_on,
        created_by
      ) values (
        target_condominium,
        current_plan.asset_id,
        current_plan.id,
        current_due,
        current_plan.default_vendor_id,
        current_plan.assigned_to_user_id,
        case current_plan.kind
          when 'preventive' then 'preventive'::public.maintenance_work_order_kind
          when 'inspection' then 'inspection'::public.maintenance_work_order_kind
        end,
        'normal',
        'scheduled',
        current_plan.name,
        current_plan.instructions,
        current_due,
        auth.uid()
      )
      on conflict (plan_id, plan_due_on)
        where plan_id is not null and plan_due_on is not null
      do nothing
      returning * into created_order;

      if created_order.id is not null then
        generated_count := generated_count + 1;
        insert into public.maintenance_events (
          condominium_id,
          entity_type,
          entity_id,
          event_type,
          actor_user_id,
          to_value,
          metadata
        ) values (
          target_condominium,
          'work_order',
          created_order.id,
          'generated',
          auth.uid(),
          jsonb_build_object(
            'status', created_order.status,
            'asset_id', created_order.asset_id,
            'plan_id', created_order.plan_id,
            'plan_due_on', created_order.plan_due_on
          ),
          jsonb_build_object('work_order_number', created_order.work_order_number)
        );
      end if;

      next_due := public.maintenance_next_due(
        current_due,
        current_plan.frequency_value,
        current_plan.frequency_unit
      );
      if next_due <= current_due then
        raise exception 'maintenance recurrence did not advance';
      end if;
      current_due := next_due;
    end loop;

    update public.maintenance_plans
    set last_generated_due_on = current_due - case current_plan.frequency_unit
          when 'days' then current_plan.frequency_value
          when 'weeks' then current_plan.frequency_value * 7
          else 0
        end,
        next_due_on = current_due,
        version = version + 1,
        updated_at = now()
    where id = current_plan.id;

    if current_plan.frequency_unit in ('months', 'years') then
      update public.maintenance_plans
      set last_generated_due_on = (
        select max(w.plan_due_on)
        from public.maintenance_work_orders w
        where w.plan_id = current_plan.id
      )
      where id = current_plan.id;
    end if;
  end loop;

  return generated_count;
end;
$$;

revoke execute on function public.create_maintenance_asset(
  uuid, text, text, text, uuid, uuid, text, text, text, date, date, text, text
) from public;
revoke execute on function public.update_maintenance_asset(
  uuid, uuid, text, text, text, uuid, uuid, text, text, text, date, date,
  text, text, public.maintenance_asset_status, integer
) from public;
revoke execute on function public.create_maintenance_plan(
  uuid, uuid, text, public.maintenance_plan_kind, text, integer,
  public.maintenance_frequency_unit, date, uuid, uuid, integer
) from public;
revoke execute on function public.update_maintenance_plan(
  uuid, uuid, text, public.maintenance_plan_kind, text, integer,
  public.maintenance_frequency_unit, date, uuid, uuid, integer, boolean, integer
) from public;
revoke execute on function public.create_maintenance_work_order(
  uuid, uuid, uuid, uuid, uuid, public.maintenance_work_order_kind,
  public.maintenance_priority, text, text, timestamptz, date
) from public;
revoke execute on function public.update_maintenance_work_order(
  uuid, uuid, uuid, uuid, uuid, uuid, public.maintenance_work_order_kind,
  public.maintenance_priority, text, text, timestamptz, date, integer
) from public;
revoke execute on function public.transition_maintenance_work_order(
  uuid, uuid, public.maintenance_work_order_status, text, integer
) from public;
revoke execute on function public.add_maintenance_service_log(
  uuid, uuid, date, text, uuid, uuid, text, integer, numeric, text, text, jsonb
) from public;
revoke execute on function public.generate_due_maintenance_work_orders(uuid, date) from public;

grant execute on function public.create_maintenance_asset(
  uuid, text, text, text, uuid, uuid, text, text, text, date, date, text, text
) to authenticated, service_role;
grant execute on function public.update_maintenance_asset(
  uuid, uuid, text, text, text, uuid, uuid, text, text, text, date, date,
  text, text, public.maintenance_asset_status, integer
) to authenticated, service_role;
grant execute on function public.create_maintenance_plan(
  uuid, uuid, text, public.maintenance_plan_kind, text, integer,
  public.maintenance_frequency_unit, date, uuid, uuid, integer
) to authenticated, service_role;
grant execute on function public.update_maintenance_plan(
  uuid, uuid, text, public.maintenance_plan_kind, text, integer,
  public.maintenance_frequency_unit, date, uuid, uuid, integer, boolean, integer
) to authenticated, service_role;
grant execute on function public.create_maintenance_work_order(
  uuid, uuid, uuid, uuid, uuid, public.maintenance_work_order_kind,
  public.maintenance_priority, text, text, timestamptz, date
) to authenticated, service_role;
grant execute on function public.update_maintenance_work_order(
  uuid, uuid, uuid, uuid, uuid, uuid, public.maintenance_work_order_kind,
  public.maintenance_priority, text, text, timestamptz, date, integer
) to authenticated, service_role;
grant execute on function public.transition_maintenance_work_order(
  uuid, uuid, public.maintenance_work_order_status, text, integer
) to authenticated, service_role;
grant execute on function public.add_maintenance_service_log(
  uuid, uuid, date, text, uuid, uuid, text, integer, numeric, text, text, jsonb
) to authenticated, service_role;
grant execute on function public.generate_due_maintenance_work_orders(uuid, date)
  to authenticated, service_role;
