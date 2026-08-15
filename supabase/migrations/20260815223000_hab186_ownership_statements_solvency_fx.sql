-- HAB-186: property ownership lifecycle, authoritative unit statements,
-- solvency metadata and provider-neutral exchange-rate policy.

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

create table public.condominium_currency_policies (
  condominium_id uuid primary key references public.condominiums(id) on delete cascade,
  accounting_currency_code text not null check(accounting_currency_code ~ '^[A-Z]{3}$'),
  accepted_currency_codes text[] not null,
  conversion_mode text not null default 'disabled'
    check(conversion_mode in ('disabled', 'approved_rates_only')),
  default_rate_source text,
  max_rate_age_days smallint not null default 7 check(max_rate_age_days between 0 and 31),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  check(cardinality(accepted_currency_codes) > 0),
  check(accounting_currency_code = any(accepted_currency_codes)),
  check(not exists (
    select 1 from unnest(accepted_currency_codes) code where code !~ '^[A-Z]{3}$'
  ))
);

create table public.condominium_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  from_currency_code text not null check(from_currency_code ~ '^[A-Z]{3}$'),
  to_currency_code text not null check(to_currency_code ~ '^[A-Z]{3}$'),
  rate numeric(24,10) not null check(rate > 0),
  effective_on date not null,
  rate_at timestamptz not null,
  source text not null check(length(trim(source)) > 0),
  source_reference text,
  status text not null default 'approved' check(status in ('approved', 'superseded')),
  created_by uuid not null references auth.users(id),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(id, condominium_id),
  unique(condominium_id, from_currency_code, to_currency_code, effective_on, source),
  check(from_currency_code <> to_currency_code)
);

alter table public.payment_allocations
  add column exchange_rate_id uuid,
  add constraint payment_allocations_exchange_rate_fkey
    foreign key(exchange_rate_id, condominium_id)
    references public.condominium_exchange_rates(id, condominium_id);

create table public.condominium_solvency_policies (
  condominium_id uuid primary key references public.condominiums(id) on delete cascade,
  balance_basis text not null default 'outstanding'
    check(balance_basis in ('outstanding', 'overdue')),
  grace_days smallint not null default 0 check(grace_days between 0 and 365),
  tolerance_per_currency numeric(18,2) not null default 0 check(tolerance_per_currency >= 0),
  certificate_validity_days smallint not null default 30
    check(certificate_validity_days between 1 and 365),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.solvency_certificates (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null default gen_random_uuid() unique,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  unit_id uuid not null,
  as_of_date date not null,
  valid_until date not null,
  criteria_snapshot jsonb not null,
  balance_snapshot jsonb not null,
  owner_snapshot jsonb not null,
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  unique(id, condominium_id),
  foreign key(unit_id, condominium_id) references public.units(id, condominium_id),
  check(valid_until >= as_of_date),
  check(jsonb_typeof(criteria_snapshot) = 'object'),
  check(jsonb_typeof(balance_snapshot) = 'array'),
  check(jsonb_typeof(owner_snapshot) = 'array')
);

create index solvency_certificates_unit_history
  on public.solvency_certificates(unit_id, issued_at desc);

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

create function public.protect_solvency_certificate_history()
returns trigger
language plpgsql
as $$
begin
  raise exception 'solvency certificates are immutable';
end;
$$;

create trigger solvency_certificates_immutable
before update or delete on public.solvency_certificates
for each row execute function public.protect_solvency_certificate_history();

create function public.protect_exchange_rate_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'exchange rates are immutable';
  end if;
  if new.status = old.status then
    raise exception 'exchange rate snapshots are immutable';
  end if;
  if old.status <> 'approved' or new.status <> 'superseded' then
    raise exception 'invalid exchange rate transition';
  end if;
  if (new.condominium_id, new.from_currency_code, new.to_currency_code, new.rate,
      new.effective_on, new.rate_at, new.source, new.source_reference,
      new.created_by, new.approved_by, new.approved_at, new.created_at)
     is distinct from
     (old.condominium_id, old.from_currency_code, old.to_currency_code, old.rate,
      old.effective_on, old.rate_at, old.source, old.source_reference,
      old.created_by, old.approved_by, old.approved_at, old.created_at) then
    raise exception 'exchange rate snapshots are immutable';
  end if;
  return new;
end;
$$;

create trigger exchange_rates_immutable
before update or delete on public.condominium_exchange_rates
for each row execute function public.protect_exchange_rate_history();

create function public.guard_unit_owner_history()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if current_setting('habitta.ownership_transfer', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

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
    if old.ends_at is distinct from new.ends_at then
      raise exception 'active ownership must be closed through a formal transfer';
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.unit_owners o
    where o.unit_id = new.unit_id and o.ends_at is null
  ) then
    raise exception 'ownership changes require a formal transfer';
  end if;
  return new;
end;
$$;

create trigger unit_owner_history_guard
before insert or update or delete on public.unit_owners
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
      percentage_value := (owner_row->>'ownership_percentage')::numeric;
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
    'document_type', p.document_type,
    'document_number', p.document_number,
    'ownership_percentage', o.ownership_percentage,
    'is_primary_contact', o.is_primary_contact,
    'starts_at', o.starts_at,
    'ends_at', o.ends_at
  ) order by o.starts_at, o.id), '[]'::jsonb)
  into previous_snapshot
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = target_unit and o.ends_at is null;

  perform set_config('habitta.ownership_transfer', 'on', true);
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

