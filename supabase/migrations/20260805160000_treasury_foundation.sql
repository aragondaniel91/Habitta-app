-- Treasury ledger foundation for Habitta.
-- Keeps balances derived from immutable movements and never mixes currencies.

create type public.treasury_account_type as enum ('bank', 'cash');
create type public.treasury_movement_direction as enum ('credit', 'debit');
create type public.treasury_movement_kind as enum (
  'opening_balance',
  'deposit',
  'withdrawal',
  'fee',
  'adjustment',
  'transfer_in',
  'transfer_out',
  'reversal'
);
create type public.treasury_source_type as enum (
  'manual',
  'opening_balance',
  'payment',
  'expense',
  'transfer',
  'reversal'
);
create type public.treasury_reconciliation_status as enum ('draft', 'closed');

create table public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  account_type public.treasury_account_type not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  bank_name text check (bank_name is null or char_length(trim(bank_name)) between 2 and 120),
  account_reference text check (
    account_reference is null or char_length(trim(account_reference)) between 2 and 120
  ),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id)
);

create unique index treasury_accounts_name_unique
  on public.treasury_accounts (condominium_id, lower(name));
create index treasury_accounts_condominium_currency_idx
  on public.treasury_accounts (condominium_id, currency_code, is_active, name);

create table public.treasury_transfers (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  occurred_on date not null,
  description text not null check (char_length(trim(description)) between 2 and 500),
  reference text check (reference is null or char_length(trim(reference)) <= 160),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (condominium_id, idempotency_key),
  foreign key (from_account_id, condominium_id)
    references public.treasury_accounts(id, condominium_id),
  foreign key (to_account_id, condominium_id)
    references public.treasury_accounts(id, condominium_id),
  check (from_account_id <> to_account_id)
);

create index treasury_transfers_condominium_date_idx
  on public.treasury_transfers (condominium_id, occurred_on desc, created_at desc);

create table public.treasury_movements (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  account_id uuid not null,
  transfer_id uuid,
  direction public.treasury_movement_direction not null,
  movement_kind public.treasury_movement_kind not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  occurred_on date not null,
  description text not null check (char_length(trim(description)) between 2 and 500),
  reference text check (reference is null or char_length(trim(reference)) <= 160),
  source_type public.treasury_source_type not null,
  source_id uuid,
  reversal_of uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 180),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (condominium_id, idempotency_key),
  foreign key (account_id, condominium_id)
    references public.treasury_accounts(id, condominium_id),
  foreign key (transfer_id, condominium_id)
    references public.treasury_transfers(id, condominium_id),
  foreign key (reversal_of, condominium_id)
    references public.treasury_movements(id, condominium_id),
  check (
    (movement_kind in ('transfer_in', 'transfer_out') and transfer_id is not null and source_type = 'transfer')
    or (movement_kind not in ('transfer_in', 'transfer_out') and transfer_id is null)
  ),
  check (
    (movement_kind in ('deposit', 'transfer_in') and direction = 'credit')
    or (movement_kind in ('withdrawal', 'fee', 'transfer_out') and direction = 'debit')
    or movement_kind in ('opening_balance', 'adjustment', 'reversal')
  ),
  check (
    (movement_kind = 'reversal' and reversal_of is not null and source_type = 'reversal')
    or (movement_kind <> 'reversal' and reversal_of is null)
  )
);

create unique index treasury_movements_reversal_unique
  on public.treasury_movements (reversal_of)
  where reversal_of is not null;
create index treasury_movements_account_date_idx
  on public.treasury_movements (account_id, occurred_on desc, created_at desc, id desc);
create index treasury_movements_condominium_source_idx
  on public.treasury_movements (condominium_id, source_type, source_id)
  where source_id is not null;

create table public.treasury_reconciliations (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  account_id uuid not null,
  period_start date not null,
  period_end date not null,
  statement_opening_balance numeric(18, 2) not null,
  statement_closing_balance numeric(18, 2) not null,
  book_closing_balance numeric(18, 2),
  difference numeric(18, 2),
  status public.treasury_reconciliation_status not null default 'draft',
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (account_id, condominium_id)
    references public.treasury_accounts(id, condominium_id),
  check (period_end >= period_start),
  check (
    (status = 'draft' and closed_by is null and closed_at is null)
    or (status = 'closed' and closed_by is not null and closed_at is not null)
  )
);

