-- HAB-186 part 1: formal ownership transfer and authoritative unit statements.

create table public.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  unit_id uuid not null,
  effective_date date not null,
  previous_owners_snapshot jsonb not null default '[]'::jsonb,
  new_owners_snapshot jsonb not null,
  supporting_document_reference text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id, condominium_id),
  foreign key(unit_id, condominium_id) references public.units(id, condominium_id),
  check(jsonb_typeof(previous_owners_snapshot) = 'array'),
  check(jsonb_typeof(new_owners_snapshot) = 'array'),
  check(jsonb_array_length(new_owners_snapshot) > 0)
);

create index ownership_transfers_unit_history
  on public.ownership_transfers(unit_id, effective_date desc, created_at desc);

-- Historical owner rows must not keep financial access after a transfer.
create or replace function public.can_read_financial_unit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_read_receivables(u.condominium_id)
    or exists (
      select 1
      from public.unit_owners o
      join public.people p on p.id = o.person_id
      where o.unit_id = target
        and o.ends_at is null
        and p.status = 'active'
        and p.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.unit_occupancies o
      join public.people p on p.id = o.person_id
      where o.unit_id = target
        and o.ends_at is null
        and p.status = 'active'
        and p.auth_user_id = auth.uid()
    )
  from public.units u
  where u.id = target
    and u.status = 'active';
$$;

revoke all on function public.can_read_financial_unit(uuid) from public;
grant execute on function public.can_read_financial_unit(uuid) to authenticated, service_role;

create function public.protect_ownership_transfer_history()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ownership transfers are immutable';
end;
$$;

create trigger ownership_transfers_immutable
before update or delete on public.ownership_transfers
for each row execute function public.protect_ownership_transfer_history();

-- Existing one-time assignment/close flows remain compatible, but an owner row can never
-- be deleted, reopened, or rewritten. The transfer RPC is the atomic path for a sale/change.
create function public.guard_unit_owner_history()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ownership history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if (new.unit_id, new.person_id, new.starts_at, new.ownership_percentage,
        new.is_primary_contact, new.created_by, new.created_at)
       is distinct from
       (old.unit_id, old.person_id, old.starts_at, old.ownership_percentage,
        old.is_primary_contact, old.created_by, old.created_at) then
      raise exception 'ownership history cannot be rewritten';
    end if;
    if old.ends_at is not null and new.ends_at is distinct from old.ends_at then
      raise exception 'closed ownership history cannot be changed';
    end if;
    if new.ends_at is not null and new.ends_at < old.starts_at then
      raise exception 'ownership end date cannot precede start date';
    end if;
  end if;
  return new;
end;
$$;

create trigger unit_owner_history_guard
before update or delete on public.unit_owners
for each row execute function public.guard_unit_owner_history();