create function public.configure_condominium_currency_policy(
  target uuid,
  accounting_currency text,
  accepted_currencies text[],
  conversion_policy text,
  default_source text default null,
  rate_age_days smallint default 7
)
returns public.condominium_currency_policies
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  policy public.condominium_currency_policies;
  normalized text[];
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;
  select array_agg(distinct upper(trim(value)) order by upper(trim(value)))
  into normalized from unnest(accepted_currencies) value;
  if upper(accounting_currency) !~ '^[A-Z]{3}$'
    or normalized is null
    or exists(select 1 from unnest(normalized) value where value !~ '^[A-Z]{3}$')
    or not upper(accounting_currency) = any(normalized)
    or conversion_policy not in ('disabled', 'approved_rates_only')
    or rate_age_days not between 0 and 31
  then
    raise exception 'invalid currency policy';
  end if;

  insert into public.condominium_currency_policies(
    condominium_id, accounting_currency_code, accepted_currency_codes,
    conversion_mode, default_rate_source, max_rate_age_days, updated_by
  ) values (
    target, upper(accounting_currency), normalized,
    conversion_policy, nullif(trim(default_source), ''), rate_age_days, auth.uid()
  )
  on conflict(condominium_id) do update set
    accounting_currency_code = excluded.accounting_currency_code,
    accepted_currency_codes = excluded.accepted_currency_codes,
    conversion_mode = excluded.conversion_mode,
    default_rate_source = excluded.default_rate_source,
    max_rate_age_days = excluded.max_rate_age_days,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into policy;
  return policy;
end;
$$;

