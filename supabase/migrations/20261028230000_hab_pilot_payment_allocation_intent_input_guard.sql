-- HAB-PILOT #9: the allocation-intent RPC is granted directly to authenticated
-- callers, so it must enforce the same minor-unit shape as the HTTP schema.
-- Do not rely on NULL comparison semantics after extracting arbitrary JSON.
-- This remains a review proposal only: it never writes allocations or ledger rows.

create or replace function public.save_payment_allocation_intent(
  target uuid, target_payment uuid, proposals jsonb
) returns public.payment_allocation_intents
language plpgsql security definer set search_path=public set row_security=off as $$
declare
  p public.payments;
  proposal jsonb;
  item public.receivable_items;
  saved public.payment_allocation_intents;
  used numeric := 0;
  outstanding numeric;
  proposal_item_id uuid;
  payment_amount numeric;
  receivable_amount numeric;
begin
  select * into p from public.payments where id=target_payment and condominium_id=target for update;
  if p.id is null then raise exception using errcode='P0001', message='payment not found'; end if;
  if p.status not in ('draft','correction_requested')
     or not public.can_manage_payment_draft(target,p.submitted_by_user_id) then
    raise exception using errcode='42501', message='payment update denied';
  end if;
  if jsonb_typeof(proposals) <> 'array' or jsonb_array_length(proposals) = 0 then
    raise exception using errcode='P0001', message='invalid payment allocations';
  end if;
  if exists (select 1 from jsonb_array_elements(proposals) x group by x->>'receivable_item_id' having count(*) > 1) then
    raise exception using errcode='P0001', message='invalid payment allocations';
  end if;

  for proposal in select value from jsonb_array_elements(proposals) loop
    -- `->>` returns NULL for absent fields. Check every field before a UUID/numeric
    -- cast so a direct RPC caller cannot persist an unreviewable proposal.
    if jsonb_typeof(proposal) <> 'object'
       or coalesce(proposal->>'receivable_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(proposal->>'payment_currency_code', '') !~ '^[A-Z]{3}$'
       or coalesce(proposal->>'receivable_currency_code', '') !~ '^[A-Z]{3}$'
       or coalesce(proposal->>'payment_amount', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
       or coalesce(proposal->>'receivable_amount', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception using errcode='P0001', message='invalid payment allocations';
    end if;

    proposal_item_id := (proposal->>'receivable_item_id')::uuid;
    payment_amount := (proposal->>'payment_amount')::numeric;
    receivable_amount := (proposal->>'receivable_amount')::numeric;
    select * into item from public.receivable_items where id=proposal_item_id
      and condominium_id=target and unit_id=p.unit_id and lifecycle_status='active';
    select coalesce(sum(case direction when 'debit' then amount else -amount end),0) into outstanding
      from public.receivable_ledger_entries where receivable_item_id=item.id;
    if item.id is null
       or proposal->>'payment_currency_code' <> p.original_currency_code
       or proposal->>'receivable_currency_code' <> item.currency_code
       or item.currency_code <> p.original_currency_code
       or payment_amount <= 0
       or receivable_amount <> payment_amount
       or receivable_amount > outstanding then
      raise exception using errcode='P0001', message='invalid payment allocations';
    end if;
    used := used + payment_amount;
  end loop;
  if used > p.original_amount then
    raise exception using errcode='P0001', message='invalid payment allocations';
  end if;
  insert into public.payment_allocation_intents(condominium_id,payment_id,proposals,created_by)
    values(target,p.id,proposals,auth.uid())
  on conflict(payment_id) do update set proposals=excluded.proposals,created_by=excluded.created_by,updated_at=now()
  returning * into saved;
  return saved;
end $$;

revoke all on function public.save_payment_allocation_intent(uuid,uuid,jsonb) from public;
grant execute on function public.save_payment_allocation_intent(uuid,uuid,jsonb) to authenticated, service_role;