create function public.transfer_unit_ownership(
  target uuid,
  target_unit uuid,
  effective_on date,
  new_owners jsonb,
  supporting_document text default null,
  transfer_notes text default null
)
returns public.ownership_transfers
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.ownership_transfers;
  previous_snapshot jsonb;
  next_snapshot jsonb;
  owner_row jsonb;
  owner_count integer;
  percentage_sum numeric(9,4) := 0;
  person_value uuid;
  percentage_value numeric(7,4);
  primary_value boolean;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target) then
    raise exception 'permission denied';
  end if;
  if effective_on is null or effective_on > current_date then
    raise exception 'transfer effective date must be today or earlier';
  end if;
  if jsonb_typeof(new_owners) <> 'array' or jsonb_array_length(new_owners) = 0 then
    raise exception 'at least one new owner is required';
  end if;
  if not exists (
    select 1 from public.units u
    where u.id = target_unit and u.condominium_id = target and u.status = 'active'
  ) then
    raise exception 'unit not found in condominium';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_unit::text, 0));

  if exists (
    select 1 from public.unit_owners o
    where o.unit_id = target_unit
      and o.ends_at is null
      and o.starts_at >= effective_on
  ) then
    raise exception 'transfer date must follow current ownership start date';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new_owners) item
    group by item->>'person_id'
    having count(*) > 1
  ) then
    raise exception 'duplicate new owner';
  end if;

  owner_count := jsonb_array_length(new_owners);
  for owner_row in select value from jsonb_array_elements(new_owners)
  loop
    begin
      person_value := (owner_row->>'person_id')::uuid;
    exception when others then
      raise exception 'invalid new owner';
    end;

    if not exists (
      select 1 from public.people p
      where p.id = person_value and p.condominium_id = target and p.status = 'active'
    ) then
      raise exception 'new owner not found in condominium';
    end if;

    if nullif(owner_row->>'ownership_percentage', '') is null then
      if owner_count = 1 then
        percentage_value := 100;
      else
        raise exception 'all co-owners require an ownership percentage';
      end if;
    else
      begin
        percentage_value := (owner_row->>'ownership_percentage')::numeric;
      exception when others then
        raise exception 'invalid ownership percentage';
      end;
    end if;

    if percentage_value <= 0 or percentage_value > 100 then
      raise exception 'invalid ownership percentage';
    end if;
    percentage_sum := percentage_sum + percentage_value;
  end loop;

  if round(percentage_sum, 4) <> 100.0000 then
    raise exception 'new ownership percentages must total 100';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'relationship_id', o.id,
    'person_id', p.id,
    'name', trim(concat_ws(' ', p.first_name, p.last_name)),
    'ownership_percentage', o.ownership_percentage,
    'is_primary_contact', o.is_primary_contact,
    'starts_at', o.starts_at,
    'ends_at', o.ends_at
  ) order by o.starts_at, o.id), '[]'::jsonb)
  into previous_snapshot
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = target_unit and o.ends_at is null;

  update public.unit_owners
  set ends_at = effective_on - 1
  where unit_id = target_unit and ends_at is null;

  for owner_row in select value from jsonb_array_elements(new_owners)
  loop
    person_value := (owner_row->>'person_id')::uuid;
    percentage_value := coalesce(nullif(owner_row->>'ownership_percentage', '')::numeric, 100);
    primary_value := coalesce((owner_row->>'is_primary_contact')::boolean, false);

    insert into public.unit_owners(
      unit_id, person_id, ownership_percentage, is_primary_contact,
      starts_at, created_by
    ) values (
      target_unit, person_value, percentage_value, primary_value,
      effective_on, auth.uid()
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'relationship_id', o.id,
    'person_id', p.id,
    'name', trim(concat_ws(' ', p.first_name, p.last_name)),
    'document_type', p.document_type,
    'document_number', p.document_number,
    'ownership_percentage', o.ownership_percentage,
    'is_primary_contact', o.is_primary_contact,
    'starts_at', o.starts_at,
    'ends_at', o.ends_at
  ) order by o.id), '[]'::jsonb)
  into next_snapshot
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = target_unit and o.ends_at is null;

  insert into public.ownership_transfers(
    condominium_id, unit_id, effective_date,
    previous_owners_snapshot, new_owners_snapshot,
    supporting_document_reference, notes, created_by
  ) values (
    target, target_unit, effective_on,
    previous_snapshot, next_snapshot,
    nullif(trim(supporting_document), ''), nullif(trim(transfer_notes), ''), auth.uid()
  ) returning * into created;

  return created;
end;
$$;