create function public.record_approved_exchange_rate(
  target uuid,
  from_currency text,
  to_currency text,
  rate_value numeric,
  rate_effective_on date,
  observed_at timestamptz,
  rate_source text,
  source_ref text default null
)
returns public.condominium_exchange_rates
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  policy public.condominium_currency_policies;
  created public.condominium_exchange_rates;
  from_code text := upper(from_currency);
  to_code text := upper(to_currency);
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;
  select * into policy from public.condominium_currency_policies where condominium_id = target;
  if policy.condominium_id is null or policy.conversion_mode <> 'approved_rates_only' then
    raise exception 'approved exchange rates are not enabled';
  end if;
  if from_code = to_code or from_code !~ '^[A-Z]{3}$' or to_code !~ '^[A-Z]{3}$'
    or not from_code = any(policy.accepted_currency_codes)
    or not to_code = any(policy.accepted_currency_codes)
    or rate_value <= 0 or rate_effective_on is null or observed_at is null
    or coalesce(trim(rate_source), '') = ''
  then
    raise exception 'invalid exchange rate';
  end if;

  update public.condominium_exchange_rates
  set status = 'superseded'
  where condominium_id = target
    and from_currency_code = from_code
    and to_currency_code = to_code
    and effective_on = rate_effective_on
    and source = trim(rate_source)
    and status = 'approved';

  insert into public.condominium_exchange_rates(
    condominium_id, from_currency_code, to_currency_code, rate,
    effective_on, rate_at, source, source_reference,
    created_by, approved_by
  ) values (
    target, from_code, to_code, rate_value,
    rate_effective_on, observed_at, trim(rate_source), nullif(trim(source_ref), ''),
    auth.uid(), auth.uid()
  ) returning * into created;
  return created;
end;
$$;

create function public.enforce_approved_payment_exchange_rate()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  policy public.condominium_currency_policies;
  approved public.condominium_exchange_rates;
  payment_row public.payments;
begin
  if new.payment_currency_code = new.receivable_currency_code then
    new.exchange_rate_id := null;
    return new;
  end if;

  select * into policy from public.condominium_currency_policies
  where condominium_id = new.condominium_id;
  if policy.condominium_id is null or policy.conversion_mode <> 'approved_rates_only' then
    raise exception 'cross-currency allocation requires approved-rate policy';
  end if;
  if not new.payment_currency_code = any(policy.accepted_currency_codes)
    or not new.receivable_currency_code = any(policy.accepted_currency_codes)
  then
    raise exception 'allocation currency is not accepted by condominium policy';
  end if;

  select * into payment_row from public.payments where id = new.payment_id;
  select * into approved
  from public.condominium_exchange_rates r
  where r.condominium_id = new.condominium_id
    and r.from_currency_code = new.payment_currency_code
    and r.to_currency_code = new.receivable_currency_code
    and r.status = 'approved'
    and r.rate = new.receivable_per_payment_rate
    and r.source = coalesce(new.fx_rate_source, '')
    and r.rate_at = new.fx_rate_at
    and r.effective_on <= payment_row.payment_date
    and payment_row.payment_date - r.effective_on <= policy.max_rate_age_days
    and (new.exchange_rate_id is null or r.id = new.exchange_rate_id)
  order by r.effective_on desc, r.created_at desc
  limit 1;

  if approved.id is null then
    raise exception 'cross-currency allocation must use an approved exchange-rate snapshot';
  end if;

  new.exchange_rate_id := approved.id;
  new.receivable_per_payment_rate := approved.rate;
  new.fx_rate_source := approved.source;
  new.fx_rate_at := approved.rate_at;
  return new;
end;
$$;

create trigger payment_allocation_exchange_rate_guard
before insert on public.payment_allocations
for each row execute function public.enforce_approved_payment_exchange_rate();

