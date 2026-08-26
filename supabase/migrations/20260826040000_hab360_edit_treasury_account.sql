-- HAB-360: a treasury account must be correctable and archivable.
--
-- `create_treasury_account` had no counterpart, so a bank account captured with the wrong name,
-- institution or reference stayed wrong forever and kept being offered for every future movement,
-- payment settlement and expense.
--
-- What is safe to change depends on whether the account already carries money:
--   * descriptive fields (name, institution, reference, notes) are always correctable;
--   * currency and account type are frozen once any movement exists, because reinterpreting them
--     would restate a balance that was already recorded and reconciled;
--   * archiving is refused while the account still holds a balance, so nothing is hidden with
--     money left in it.
--
-- The account is never deleted. `version` finally has a writer, and every correction lands in
-- `treasury_events` alongside the creation it corrects.

-- The audit trail already records account creation; correcting one is the same kind of fact and
-- needs its own verb rather than being logged as something it is not.
alter table public.treasury_events
  drop constraint if exists treasury_events_event_type_check;

alter table public.treasury_events
  add constraint treasury_events_event_type_check
  check (
    event_type in (
      'created',
      'updated',
      'movement_recorded',
      'movement_reversed',
      'transfer_recorded',
      'reconciliation_created',
      'movement_matched',
      'reconciliation_closed'
    )
  );

create or replace function public.update_treasury_account(
  target_condominium uuid,
  target_account uuid,
  account_name text,
  account_kind public.treasury_account_type,
  account_currency text,
  financial_institution text default null,
  reference_value text default null,
  account_notes text default null,
  account_active boolean default null
)
returns public.treasury_accounts
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_account public.treasury_accounts;
  updated_account public.treasury_accounts;
  normalized_currency text := upper(btrim(coalesce(account_currency, '')));
  next_name text := btrim(coalesce(account_name, ''));
  next_bank text := nullif(btrim(coalesce(financial_institution, '')), '');
  next_reference text := nullif(btrim(coalesce(reference_value, '')), '');
  next_notes text := nullif(btrim(coalesce(account_notes, '')), '');
  next_active boolean;
  movement_count bigint;
  account_balance numeric(18, 2);
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;

  select * into current_account
  from public.treasury_accounts
  where id = target_account
    and condominium_id = target_condominium
  for update;

  if current_account.id is null then
    raise exception 'treasury account unavailable';
  end if;

  next_active := coalesce(account_active, current_account.is_active);

  if char_length(next_name) not between 2 and 120
    or normalized_currency !~ '^[A-Z]{3}$'
    or (next_bank is not null and char_length(next_bank) not between 2 and 120)
    or (next_reference is not null and char_length(next_reference) not between 2 and 120)
    or (next_notes is not null and char_length(next_notes) > 1000)
  then
    raise exception 'invalid treasury account';
  end if;

  if account_kind = 'cash' and next_bank is not null then
    raise exception 'cash accounts cannot have a bank name';
  end if;

  select count(*),
    coalesce(sum(case m.direction when 'credit' then m.amount else -m.amount end), 0)
  into movement_count, account_balance
  from public.treasury_movements m
  where m.account_id = current_account.id
    and m.condominium_id = target_condominium;

  -- Reinterpreting the currency or the nature of an account that already moved money would
  -- restate a balance somebody already reconciled.
  if movement_count > 0
    and (normalized_currency <> current_account.currency_code
      or account_kind <> current_account.account_type)
  then
    raise exception 'treasury account has movements';
  end if;

  if not next_active and current_account.is_active and account_balance <> 0 then
    raise exception 'treasury account still holds a balance';
  end if;

  update public.treasury_accounts
  set name = next_name,
      account_type = account_kind,
      currency_code = normalized_currency,
      bank_name = next_bank,
      account_reference = next_reference,
      notes = next_notes,
      is_active = next_active,
      version = current_account.version + 1,
      updated_at = now()
  where id = current_account.id
  returning * into updated_account;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    updated_account.condominium_id,
    'account',
    updated_account.id,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'version', updated_account.version,
      'is_active', updated_account.is_active,
      'movement_count', movement_count
    )
  );

  return updated_account;
end;
$$;

revoke all on function public.update_treasury_account(
  uuid, uuid, text, public.treasury_account_type, text, text, text, text, boolean
) from public, anon;

grant execute on function public.update_treasury_account(
  uuid, uuid, text, public.treasury_account_type, text, text, text, text, boolean
) to authenticated;
