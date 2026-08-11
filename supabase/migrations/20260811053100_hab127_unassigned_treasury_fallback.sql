-- HAB-127 compatibility/safety fallback.
--
-- A condominium that has never configured Treasury must not keep producing financial
-- transactions outside the treasury ledger. In that case Habitta creates one clearly
-- labelled unassigned clearing account for the transaction currency. This preserves
-- total cash-flow integrity without pretending to know the resident's real bank account.
-- If more than one active account exists for a currency, the system refuses to guess.

create or replace function public.hab127_resolve_treasury_account(
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
  generated_name text := 'Pendiente de asignar ' || target_currency;
begin
  if requested_account is not null then
    select ta.id
      into resolved
      from public.treasury_accounts ta
      where ta.id = requested_account
        and ta.condominium_id = target_condominium
        and ta.currency_code = target_currency
        and ta.is_active;

    if resolved is null then
      raise exception 'invalid treasury account for financial transaction';
    end if;

    return resolved;
  end if;

  -- Serializes first-use account creation for a condominium/currency pair.
  perform pg_advisory_xact_lock(
    hashtextextended(target_condominium::text || ':' || target_currency || ':hab127-treasury', 0)
  );

  select array_agg(ta.id order by ta.id::text)
    into candidates
    from public.treasury_accounts ta
    where ta.condominium_id = target_condominium
      and ta.currency_code = target_currency
      and ta.is_active;

  if candidates is null or cardinality(candidates) = 0 then
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
      generated_name,
      'cash',
      target_currency,
      'Cuenta transitoria creada automáticamente por HAB-127. Asigna o reclasifica los movimientos a la cuenta real antes de conciliación.',
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
      jsonb_build_object('automatic', true, 'reason', 'financial_transaction_without_configured_treasury_account')
    );

    return resolved;
  end if;

  if cardinality(candidates) > 1 then
    raise exception 'treasury account selection is required for currency %', target_currency;
  end if;

  return candidates[1];
end;
$$;

revoke all on function public.hab127_resolve_treasury_account(uuid,text,uuid) from public, anon, authenticated, service_role;