create function public.configure_solvency_policy(
  target uuid,
  basis text default 'outstanding',
  grace_period_days smallint default 0,
  tolerance numeric default 0,
  validity_days smallint default 30
)
returns public.condominium_solvency_policies
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  policy public.condominium_solvency_policies;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;
  if basis not in ('outstanding', 'overdue')
    or grace_period_days not between 0 and 365
    or tolerance < 0 or tolerance <> round(tolerance, 2)
    or validity_days not between 1 and 365
  then
    raise exception 'invalid solvency policy';
  end if;

  insert into public.condominium_solvency_policies(
    condominium_id, balance_basis, grace_days, tolerance_per_currency,
    certificate_validity_days, updated_by
  ) values (
    target, basis, grace_period_days, tolerance, validity_days, auth.uid()
  )
  on conflict(condominium_id) do update set
    balance_basis = excluded.balance_basis,
    grace_days = excluded.grace_days,
    tolerance_per_currency = excluded.tolerance_per_currency,
    certificate_validity_days = excluded.certificate_validity_days,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into policy;
  return policy;
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
  result jsonb;
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

  result := jsonb_build_object(
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
  return result;
end;
$$;

create function public.evaluate_unit_solvency(
  target uuid,
  target_unit uuid,
  evaluated_on date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  policy public.condominium_solvency_policies;
  balances jsonb;
  violating_count integer;
begin
  if auth.uid() is null or not public.can_read_financial_unit(target_unit) then
    raise exception 'permission denied';
  end if;
  if not exists(select 1 from public.units where id = target_unit and condominium_id = target) then
    raise exception 'unit not found in condominium';
  end if;

  select * into policy from public.condominium_solvency_policies where condominium_id = target;
  if policy.condominium_id is null then
    policy.condominium_id := target;
    policy.balance_basis := 'outstanding';
    policy.grace_days := 0;
    policy.tolerance_per_currency := 0;
    policy.certificate_validity_days := 30;
  end if;

  if policy.balance_basis = 'outstanding' then
    with grouped as (
      select currency_code,
        round(sum(case direction when 'debit' then amount else -amount end), 2) amount
      from public.receivable_ledger_entries
      where condominium_id = target and unit_id = target_unit
        and effective_date <= evaluated_on
      group by currency_code
    )
    select
      coalesce(jsonb_agg(jsonb_build_object('currency_code', currency_code, 'amount', amount)
        order by currency_code), '[]'::jsonb),
      count(*) filter(where amount > policy.tolerance_per_currency)
    into balances, violating_count
    from grouped;
  else
    with item_balances as (
      select ri.currency_code,
        round(sum(case le.direction when 'debit' then le.amount else -le.amount end), 2) amount
      from public.receivable_items ri
      join public.receivable_ledger_entries le on le.receivable_item_id = ri.id
      where ri.condominium_id = target and ri.unit_id = target_unit
        and ri.lifecycle_status = 'active'
        and ri.due_date is not null
        and ri.due_date + policy.grace_days < evaluated_on
        and le.effective_date <= evaluated_on
      group by ri.id, ri.currency_code
      having sum(case le.direction when 'debit' then le.amount else -le.amount end) > 0
    ), grouped as (
      select currency_code, round(sum(amount), 2) amount
      from item_balances group by currency_code
    )
    select
      coalesce(jsonb_agg(jsonb_build_object('currency_code', currency_code, 'amount', amount)
        order by currency_code), '[]'::jsonb),
      count(*) filter(where amount > policy.tolerance_per_currency)
    into balances, violating_count
    from grouped;
  end if;

  return jsonb_build_object(
    'eligible', coalesce(violating_count, 0) = 0,
    'as_of_date', evaluated_on,
    'balances', coalesce(balances, '[]'::jsonb),
    'policy', jsonb_build_object(
      'balance_basis', policy.balance_basis,
      'grace_days', policy.grace_days,
      'tolerance_per_currency', policy.tolerance_per_currency,
      'certificate_validity_days', policy.certificate_validity_days
    )
  );
end;
$$;

create function public.issue_solvency_certificate(
  target uuid,
  target_unit uuid,
  evaluated_on date default current_date
)
returns public.solvency_certificates
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  evaluation jsonb;
  policy public.condominium_solvency_policies;
  owners jsonb;
  created public.solvency_certificates;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;
  if not exists(select 1 from public.units where id = target_unit and condominium_id = target) then
    raise exception 'unit not found in condominium';
  end if;

  evaluation := public.evaluate_unit_solvency(target, target_unit, evaluated_on);
  if not coalesce((evaluation->>'eligible')::boolean, false) then
    raise exception 'unit is not solvent under current policy';
  end if;

  select * into policy from public.condominium_solvency_policies where condominium_id = target;
  if policy.condominium_id is null then
    policy.certificate_validity_days := 30;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', p.id,
    'name', trim(concat_ws(' ', p.first_name, p.last_name)),
    'document_type', p.document_type,
    'document_number', p.document_number,
    'ownership_percentage', o.ownership_percentage
  ) order by o.id), '[]'::jsonb)
  into owners
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = target_unit and o.ends_at is null;

  insert into public.solvency_certificates(
    condominium_id, unit_id, as_of_date, valid_until,
    criteria_snapshot, balance_snapshot, owner_snapshot, issued_by
  ) values (
    target, target_unit, evaluated_on,
    evaluated_on + coalesce(policy.certificate_validity_days, 30),
    evaluation->'policy', evaluation->'balances', owners, auth.uid()
  ) returning * into created;
  return created;
