-- HAB-344: historical opening debit balances must age from their debt date rather than
-- appearing current merely because legacy imports stored due_date = null. New imports may
-- provide due_date explicitly; legacy opening balances fall back to issue_date/effective_date.
-- Ordinary non-opening charges with no due date retain their existing current/no-due semantics.

create or replace function public.preview_opening_balances(target uuid, rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  valid jsonb := '[]';
  errors jsonb := '[]';
  row_data jsonb;
  resolved jsonb;
  n int := 1;
  issue text;
  seen text[] := '{}';
  row_key text;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  for row_data in select value from jsonb_array_elements(rows) loop
    n := n + 1;
    resolved := public.resolve_opening_balance_unit(target, row_data);
    issue := resolved ->> 'error';

    if issue is null and row_data ->> 'balance_type' not in ('debit','credit') then
      issue := 'Invalid balance type';
    elsif issue is null and upper(row_data ->> 'currency_code') !~ '^[A-Z]{3}$' then
      issue := 'Invalid currency';
    elsif issue is null and (
      coalesce(row_data ->> 'amount','') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$'
      or (row_data ->> 'amount')::numeric <= 0
    ) then
      issue := 'Invalid amount';
    elsif issue is null then
      begin
        perform (row_data ->> 'effective_date')::date;
      exception when others then
        issue := 'Invalid effective date';
      end;
    end if;

    if issue is null
      and nullif(btrim(coalesce(row_data ->> 'due_date','')), '') is not null
      and nullif(btrim(coalesce(row_data ->> 'debt_date','')), '') is not null
      and btrim(row_data ->> 'due_date') <> btrim(row_data ->> 'debt_date') then
      issue := 'Conflicting debt dates';
    end if;

    if issue is null and coalesce(
      nullif(btrim(coalesce(row_data ->> 'due_date','')), ''),
      nullif(btrim(coalesce(row_data ->> 'debt_date','')), '')
    ) is not null then
      begin
        perform coalesce(
          nullif(btrim(coalesce(row_data ->> 'due_date','')), ''),
          nullif(btrim(coalesce(row_data ->> 'debt_date','')), '')
        )::date;
      exception when others then
        issue := 'Invalid due date';
      end;
    end if;

    row_key := concat_ws(
      ':',
      resolved ->> 'unit_id',
      row_data ->> 'balance_type',
      upper(row_data ->> 'currency_code')
    );
    if issue is null and row_key = any(seen) then
      issue := 'Duplicate row';
    end if;

    if issue is null then
      seen := array_append(seen, row_key);
      valid := valid || jsonb_build_array(
        row_data || jsonb_build_object(
          'unit_id', resolved ->> 'unit_id',
          'unit_code', resolved ->> 'unit_code',
          'currency_code', upper(row_data ->> 'currency_code')
        )
      );
    else
      errors := errors || jsonb_build_array(jsonb_build_object('row', n, 'error', issue));
    end if;
  end loop;

  return jsonb_build_object('valid', valid, 'errors', errors);
end;
$$;

create or replace function public.import_opening_balances(
  target uuid,
  rows jsonb,
  key text,
  import_filename text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  row_data jsonb;
  item public.receivable_items;
  result_payload jsonb;
  existing jsonb;
  metadata jsonb;
  item_due date;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target::text || ':' || key, 0));
  select result into existing
  from public.opening_balance_imports
  where condominium_id = target and idempotency_key = key;
  if found then return existing; end if;

  metadata := public.preview_opening_balances(target, rows);
  if jsonb_array_length(metadata -> 'errors') > 0
    or jsonb_array_length(metadata -> 'valid') <> jsonb_array_length(rows) then
    raise exception 'invalid opening balances';
  end if;

  for row_data in select value from jsonb_array_elements(metadata -> 'valid') loop
    item_due := coalesce(
      nullif(btrim(coalesce(row_data ->> 'due_date','')), ''),
      nullif(btrim(coalesce(row_data ->> 'debt_date','')), '')
    )::date;

    if row_data ->> 'balance_type' = 'debit' then
      item := public.insert_receivable_item_and_entry(
        target,
        (row_data ->> 'unit_id')::uuid,
        null,
        null,
        'opening_balance',
        'opening_debit',
        'debit',
        coalesce(nullif(row_data ->> 'description',''), 'Opening balance'),
        (row_data ->> 'amount')::numeric,
        upper(row_data ->> 'currency_code'),
        (row_data ->> 'effective_date')::date,
        item_due
      );
    else
      insert into public.receivable_ledger_entries(
        condominium_id, unit_id, entry_type, direction, amount, currency_code,
        effective_date, description, created_by
      ) values (
        target,
        (row_data ->> 'unit_id')::uuid,
        'opening_credit',
        'credit',
        (row_data ->> 'amount')::numeric,
        upper(row_data ->> 'currency_code'),
        (row_data ->> 'effective_date')::date,
        coalesce(nullif(row_data ->> 'description',''), 'Opening balance'),
        auth.uid()
      );
    end if;
  end loop;

  result_payload := jsonb_build_object('created', jsonb_array_length(rows));
  insert into public.opening_balance_imports(
    condominium_id, idempotency_key, filename, currency_codes,
    effective_date_min, effective_date_max, result, created_by
  )
  select
    target,
    key,
    import_filename,
    array_agg(distinct upper(x ->> 'currency_code')),
    min((x ->> 'effective_date')::date),
    max((x ->> 'effective_date')::date),
    result_payload,
    auth.uid()
  from jsonb_array_elements(metadata -> 'valid') x;

  return result_payload;
end;
$$;

create or replace function public.get_receivables_aging(target uuid)
returns table(
  currency_code text,
  current_amount text,
  days_1_30 text,
  days_31_60 text,
  days_61_90 text,
  over_90 text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with visible as (
    select
      b.*,
      i.item_type,
      case
        when b.due_date is not null then b.due_date
        when i.item_type = 'opening_balance' then b.issue_date
        else null
      end as aging_date
    from public.receivable_balances b
    join public.receivable_items i on i.id = b.id
    where b.condominium_id = target
      and b.status not in ('settled','reversed')
      and (
        public.can_read_board_aggregates(target)
        or public.can_read_financial_unit(b.unit_id)
      )
  )
  select v.currency_code,
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where v.aging_date is null or v.aging_date >= current_date),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date between 1 and 30),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date between 31 and 60),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date between 61 and 90),0),
      'FM999999999999990.00'),
    to_char(coalesce(sum(v.outstanding_amount::numeric)
      filter(where current_date - v.aging_date > 90),0),
      'FM999999999999990.00')
  from visible v
  group by v.currency_code
$$;

revoke all on function public.preview_opening_balances(uuid,jsonb),
  public.import_opening_balances(uuid,jsonb,text,text),
  public.get_receivables_aging(uuid) from public;
grant execute on function public.preview_opening_balances(uuid,jsonb),
  public.import_opening_balances(uuid,jsonb,text,text),
  public.get_receivables_aging(uuid) to authenticated, service_role;
