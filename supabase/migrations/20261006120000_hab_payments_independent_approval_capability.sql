-- Expose the same independent-approval rule used by the payment guard to the
-- authenticated review UI. This is advisory UX only; the trigger remains the
-- final authorization boundary for approval writes.
create or replace function public.can_approve_payment(
  target uuid,
  target_payment uuid
) returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  payment public.payments;
begin
  if not public.can_review_payments(target) then
    return false;
  end if;

  select * into payment
  from public.payments
  where id = target_payment
    and condominium_id = target;

  if payment.id is null or payment.status not in ('submitted', 'under_review') then
    return false;
  end if;

  return not (
    payment.submitted_by_user_id = auth.uid()
    and exists (
      select 1
      from public.condominium_memberships membership
      where membership.condominium_id = target
        and membership.role = 'payment_reviewer'::public.condominium_role
        and membership.user_id <> auth.uid()
    )
  );
end;
$$;

revoke all on function public.can_approve_payment(uuid, uuid) from public;
grant execute on function public.can_approve_payment(uuid, uuid) to authenticated, service_role;
