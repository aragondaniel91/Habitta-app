-- HAB-186 hardening: historical statement ownership windows and privacy-safe
-- public verification of issued solvency certificate metadata.

create or replace function public.get_unit_account_statement(
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
    select coalesce(
      jsonb_agg(
        jsonb_build_object('currency_code', currency_code, 'amount', balance)
        order by currency_code
      ),
      '[]'::jsonb
    )
    into opening
    from (
      select
        currency_code,
        round(sum(case direction when 'debit' then amount else -amount end), 2) as balance
      from public.receivable_ledger_entries
      where condominium_id = target
        and unit_id = target_unit
        and effective_date < period_from
      group by currency_code
      having sum(case direction when 'debit' then amount else -amount end) <> 0
    ) balances;
  end if;

  with ordered as (
    select
      le.*,
      round(
        sum(case le.direction when 'debit' then le.amount else -le.amount end)
          over (
            partition by le.currency_code
            order by le.effective_date, le.created_at, le.id
            rows between unbounded preceding and current row
          ),
        2
      ) as running_balance
    from public.receivable_ledger_entries le
    where le.condominium_id = target
      and le.unit_id = target_unit
      and le.effective_date <= period_to
  ), visible as (
    select * from ordered
    where period_from is null or effective_date >= period_from
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
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
      )
      order by effective_date, created_at, id
    ),
    '[]'::jsonb
  )
  into movements
  from visible;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('currency_code', currency_code, 'amount', balance)
      order by currency_code
    ),
    '[]'::jsonb
  )
  into closing
  from (
    select
      currency_code,
      round(sum(case direction when 'debit' then amount else -amount end), 2) as balance
    from public.receivable_ledger_entries
    where condominium_id = target
      and unit_id = target_unit
      and effective_date <= period_to
    group by currency_code
    having sum(case direction when 'debit' then amount else -amount end) <> 0
  ) balances;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'person_id', p.id,
        'name', trim(concat_ws(' ', p.first_name, p.last_name)),
        'ownership_percentage', o.ownership_percentage,
        'starts_at', o.starts_at,
        'ends_at', o.ends_at
      )
      order by o.starts_at, o.id
    ),
    '[]'::jsonb
  )
  into owners
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = target_unit
    and o.starts_at <= period_to
    and (
      o.ends_at is null
      or o.ends_at >= coalesce(period_from, period_to)
    );

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

create function public.verify_solvency_certificate(public_verification_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'found', true,
    'verification_id', sc.verification_id,
    'condominium_name', c.name,
    'unit_code', u.code,
    'as_of_date', sc.as_of_date,
    'valid_until', sc.valid_until,
    'issued_at', sc.issued_at,
    'within_validity_window', current_date <= sc.valid_until
  )
  from public.solvency_certificates sc
  join public.condominiums c on c.id = sc.condominium_id
  join public.units u on u.id = sc.unit_id and u.condominium_id = sc.condominium_id
  where sc.verification_id = public_verification_id;
$$;

revoke all on function public.verify_solvency_certificate(uuid) from public;
grant execute on function public.verify_solvency_certificate(uuid) to anon, authenticated, service_role;

-- Financial evidence cannot claim to have been observed in the future. A rate may
-- still have a future effective date because providers can publish it in advance.
create function public.guard_exchange_rate_observation_time()
returns trigger
language plpgsql
as $$
begin
  if new.rate_at > now() then
    raise exception 'exchange rate observation cannot be in the future';
  end if;
  return new;
end;
$$;

create trigger exchange_rate_observation_time_guard
before insert on public.condominium_exchange_rates
for each row execute function public.guard_exchange_rate_observation_time();

-- Solvency certificates are evidence of an evaluated ledger state and therefore
-- cannot be issued for a future accounting date.
create function public.guard_solvency_certificate_as_of_date()
returns trigger
language plpgsql
as $$
begin
  if new.as_of_date > current_date then
    raise exception 'solvency certificate date cannot be in the future';
  end if;
  return new;
end;
$$;

create trigger solvency_certificate_as_of_date_guard
before insert on public.solvency_certificates
for each row execute function public.guard_solvency_certificate_as_of_date();

revoke all on function public.guard_exchange_rate_observation_time()
  from public, anon, authenticated;
revoke all on function public.guard_solvency_certificate_as_of_date()
  from public, anon, authenticated;