create unique index treasury_reconciliations_period_unique
  on public.treasury_reconciliations (account_id, period_start, period_end);

create table public.treasury_reconciliation_items (
  reconciliation_id uuid not null,
  movement_id uuid not null,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  matched_by uuid not null references auth.users(id),
  matched_at timestamptz not null default now(),
  primary key (reconciliation_id, movement_id),
  foreign key (reconciliation_id, condominium_id)
    references public.treasury_reconciliations(id, condominium_id),
  foreign key (movement_id, condominium_id)
    references public.treasury_movements(id, condominium_id)
);

create unique index treasury_reconciliation_movement_unique
  on public.treasury_reconciliation_items (movement_id);

create table public.treasury_events (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  entity_type text not null check (
    entity_type in ('account', 'movement', 'transfer', 'reconciliation')
  ),
  entity_id uuid not null,
  event_type text not null check (
    event_type in (
      'created',
      'movement_recorded',
      'movement_reversed',
      'transfer_recorded',
      'reconciliation_created',
      'movement_matched',
      'reconciliation_closed'
    )
  ),
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index treasury_events_entity_idx
  on public.treasury_events (entity_type, entity_id, occurred_at, id);
create index treasury_events_condominium_idx
  on public.treasury_events (condominium_id, occurred_at desc);

create function public.can_read_treasury(target uuid)
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

create function public.can_manage_treasury(target uuid)
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

revoke execute on function public.can_read_treasury(uuid) from public;
revoke execute on function public.can_manage_treasury(uuid) from public;
grant execute on function public.can_read_treasury(uuid) to authenticated, service_role;
grant execute on function public.can_manage_treasury(uuid) to authenticated, service_role;

alter table public.treasury_accounts enable row level security;
alter table public.treasury_transfers enable row level security;
alter table public.treasury_movements enable row level security;
alter table public.treasury_reconciliations enable row level security;
alter table public.treasury_reconciliation_items enable row level security;
alter table public.treasury_events enable row level security;

create policy treasury_accounts_read on public.treasury_accounts
for select using (public.can_read_treasury(condominium_id));
create policy treasury_transfers_read on public.treasury_transfers
for select using (public.can_read_treasury(condominium_id));
create policy treasury_movements_read on public.treasury_movements
for select using (public.can_read_treasury(condominium_id));
create policy treasury_reconciliations_read on public.treasury_reconciliations
for select using (public.can_read_treasury(condominium_id));
create policy treasury_reconciliation_items_read on public.treasury_reconciliation_items
for select using (public.can_read_treasury(condominium_id));
create policy treasury_events_read on public.treasury_events
for select using (public.can_read_treasury(condominium_id));

create function public.treasury_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger treasury_movements_append_only
before update or delete on public.treasury_movements
for each row execute function public.treasury_append_only();
create trigger treasury_transfers_append_only
before update or delete on public.treasury_transfers
for each row execute function public.treasury_append_only();
create trigger treasury_events_append_only
before update or delete on public.treasury_events
for each row execute function public.treasury_append_only();
create trigger treasury_reconciliation_items_append_only
before update or delete on public.treasury_reconciliation_items
for each row execute function public.treasury_append_only();

create function public.create_treasury_account(
  target_condominium uuid,
  account_name text,
  account_kind public.treasury_account_type,
  account_currency text,
  financial_institution text default null,
  reference_value text default null,
  account_notes text default null
)
returns public.treasury_accounts
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.treasury_accounts;
  normalized_currency text := upper(trim(account_currency));
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;
  if char_length(trim(account_name)) not between 2 and 120
    or normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid treasury account';
  end if;
  if account_kind = 'cash' and financial_institution is not null then
    raise exception 'cash accounts cannot have a bank name';
  end if;

  insert into public.treasury_accounts (
    condominium_id,
    name,
    account_type,
    currency_code,
    bank_name,
    account_reference,
    notes,
    created_by
  ) values (
    target_condominium,
    trim(account_name),
    account_kind,
    normalized_currency,
    nullif(trim(financial_institution), ''),
    nullif(trim(reference_value), ''),
    nullif(trim(account_notes), ''),
    auth.uid()
  ) returning * into created;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    created.condominium_id,
    'account',
    created.id,
    'created',
    auth.uid(),
    jsonb_build_object(
      'name', created.name,
      'type', created.account_type,
      'currency', created.currency_code
    )
  );

  return created;
