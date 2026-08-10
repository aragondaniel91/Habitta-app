-- Late fees ("recargos por mora") are configured per condominium, not hardcoded: this is a
-- multi-tenant SaaS and every condo's board sets its own rate, grace period, cap and whether the
-- policy reaches foreign-currency balances. Disabled by default on every condo - nobody's balance
-- changes until that condo's admin opts in and sets real numbers. Generation is an explicit,
-- admin-triggered action (mirrors generate_due_maintenance_work_orders), never a cron: this
-- database is currently shared between the dev and prod environments, so nothing here may run on
-- a schedule (see docs/PROJECT-DECISIONS.md).

create table public.condominium_late_fee_settings (
  condominium_id uuid primary key references public.condominiums(id),
  enabled boolean not null default false,
  rate_percent numeric(6, 3) not null default 0 check (rate_percent >= 0 and rate_percent <= 100),
  grace_period_days integer not null default 0
    check (grace_period_days >= 0 and grace_period_days <= 365),
  cap_percent numeric(6, 3) check (cap_percent is null or (cap_percent >= 0 and cap_percent <= 500)),
  local_currency_code text not null default 'VES' check (local_currency_code ~ '^[A-Z]{3}$'),
  applies_to_foreign_currency boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.condominium_late_fee_settings (condominium_id)
select id from public.condominiums
on conflict do nothing;

create function public.create_default_late_fee_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.condominium_late_fee_settings (condominium_id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger condominium_late_fee_settings_default
after insert on public.condominiums
for each row execute function public.create_default_late_fee_settings();

-- One row per (overdue item, generation run) so re-running the same period never double-charges.
create table public.late_fee_charges (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id),
  unit_id uuid not null,
  source_item_id uuid not null,
  late_fee_item_id uuid not null,
  period date not null,
  rate_percent numeric(6, 3) not null,
  outstanding_amount_at_charge numeric(18, 2) not null,
  fee_amount numeric(18, 2) not null check (fee_amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (source_item_id, period),
  foreign key (unit_id, condominium_id) references public.units (id, condominium_id),
  foreign key (late_fee_item_id, condominium_id, unit_id, currency_code)
    references public.receivable_items (id, condominium_id, unit_id, currency_code)
);

create function public.can_read_late_fee_settings(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_read_receivables(target)
    or exists (
      select 1
      from public.condominium_memberships
      where condominium_id = target
        and user_id = auth.uid()
        and role in ('owner', 'tenant')
    );
$$;

revoke all on function public.can_read_late_fee_settings(uuid) from public;
grant execute on function public.can_read_late_fee_settings(uuid) to authenticated, service_role;

alter table public.condominium_late_fee_settings enable row level security;
alter table public.late_fee_charges enable row level security;

create policy late_fee_settings_read on public.condominium_late_fee_settings
for select
using (public.can_read_late_fee_settings(condominium_id));

create policy late_fee_charges_read on public.late_fee_charges
for select
using (public.can_read_financial_unit(unit_id));

revoke all on public.condominium_late_fee_settings, public.late_fee_charges from anon, authenticated;
grant select on public.condominium_late_fee_settings, public.late_fee_charges to authenticated;

create function public.get_late_fee_settings(target_condominium uuid)
returns public.condominium_late_fee_settings
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  result public.condominium_late_fee_settings;
begin
  if not public.can_read_late_fee_settings(target_condominium) then
    raise exception 'permission denied';
  end if;
  select * into result
  from public.condominium_late_fee_settings
  where condominium_id = target_condominium;
  return result;
end;
$$;

create function public.update_late_fee_settings(
  target_condominium uuid,
  target_enabled boolean,
  target_rate_percent numeric,
  target_grace_period_days integer,
  target_cap_percent numeric,
  target_local_currency_code text,
  target_applies_to_foreign_currency boolean
)
returns public.condominium_late_fee_settings
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  result public.condominium_late_fee_settings;
begin
  if not public.can_manage_receivables(target_condominium) then
    raise exception 'permission denied';
  end if;
  update public.condominium_late_fee_settings
  set enabled = target_enabled,
      rate_percent = target_rate_percent,
      grace_period_days = target_grace_period_days,
      cap_percent = target_cap_percent,
      local_currency_code = target_local_currency_code,
      applies_to_foreign_currency = target_applies_to_foreign_currency,
      updated_at = now()
  where condominium_id = target_condominium
  returning * into result;
  if result.condominium_id is null then
    raise exception 'condominium not found';
  end if;
  return result;
end;
$$;

revoke all on function public.get_late_fee_settings(uuid) from public;
revoke all on function public.update_late_fee_settings(uuid, boolean, numeric, integer, numeric, text, boolean)
  from public;
grant execute on function public.get_late_fee_settings(uuid) to authenticated, service_role;
grant execute on function public.update_late_fee_settings(uuid, boolean, numeric, integer, numeric, text, boolean)
  to authenticated, service_role;

-- Explicit admin action, never a cron (see file header): charges at most one late fee per
-- overdue item per call, and only up to that condo's configured cap.
create function public.apply_late_fees(target_condominium uuid, through_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  settings public.condominium_late_fee_settings;
  b record;
  fee_amount numeric(18, 2);
  already_charged numeric(18, 2);
  cap_amount numeric(18, 2);
  new_item public.receivable_items;
  charged_count integer := 0;
begin
  if through_date is null then
    raise exception 'late fee generation date required';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or not public.can_manage_receivables(target_condominium)) then
    raise exception 'late fee generation denied';
  end if;

  select * into settings
  from public.condominium_late_fee_settings
  where condominium_id = target_condominium;

  if settings.condominium_id is null or not settings.enabled then
    return 0;
  end if;

  for b in
    select rb.id, rb.unit_id, rb.currency_code, rb.due_date,
      rb.outstanding_amount::numeric as outstanding_amount,
      rb.original_amount::numeric as original_amount
    from public.receivable_balances rb
    join public.receivable_items i on i.id = rb.id
    where rb.condominium_id = target_condominium
      and i.item_type = 'charge'
      and rb.status in ('open', 'partially_settled')
      and rb.due_date is not null
      and rb.due_date + settings.grace_period_days <= through_date
      and (settings.applies_to_foreign_currency or rb.currency_code = settings.local_currency_code)
      and not exists (
        select 1 from public.late_fee_charges lfc
        where lfc.source_item_id = rb.id and lfc.period = through_date
      )
    order by rb.unit_id, rb.due_date, rb.id
  loop
    fee_amount := round(b.outstanding_amount * settings.rate_percent / 100, 2);
    if fee_amount <= 0 then
      continue;
    end if;

    if settings.cap_percent is not null then
      select coalesce(sum(lfc.fee_amount), 0) into already_charged
      from public.late_fee_charges lfc
      where lfc.source_item_id = b.id;

      cap_amount := round(b.original_amount * settings.cap_percent / 100, 2);
      if already_charged >= cap_amount then
        continue;
      end if;
      if already_charged + fee_amount > cap_amount then
        fee_amount := cap_amount - already_charged;
      end if;
      if fee_amount <= 0 then
        continue;
      end if;
    end if;

    new_item := public.insert_receivable_item_and_entry(
      target_condominium, b.unit_id, null, null,
      'late_fee', 'late_fee_charge', 'debit',
      format('Recargo por mora (%s%%)', settings.rate_percent),
      fee_amount, b.currency_code, through_date, null
    );

    insert into public.late_fee_charges (
      condominium_id, unit_id, source_item_id, late_fee_item_id, period,
      rate_percent, outstanding_amount_at_charge, fee_amount, currency_code, created_by
    ) values (
      target_condominium, b.unit_id, b.id, new_item.id, through_date,
      settings.rate_percent, b.outstanding_amount, fee_amount, b.currency_code, auth.uid()
    );

    charged_count := charged_count + 1;
  end loop;

  return charged_count;
end;
$$;

revoke all on function public.apply_late_fees(uuid, date) from public;
grant execute on function public.apply_late_fees(uuid, date) to authenticated, service_role;
