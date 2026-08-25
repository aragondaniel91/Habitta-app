-- HAB-341: late fees are a monthly policy. A source charge may receive at most one
-- late fee in a calendar month. `late_fee_charges.period` stores the first day of
-- the month for new rows; range checks also recognize legacy rows that stored the
-- exact generation date.

comment on column public.late_fee_charges.period is
  'Late-fee billing period. New rows store the first day of the calendar month.';

create or replace function public.preview_late_fees(
  target_condominium uuid,
  through_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  settings public.condominium_late_fee_settings;
  month_start date;
  month_end date;
  result jsonb;
begin
  if through_date is null then
    raise exception 'late fee generation date required';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or not public.can_manage_receivables(target_condominium)) then
    raise exception 'late fee generation denied';
  end if;

  month_start := date_trunc('month', through_date)::date;
  month_end := (month_start + interval '1 month')::date;

  select * into settings
  from public.condominium_late_fee_settings
  where condominium_id = target_condominium;

  if settings.condominium_id is null or not settings.enabled then
    return jsonb_build_object(
      'period', to_char(month_start, 'YYYY-MM'),
      'count', 0,
      'totals', '[]'::jsonb
    );
  end if;

  with candidates as (
    select
      rb.id as source_item_id,
      rb.currency_code,
      rb.outstanding_amount::numeric as outstanding_amount,
      rb.original_amount::numeric as original_amount,
      coalesce((
        select sum(lfc.fee_amount)
        from public.late_fee_charges lfc
        where lfc.source_item_id = rb.id
      ), 0)::numeric as already_charged
    from public.receivable_balances rb
    join public.receivable_items i on i.id = rb.id
    where rb.condominium_id = target_condominium
      and i.item_type = 'charge'
      and rb.status in ('open', 'partially_settled')
      and rb.due_date is not null
      and rb.due_date + settings.grace_period_days <= through_date
      and (settings.applies_to_foreign_currency or rb.currency_code = settings.local_currency_code)
      and not exists (
        select 1
        from public.late_fee_charges lfc
        where lfc.source_item_id = rb.id
          and lfc.period >= month_start
          and lfc.period < month_end
      )
  ), amounts as (
    select
      source_item_id,
      currency_code,
      case
        when settings.cap_percent is null then
          round(outstanding_amount * settings.rate_percent / 100, 2)
        else greatest(
          least(
            round(outstanding_amount * settings.rate_percent / 100, 2),
            round(original_amount * settings.cap_percent / 100, 2) - already_charged
          ),
          0
        )
      end as fee_amount
    from candidates
  ), chargeable as (
    select * from amounts where fee_amount > 0
  ), totals as (
    select currency_code, sum(fee_amount)::numeric(18,2) as amount
    from chargeable
    group by currency_code
    order by currency_code
  )
  select jsonb_build_object(
    'period', to_char(month_start, 'YYYY-MM'),
    'count', (select count(*) from chargeable),
    'totals', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'currencyCode', currency_code,
        'amount', to_char(amount, 'FM999999999999990.00')
      ) order by currency_code) from totals),
      '[]'::jsonb
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.preview_late_fees(uuid, date) from public;
grant execute on function public.preview_late_fees(uuid, date) to authenticated, service_role;

create or replace function public.apply_late_fees(
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
  settings public.condominium_late_fee_settings;
  b record;
  fee_amount numeric(18, 2);
  already_charged numeric(18, 2);
  cap_amount numeric(18, 2);
  new_item public.receivable_items;
  charged_count integer := 0;
  month_start date;
  month_end date;
begin
  if through_date is null then
    raise exception 'late fee generation date required';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or not public.can_manage_receivables(target_condominium)) then
    raise exception 'late fee generation denied';
  end if;

  month_start := date_trunc('month', through_date)::date;
  month_end := (month_start + interval '1 month')::date;

  -- Serialize generation for one condominium/month while allowing every other
  -- condominium and month to proceed independently.
  perform pg_advisory_xact_lock(
    hashtextextended(target_condominium::text || ':late-fees:' || month_start::text, 0)
  );

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
        where lfc.source_item_id = rb.id
          and lfc.period >= month_start
          and lfc.period < month_end
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
      format('Recargo por mora mensual (%s%%)', settings.rate_percent),
      fee_amount, b.currency_code, through_date, null
    );

    insert into public.late_fee_charges (
      condominium_id, unit_id, source_item_id, late_fee_item_id, period,
      rate_percent, outstanding_amount_at_charge, fee_amount, currency_code, created_by
    ) values (
      target_condominium, b.unit_id, b.id, new_item.id, month_start,
      settings.rate_percent, b.outstanding_amount, fee_amount, b.currency_code, auth.uid()
    );

    charged_count := charged_count + 1;
  end loop;

  return charged_count;
end;
$$;

revoke all on function public.apply_late_fees(uuid, date) from public;
grant execute on function public.apply_late_fees(uuid, date) to authenticated, service_role;