end;
$$;

create function public.record_treasury_movement(
  target_condominium uuid,
  target_account uuid,
  movement_direction public.treasury_movement_direction,
  movement_type public.treasury_movement_kind,
  movement_amount numeric,
  movement_date date,
  movement_description text,
  movement_reference text,
  movement_source public.treasury_source_type,
  source_record uuid,
  request_key text
)
returns public.treasury_movements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  account_record public.treasury_accounts;
  existing public.treasury_movements;
  created public.treasury_movements;
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;
  if movement_type in ('transfer_in', 'transfer_out', 'reversal') then
    raise exception 'use the dedicated treasury operation';
  end if;
  if movement_amount is null or movement_amount <= 0
    or movement_date is null
    or char_length(trim(movement_description)) not between 2 and 500
    or char_length(trim(request_key)) not between 8 and 180 then
    raise exception 'invalid treasury movement';
  end if;
  if movement_type = 'deposit' and movement_direction <> 'credit'
    or movement_type in ('withdrawal', 'fee') and movement_direction <> 'debit' then
    raise exception 'movement direction does not match type';
  end if;
  if movement_type = 'opening_balance' and movement_source <> 'opening_balance' then
    raise exception 'invalid opening balance source';
  end if;
  if movement_type <> 'opening_balance' and movement_source = 'opening_balance' then
    raise exception 'invalid movement source';
  end if;

  select * into account_record
  from public.treasury_accounts a
  where a.id = target_account
    and a.condominium_id = target_condominium
  for update;

  if account_record.id is null then raise exception 'treasury account not found'; end if;
  if not account_record.is_active then raise exception 'treasury account is inactive'; end if;
  if movement_type = 'opening_balance' and exists (
    select 1 from public.treasury_movements m where m.account_id = account_record.id
  ) then
    raise exception 'opening balance requires an empty account';
  end if;

  select * into existing
  from public.treasury_movements m
  where m.condominium_id = target_condominium
    and m.idempotency_key = trim(request_key);

  if existing.id is not null then
    if existing.account_id <> target_account
      or existing.direction <> movement_direction
      or existing.movement_kind <> movement_type
      or existing.amount <> round(movement_amount, 2) then
      raise exception 'treasury idempotency key conflict';
    end if;
    return existing;
  end if;

  insert into public.treasury_movements (
    condominium_id,
    account_id,
    direction,
    movement_kind,
    amount,
    currency_code,
    occurred_on,
    description,
    reference,
    source_type,
    source_id,
    idempotency_key,
    created_by
  ) values (
    target_condominium,
    target_account,
    movement_direction,
    movement_type,
    round(movement_amount, 2),
    account_record.currency_code,
    movement_date,
    trim(movement_description),
    nullif(trim(movement_reference), ''),
    movement_source,
    source_record,
    trim(request_key),
    auth.uid()
  ) returning * into created;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    created.condominium_id,
    'movement',
    created.id,
    'movement_recorded',
    auth.uid(),
    jsonb_build_object(
      'account_id', created.account_id,
      'direction', created.direction,
      'kind', created.movement_kind,
      'amount', created.amount,
      'currency', created.currency_code
    )
  );

  return created;
end;
$$;