end;
$$;

alter table public.ownership_transfers enable row level security;
alter table public.condominium_currency_policies enable row level security;
alter table public.condominium_exchange_rates enable row level security;
alter table public.condominium_solvency_policies enable row level security;
alter table public.solvency_certificates enable row level security;

create policy ownership_transfers_read on public.ownership_transfers
for select using(public.can_manage_people(condominium_id));
create policy currency_policy_read on public.condominium_currency_policies
for select using(public.can_read_receivables(condominium_id));
create policy exchange_rates_read on public.condominium_exchange_rates
for select using(public.can_read_receivables(condominium_id));
create policy solvency_policy_read on public.condominium_solvency_policies
for select using(public.can_read_receivables(condominium_id));
create policy solvency_certificates_read on public.solvency_certificates
for select using(public.can_read_financial_unit(unit_id));

revoke insert, update, delete on
  public.ownership_transfers,
  public.condominium_currency_policies,
  public.condominium_exchange_rates,
  public.condominium_solvency_policies,
  public.solvency_certificates
from authenticated;

grant select on
  public.ownership_transfers,
  public.condominium_currency_policies,
  public.condominium_exchange_rates,
  public.condominium_solvency_policies,
  public.solvency_certificates
 to authenticated;

revoke all on function public.protect_ownership_transfer_history() from public, anon, authenticated;
revoke all on function public.protect_solvency_certificate_history() from public, anon, authenticated;
revoke all on function public.protect_exchange_rate_history() from public, anon, authenticated;
revoke all on function public.guard_unit_owner_history() from public, anon, authenticated;
revoke all on function public.enforce_approved_payment_exchange_rate() from public, anon, authenticated;

revoke all on function public.transfer_unit_ownership(uuid, uuid, date, jsonb, text, text) from public;
revoke all on function public.configure_condominium_currency_policy(uuid, text, text[], text, text, smallint) from public;
revoke all on function public.record_approved_exchange_rate(uuid, text, text, numeric, date, timestamptz, text, text) from public;
revoke all on function public.configure_solvency_policy(uuid, text, smallint, numeric, smallint) from public;
revoke all on function public.get_unit_account_statement(uuid, uuid, date, date) from public;
revoke all on function public.evaluate_unit_solvency(uuid, uuid, date) from public;
revoke all on function public.issue_solvency_certificate(uuid, uuid, date) from public;

grant execute on function public.transfer_unit_ownership(uuid, uuid, date, jsonb, text, text) to authenticated, service_role;
grant execute on function public.configure_condominium_currency_policy(uuid, text, text[], text, text, smallint) to authenticated, service_role;
grant execute on function public.record_approved_exchange_rate(uuid, text, text, numeric, date, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.configure_solvency_policy(uuid, text, smallint, numeric, smallint) to authenticated, service_role;
grant execute on function public.get_unit_account_statement(uuid, uuid, date, date) to authenticated, service_role;
grant execute on function public.evaluate_unit_solvency(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.issue_solvency_certificate(uuid, uuid, date) to authenticated, service_role;
