-- HAB-PILOT-002-P1: proposals are auditable draft data, never allocations or ledger entries.
-- This migration depends on the R6 draft-privacy acceptance migrations immediately before it.
create table if not exists public.payment_allocation_intents (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  proposals jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_allocation_intents enable row level security;
revoke all on public.payment_allocation_intents from anon, authenticated;

create or replace function public.save_payment_allocation_intent(
  target uuid, target_payment uuid, proposals jsonb
) returns public.payment_allocation_intents
language plpgsql security definer set search_path=public set row_security=off as $$
declare p public.payments; proposal jsonb; item public.receivable_items; saved public.payment_allocation_intents; used numeric:=0; outstanding numeric;
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
    select * into item from public.receivable_items where id=(proposal->>'receivable_item_id')::uuid
      and condominium_id=target and unit_id=p.unit_id and lifecycle_status='active';
    select coalesce(sum(case direction when 'debit' then amount else -amount end),0) into outstanding
      from public.receivable_ledger_entries where receivable_item_id=item.id;
    if item.id is null
       or proposal->>'payment_currency_code' <> p.original_currency_code
       or proposal->>'receivable_currency_code' <> item.currency_code
       or item.currency_code <> p.original_currency_code
       or (proposal->>'payment_amount')::numeric <= 0
       or (proposal->>'receivable_amount')::numeric <> (proposal->>'payment_amount')::numeric
       or (proposal->>'receivable_amount')::numeric > outstanding then
      raise exception using errcode='P0001', message='invalid payment allocations';
    end if;
    used:=used+(proposal->>'payment_amount')::numeric;
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