create function public.create_treasury_transfer(
  target_condominium uuid,
  source_account uuid,
  destination_account uuid,
  transfer_amount numeric,
  transfer_date date,
  transfer_description text,
  transfer_reference text,
  request_key text
)
returns public.treasury_transfers
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source_record public.treasury_accounts;
  destination_record public.treasury_accounts;
  existing public.treasury_transfers;
  created public.treasury_transfers;
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;
  if source_account = destination_account
    or transfer_amount is null or transfer_amount <= 0
    or transfer_date is null
    or char_length(trim(transfer_description)) not between 2 and 500
    or char_length(trim(request_key)) not between 8 and 160 then
    raise exception 'invalid treasury transfer';
  end if;

  perform 1
  from public.treasury_accounts a
  where a.condominium_id = target_condominium
    and a.id in (source_account, destination_account)
  order by a.id
  for update;

  select * into source_record
  from public.treasury_accounts a
  where a.id = source_account and a.condominium_id = target_condominium;
  select * into destination_record
  from public.treasury_accounts a
  where a.id = destination_account and a.condominium_id = target_condominium;

  if source_record.id is null or destination_record.id is null then
    raise exception 'treasury account not found';
  end if;
  if not source_record.is_active or not destination_record.is_active then
    raise exception 'treasury account is inactive';
  end if;
  if source_record.currency_code <> destination_record.currency_code then
    raise exception 'cross-currency transfer requires an exchange operation';
  end if;

  select * into existing
  from public.treasury_transfers t
  where t.condominium_id = target_condominium
    and t.idempotency_key = trim(request_key);

  if existing.id is not null then
    if existing.from_account_id <> source_account
      or existing.to_account_id <> destination_account
      or existing.amount <> round(transfer_amount, 2) then
      raise exception 'treasury idempotency key conflict';
    end if;
    return existing;
  end if;

  insert into public.treasury_transfers (
    condominium_id,
    from_account_id,
    to_account_id,
    amount,
    currency_code,
    occurred_on,
    description,
    reference,
    idempotency_key,
    created_by
  ) values (
    target_condominium,
    source_account,
    destination_account,
    round(transfer_amount, 2),
    source_record.currency_code,
    transfer_date,
    trim(transfer_description),
    nullif(trim(transfer_reference), ''),
    trim(request_key),
    auth.uid()
  ) returning * into created;

  insert into public.treasury_movements (
    condominium_id,
    account_id,
    transfer_id,
    direction,
    movement_kind,
    amount,
    currency_code,
    occurred_on,
    description,
    reference,
    source_type,
    source_id,
    idempotency_key,
    created_by
  ) values
  (
    target_condominium,
    source_account,
    created.id,
    'debit',
    'transfer_out',
    created.amount,
    created.currency_code,
    created.occurred_on,
    created.description,
    created.reference,
    'transfer',
    created.id,
    trim(request_key) || ':out',
    auth.uid()
  ),
  (
    target_condominium,
    destination_account,
    created.id,
    'credit',
    'transfer_in',
    created.amount,
    created.currency_code,
    created.occurred_on,
    created.description,
    created.reference,
    'transfer',
    created.id,
    trim(request_key) || ':in',
    auth.uid()
  );

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    created.condominium_id,
    'transfer',
    created.id,
    'transfer_recorded',
    auth.uid(),
    jsonb_build_object(
      'from_account_id', created.from_account_id,
      'to_account_id', created.to_account_id,
      'amount', created.amount,
      'currency', created.currency_code
    )
  );

  return created;
end;
$$;

create function public.reverse_treasury_movement(
  target_condominium uuid,
  target_movement uuid,
  reversal_reason text,
  request_key text
)
returns public.treasury_movements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  original public.treasury_movements;
  existing public.treasury_movements;
  created public.treasury_movements;
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;
  if char_length(trim(reversal_reason)) not between 2 and 500
    or char_length(trim(request_key)) not between 8 and 180 then
    raise exception 'invalid treasury reversal';
  end if;

  select * into original
  from public.treasury_movements m
  where m.id = target_movement
    and m.condominium_id = target_condominium
  for update;

  if original.id is null then raise exception 'treasury movement not found'; end if;
  if original.movement_kind in ('transfer_in', 'transfer_out', 'reversal') then
    raise exception 'movement requires a dedicated reversal flow';
  end if;

  select * into existing
  from public.treasury_movements m
  where m.reversal_of = original.id;
  if existing.id is not null then return existing; end if;

  insert into public.treasury_movements (
    condominium_id,
    account_id,
    direction,
    movement_kind,
    amount,
    currency_code,
    occurred_on,
    description,
    reference,
    source_type,
    source_id,
    reversal_of,
    idempotency_key,
    created_by
  ) values (
    original.condominium_id,
    original.account_id,
    case original.direction when 'credit' then 'debit'::public.treasury_movement_direction
      else 'credit'::public.treasury_movement_direction end,
    'reversal',
    original.amount,
    original.currency_code,
    current_date,
    'Reverso: ' || trim(reversal_reason),
    original.reference,
    'reversal',
    original.id,
    original.id,
    trim(request_key),
    auth.uid()
  ) returning * into created;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    created.condominium_id,
    'movement',
    created.id,
    'movement_reversed',
    auth.uid(),
    jsonb_build_object('reversal_of', original.id, 'reason', trim(reversal_reason))
  );

  return created;