create function public.get_unit_account_statement(
  target uuid,
  target_unit uuid,
  period_from date default null,
  period_to date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  condo_name text;
  unit_code text;
  opening jsonb;
  closing jsonb;
  movements jsonb;
  owners jsonb;
begin
  if auth.uid() is null or not public.can_read_financial_unit(target_unit) then
    raise exception 'permission denied';
  end if;
  if period_to is null or (period_from is not null and period_from > period_to) then
    raise exception 'invalid statement period';
  end if;

  select c.name, u.code into condo_name, unit_code
  from public.units u
  join public.condominiums c on c.id = u.condominium_id
  where u.id = target_unit and u.condominium_id = target;
  if unit_code is null then
    raise exception 'unit not found in condominium';
  end if;

  if period_from is null then
    opening := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'currency_code', currency_code,
      'amount', balance
    ) order by currency_code), '[]'::jsonb)
    into opening
    from (
      select currency_code,
        round(sum(case direction when 'debit' then amount else -amount end), 2) balance
      from public.receivable_ledger_entries
      where condominium_id = target and unit_id = target_unit
        and effective_date < period_from
      group by currency_code
      having sum(case direction when 'debit' then amount else -amount end) <> 0
    ) balances;
  end if;

  with ordered as (
    select le.*,
      round(sum(case le.direction when 'debit' then le.amount else -le.amount end)
        over(partition by le.currency_code
          order by le.effective_date, le.created_at, le.id
          rows between unbounded preceding and current row), 2) as running_balance
    from public.receivable_ledger_entries le
    where le.condominium_id = target
      and le.unit_id = target_unit
      and le.effective_date <= period_to
  ), visible as (
    select * from ordered where period_from is null or effective_date >= period_from
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ledger_entry_id', id,
    'effective_date', effective_date,
    'description', description,
    'entry_type', entry_type,
    'debit', case when direction = 'debit' then amount else null end,
    'credit', case when direction = 'credit' then amount else null end,
    'running_balance', running_balance,
    'currency_code', currency_code,
    'receivable_item_id', receivable_item_id,
    'payment_id', payment_id,
    'payment_allocation_id', payment_allocation_id
  ) order by effective_date, created_at, id), '[]'::jsonb)
  into movements from visible;

  select coalesce(jsonb_agg(jsonb_build_object(
    'currency_code', currency_code,
    'amount', balance
  ) order by currency_code), '[]'::jsonb)
  into closing
  from (
    select currency_code,
      round(sum(case direction when 'debit' then amount else -amount end), 2) balance
    from public.receivable_ledger_entries
    where condominium_id = target and unit_id = target_unit
      and effective_date <= period_to
    group by currency_code
    having sum(case direction when 'debit' then amount else -amount end) <> 0
  ) balances;

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', p.id,
    'name', trim(concat_ws(' ', p.first_name, p.last_name)),
    'document_type', p.document_type,
    'document_number', p.document_number,
    'ownership_percentage', o.ownership_percentage,
    'starts_at', o.starts_at,
    'ends_at', o.ends_at
  ) order by o.starts_at, o.id), '[]'::jsonb)
  into owners
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = target_unit
    and o.starts_at <= period_to
    and (o.ends_at is null or o.ends_at >= coalesce(period_from, period_to));

  return jsonb_build_object(
    'account', jsonb_build_object(
      'condominium_id', target,
      'condominium_name', condo_name,
      'unit_id', target_unit,
      'unit_code', unit_code
    ),
    'period', jsonb_build_object('from', period_from, 'to', period_to),
    'owners', owners,
    'opening_balances', opening,
    'movements', movements,
    'closing_balances', closing
  );
end;
$$;

alter table public.ownership_transfers enable row level security;

create policy ownership_transfers_read on public.ownership_transfers
for select using(public.can_manage_people(condominium_id));

revoke insert, update, delete on public.ownership_transfers from authenticated;
grant select on public.ownership_transfers to authenticated;

revoke all on function public.protect_ownership_transfer_history() from public, anon, authenticated;
revoke all on function public.guard_unit_owner_history() from public, anon, authenticated;
revoke all on function public.transfer_unit_ownership(uuid, uuid, date, jsonb, text, text) from public;
revoke all on function public.get_unit_account_statement(uuid, uuid, date, date) from public;

grant execute on function public.transfer_unit_ownership(uuid, uuid, date, jsonb, text, text)
  to authenticated, service_role;
grant execute on function public.get_unit_account_statement(uuid, uuid, date, date)
  to authenticated, service_role;
