-- HAB-127: expenses must never disappear from Treasury merely because a condominium
-- has more than one active account in the same currency. If the administrator has not
-- explicitly selected an account before marking the expense paid, route it to a clearly
-- labelled clearing account. The clearing balance makes the unresolved classification
-- visible and can be transferred to the real same-currency account later.

create or replace function public.hab127_resolve_expense_treasury_account(
  target_condominium uuid,
  target_currency text,
  requested_account uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  resolved uuid;
  candidates uuid[];
  actor uuid := auth.uid();
  clearing_name text := 'Pendiente de asignar ' || target_currency;
begin
  if requested_account is not null then
    return public.hab127_resolve_treasury_account(
      target_condominium,
      target_currency,
      requested_account
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_condominium::text || ':' || target_currency || ':hab127-expense', 0)
  );

  select array_agg(ta.id order by ta.id::text)
    into candidates
    from public.treasury_accounts ta
    where ta.condominium_id = target_condominium
      and ta.currency_code = target_currency
      and ta.is_active
      and ta.name <> clearing_name;

  if cardinality(coalesce(candidates, '{}'::uuid[])) = 1 then
    return candidates[1];
  end if;

  select ta.id
    into resolved
    from public.treasury_accounts ta
    where ta.condominium_id = target_condominium
      and ta.currency_code = target_currency
      and ta.is_active
      and ta.name = clearing_name
    limit 1;

  if resolved is not null then
    return resolved;
  end if;

  if actor is null then
    raise exception 'treasury account cannot be resolved without an authenticated actor';
  end if;

  insert into public.treasury_accounts(
    condominium_id,
    name,
    account_type,
    currency_code,
    notes,
    created_by
  ) values (
    target_condominium,
    clearing_name,
    'cash',
    target_currency,
    'Cuenta transitoria de HAB-127 para egresos sin cuenta de tesorería seleccionada. El saldo pendiente debe reclasificarse antes de conciliación.',
    actor
  )
  returning id into resolved;

  insert into public.treasury_events(
    condominium_id,
    entity_type,
    entity_id,
    event_type,
    actor_user_id,
    metadata
  ) values (
    target_condominium,
    'account',
    resolved,
    'created',
    actor,
    jsonb_build_object(
      'automatic', true,
      'reason', 'paid_expense_without_selected_treasury_account'
    )
  );

  return resolved;
end;
$$;

revoke all on function public.hab127_resolve_expense_treasury_account(uuid,text,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.hab127_prepare_expense_treasury()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.status is distinct from 'paid'::public.expense_status
     and new.status = 'paid'::public.expense_status then
    new.treasury_account_id := public.hab127_resolve_expense_treasury_account(
      new.condominium_id,
      new.currency_code,
      new.treasury_account_id
    );
  end if;
  return new;
end;
$$;

revoke all on function public.hab127_prepare_expense_treasury()
  from public, anon, authenticated, service_role;