end;
$$;

create function public.create_treasury_reconciliation(
  target_condominium uuid,
  target_account uuid,
  starts_on date,
  ends_on date,
  statement_opening numeric,
  statement_closing numeric,
  reconciliation_notes text default null
)
returns public.treasury_reconciliations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.treasury_reconciliations;
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;
  if starts_on is null or ends_on is null or ends_on < starts_on then
    raise exception 'invalid reconciliation period';
  end if;
  if not exists (
    select 1 from public.treasury_accounts a
    where a.id = target_account and a.condominium_id = target_condominium
  ) then
    raise exception 'treasury account not found';
  end if;

  insert into public.treasury_reconciliations (
    condominium_id,
    account_id,
    period_start,
    period_end,
    statement_opening_balance,
    statement_closing_balance,
    notes,
    created_by
  ) values (
    target_condominium,
    target_account,
    starts_on,
    ends_on,
    round(statement_opening, 2),
    round(statement_closing, 2),
    nullif(trim(reconciliation_notes), ''),
    auth.uid()
  ) returning * into created;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    created.condominium_id,
    'reconciliation',
    created.id,
    'reconciliation_created',
    auth.uid(),
    jsonb_build_object(
      'account_id', created.account_id,
      'period_start', created.period_start,
      'period_end', created.period_end
    )
  );

  return created;
end;
$$;

create function public.match_treasury_movement(
  target_condominium uuid,
  target_reconciliation uuid,
  target_movement uuid
)
returns public.treasury_reconciliation_items
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  reconciliation_record public.treasury_reconciliations;
  movement_record public.treasury_movements;
  created public.treasury_reconciliation_items;
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;

  select * into reconciliation_record
  from public.treasury_reconciliations r
  where r.id = target_reconciliation
    and r.condominium_id = target_condominium
  for update;
  if reconciliation_record.id is null then raise exception 'reconciliation not found'; end if;
  if reconciliation_record.status <> 'draft' then raise exception 'reconciliation is closed'; end if;

  select * into movement_record
  from public.treasury_movements m
  where m.id = target_movement
    and m.condominium_id = target_condominium;
  if movement_record.id is null
    or movement_record.account_id <> reconciliation_record.account_id
    or movement_record.occurred_on not between reconciliation_record.period_start
      and reconciliation_record.period_end then
    raise exception 'movement does not belong to reconciliation period';
  end if;

  insert into public.treasury_reconciliation_items (
    reconciliation_id, movement_id, condominium_id, matched_by
  ) values (
    reconciliation_record.id, movement_record.id, target_condominium, auth.uid()
  ) returning * into created;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    target_condominium,
    'reconciliation',
    reconciliation_record.id,
    'movement_matched',
    auth.uid(),
    jsonb_build_object('movement_id', movement_record.id)
  );

  return created;
end;
$$;

