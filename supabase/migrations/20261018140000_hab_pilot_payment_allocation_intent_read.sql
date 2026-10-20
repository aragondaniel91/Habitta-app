-- HAB-PILOT-002-P1 follow-up: allocation intents remain proposals, but must be
-- visible to the resident while correcting and to an authorized reviewer.
-- This depends on the R6 draft-privacy migrations and the intent table migration.

create policy payment_allocation_intents_read on public.payment_allocation_intents
for select to authenticated
using (
  exists (
    select 1 from public.payments p
    where p.id = payment_allocation_intents.payment_id
      and p.condominium_id = payment_allocation_intents.condominium_id
      and (
        (p.status in ('draft', 'correction_requested')
          and public.can_manage_payment_draft(p.condominium_id, p.submitted_by_user_id))
        or (p.status not in ('draft', 'correction_requested')
          and (public.can_review_payments(p.condominium_id) or public.can_submit_payment(p.unit_id)))
      )
  )
);

grant select on public.payment_allocation_intents to authenticated;

create or replace function public.get_payment_allocation_intent(target uuid, target_payment uuid)
returns public.payment_allocation_intents
language plpgsql stable security definer set search_path=public set row_security=off as $$
declare p public.payments; intent public.payment_allocation_intents;
begin
  select * into p from public.payments where id=target_payment and condominium_id=target;
  if p.id is null or not (
    (p.status in ('draft', 'correction_requested')
      and public.can_manage_payment_draft(target, p.submitted_by_user_id))
    or (p.status not in ('draft', 'correction_requested')
      and (public.can_review_payments(target) or public.can_submit_payment(p.unit_id)))
  ) then
    raise exception using errcode='42501', message='payment allocation intent read denied';
  end if;
  select * into intent from public.payment_allocation_intents
    where payment_id=p.id and condominium_id=target;
  if intent.id is null then
    -- A pre-feature payment has no proposed allocations. Return SQL NULL, not an all-null composite.
    return null;
  end if;
  return intent;
end $$;

revoke all on function public.get_payment_allocation_intent(uuid,uuid) from public;
grant execute on function public.get_payment_allocation_intent(uuid,uuid) to authenticated, service_role;
