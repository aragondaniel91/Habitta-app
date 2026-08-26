-- HAB-360: a treasury transfer needs the dedicated reversal flow the model already assumes.
--
-- `reverse_treasury_movement` refuses `transfer_in` / `transfer_out` with the message
-- "movement requires a dedicated reversal flow". That flow was never built, so a transfer sent to
-- the wrong account could not be undone: reversing one leg by hand was blocked, and there was no
-- operation that reversed both. The two sides could only be corrected by leaving them wrong.
--
-- The correction is additive, never an edit. `treasury_transfers` is append-only and stays
-- untouched; the reversal is a pair of `reversal` movements, one per account, each linked to the
-- leg it compensates through `reversal_of`. The table's own constraints force that shape:
--   * `movement_kind = 'reversal'` requires `reversal_of` and `source_type = 'reversal'`;
--   * a movement carrying `reversal_of` must have `transfer_id` null;
--   * `treasury_movements_reversal_unique` makes a second reversal of the same leg impossible.
--
-- Both legs are written in one statement, so an interrupted reversal can never leave one account
-- compensated and the other not.

create or replace function public.reverse_treasury_transfer(
  target_condominium uuid,
  target_transfer uuid,
  reversal_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  transfer_record public.treasury_transfers;
  outgoing_leg public.treasury_movements;
  incoming_leg public.treasury_movements;
  existing_reversal public.treasury_movements;
  source_account public.treasury_accounts;
  destination_account public.treasury_accounts;
  reversal_ids uuid[];
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;

  if char_length(btrim(coalesce(reversal_reason, ''))) not between 2 and 500 then
    raise exception 'invalid treasury reversal';
  end if;

  select * into transfer_record
  from public.treasury_transfers t
  where t.id = target_transfer
    and t.condominium_id = target_condominium
  for update;

  if transfer_record.id is null then
    raise exception 'treasury transfer not found';
  end if;

  select * into outgoing_leg
  from public.treasury_movements m
  where m.transfer_id = transfer_record.id
    and m.condominium_id = target_condominium
    and m.movement_kind = 'transfer_out'
  for update;

  select * into incoming_leg
  from public.treasury_movements m
  where m.transfer_id = transfer_record.id
    and m.condominium_id = target_condominium
    and m.movement_kind = 'transfer_in'
  for update;

  if outgoing_leg.id is null or incoming_leg.id is null then
    raise exception 'treasury transfer not found';
  end if;

  -- Reversing twice must be impossible, and asking twice must be harmless.
  select * into existing_reversal
  from public.treasury_movements m
  where m.reversal_of in (outgoing_leg.id, incoming_leg.id)
  limit 1;

  if existing_reversal.id is not null then
    return jsonb_build_object(
      'transfer_id', transfer_record.id,
      'already_reversed', true,
      'amount', to_char(transfer_record.amount, 'FM999999999999990.00'),
      'currency_code', transfer_record.currency_code
    );
  end if;

  select * into source_account
  from public.treasury_accounts a
  where a.id = transfer_record.from_account_id
    and a.condominium_id = target_condominium;
  select * into destination_account
  from public.treasury_accounts a
  where a.id = transfer_record.to_account_id
    and a.condominium_id = target_condominium;

  -- An archived account is settled at zero. Returning money to it, or taking money out of it,
  -- would break that promise silently.
  if not source_account.is_active or not destination_account.is_active then
    raise exception 'treasury account is inactive';
  end if;

  with reversed as (
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
    ) values
    (
      target_condominium,
      outgoing_leg.account_id,
      'credit',
      'reversal',
      outgoing_leg.amount,
      outgoing_leg.currency_code,
      current_date,
      'Reverso de transferencia: ' || btrim(reversal_reason),
      outgoing_leg.reference,
      'reversal',
      outgoing_leg.id,
      outgoing_leg.id,
      'transfer-reversal:' || transfer_record.id::text || ':out',
      auth.uid()
    ),
    (
      target_condominium,
      incoming_leg.account_id,
      'debit',
      'reversal',
      incoming_leg.amount,
      incoming_leg.currency_code,
      current_date,
      'Reverso de transferencia: ' || btrim(reversal_reason),
      incoming_leg.reference,
      'reversal',
      incoming_leg.id,
      incoming_leg.id,
      'transfer-reversal:' || transfer_record.id::text || ':in',
      auth.uid()
    )
    returning id
  )
  select array_agg(id) into reversal_ids from reversed;

  insert into public.treasury_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    target_condominium,
    'transfer',
    transfer_record.id,
    'movement_reversed',
    auth.uid(),
    jsonb_build_object(
      'reason', btrim(reversal_reason),
      'amount', to_char(transfer_record.amount, 'FM999999999999990.00'),
      'currency_code', transfer_record.currency_code,
      'reversal_movement_ids', to_jsonb(reversal_ids)
    )
  );

  return jsonb_build_object(
    'transfer_id', transfer_record.id,
    'already_reversed', false,
    'amount', to_char(transfer_record.amount, 'FM999999999999990.00'),
    'currency_code', transfer_record.currency_code,
    'reversal_movement_ids', to_jsonb(reversal_ids)
  );
end;
$$;

revoke all on function public.reverse_treasury_transfer(uuid, uuid, text) from public, anon;
grant execute on function public.reverse_treasury_transfer(uuid, uuid, text) to authenticated;