create function public.close_treasury_reconciliation(
  target_condominium uuid,
  target_reconciliation uuid
)
returns public.treasury_reconciliations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_record public.treasury_reconciliations;
  resolved_book_balance numeric(18, 2);
  closed_record public.treasury_reconciliations;
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;

  select * into current_record
  from public.treasury_reconciliations r
  where r.id = target_reconciliation
    and r.condominium_id = target_condominium
  for update;
  if current_record.id is null then raise exception 'reconciliation not found'; end if;
  if current_record.status = 'closed' then return current_record; end if;

  select coalesce(sum(
    case m.direction when 'credit' then m.amount else -m.amount end
  ), 0)::numeric(18, 2)
  into resolved_book_balance
  from public.treasury_movements m
  where m.account_id = current_record.account_id
    and m.occurred_on <= current_record.period_end;

  update public.treasury_reconciliations
  set status = 'closed',
      book_closing_balance = resolved_book_balance,
      difference = round(statement_closing_balance - resolved_book_balance, 2),
      closed_by = auth.uid(),
      closed_at = now()
  where id = current_record.id
  returning * into closed_record;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    closed_record.condominium_id,
    'reconciliation',
    closed_record.id,
    'reconciliation_closed',
    auth.uid(),
    jsonb_build_object(
      'book_closing_balance', closed_record.book_closing_balance,
      'statement_closing_balance', closed_record.statement_closing_balance,
      'difference', closed_record.difference
    )
  );

  return closed_record;
end;
$$;

create function public.get_treasury_accounts(target_condominium uuid)
returns table (
  id uuid,
  name text,
  account_type public.treasury_account_type,
  currency_code text,
  bank_name text,
  account_reference text,
  notes text,
  is_active boolean,
  balance numeric(18, 2),
  latest_movement_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.can_read_treasury(target_condominium) then
    raise exception 'treasury access denied';
  end if;

  return query
  select
    a.id,
    a.name,
    a.account_type,
    a.currency_code,
    a.bank_name,
    a.account_reference,
    a.notes,
    a.is_active,
    coalesce(sum(
      case m.direction when 'credit' then m.amount else -m.amount end
    ), 0)::numeric(18, 2) as balance,
    max(m.created_at) as latest_movement_at,
    a.created_at,
    a.updated_at
  from public.treasury_accounts a
  left join public.treasury_movements m on m.account_id = a.id
  where a.condominium_id = target_condominium
  group by a.id
  order by a.currency_code, a.name;
end;
$$;

revoke all on function public.create_treasury_account(
  uuid, text, public.treasury_account_type, text, text, text, text
) from public;
revoke all on function public.record_treasury_movement(
  uuid, uuid, public.treasury_movement_direction, public.treasury_movement_kind,
  numeric, date, text, text, public.treasury_source_type, uuid, text
) from public;
revoke all on function public.create_treasury_transfer(
  uuid, uuid, uuid, numeric, date, text, text, text
) from public;
revoke all on function public.reverse_treasury_movement(uuid, uuid, text, text) from public;
revoke all on function public.create_treasury_reconciliation(
  uuid, uuid, date, date, numeric, numeric, text
) from public;
revoke all on function public.match_treasury_movement(uuid, uuid, uuid) from public;
revoke all on function public.close_treasury_reconciliation(uuid, uuid) from public;
revoke all on function public.get_treasury_accounts(uuid) from public;

grant execute on function public.create_treasury_account(
  uuid, text, public.treasury_account_type, text, text, text, text
) to authenticated, service_role;
grant execute on function public.record_treasury_movement(
  uuid, uuid, public.treasury_movement_direction, public.treasury_movement_kind,
  numeric, date, text, text, public.treasury_source_type, uuid, text
) to authenticated, service_role;
grant execute on function public.create_treasury_transfer(
  uuid, uuid, uuid, numeric, date, text, text, text
) to authenticated, service_role;
grant execute on function public.reverse_treasury_movement(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.create_treasury_reconciliation(
  uuid, uuid, date, date, numeric, numeric, text
) to authenticated, service_role;
grant execute on function public.match_treasury_movement(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.close_treasury_reconciliation(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.get_treasury_accounts(uuid)
  to authenticated, service_role;

revoke all on public.treasury_accounts,
  public.treasury_transfers,
  public.treasury_movements,
  public.treasury_reconciliations,
  public.treasury_reconciliation_items,
  public.treasury_events from public, anon, authenticated;

grant select on public.treasury_accounts,
  public.treasury_transfers,
  public.treasury_movements,
  public.treasury_reconciliations,
  public.treasury_reconciliation_items,
  public.treasury_events to authenticated;

grant all on public.treasury_accounts,
  public.treasury_transfers,
  public.treasury_movements,
  public.treasury_reconciliations,
  public.treasury_reconciliation_items,
  public.treasury_events to service_role;
