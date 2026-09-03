-- HAB-455: require independent approval when a dedicated reviewer is available.
--
-- Manual payment registration and review capabilities intentionally overlap for
-- condominium_admin/accountant. When the condominium has a distinct
-- payment_reviewer configured, however, the submitter must not be able to move
-- their own payment into the approved state.
--
-- The trigger name intentionally sorts before HAB-127's BEFORE UPDATE treasury
-- resolver. A forbidden approval therefore fails at the authorization boundary
-- before treasury account resolution or any later status-transition side effect.

create or replace function public.enforce_independent_payment_approval()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.status is distinct from 'approved'::public.payment_status
     and new.status = 'approved'::public.payment_status
     and new.approved_by is not null
     and new.approved_by = old.submitted_by_user_id
     and exists (
       select 1
       from public.condominium_memberships cm
       where cm.condominium_id = old.condominium_id
         and cm.role = 'payment_reviewer'::public.condominium_role
         and cm.user_id <> new.approved_by
     ) then
    raise exception 'independent payment approval required'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_independent_payment_approval() from public, anon, authenticated, service_role;

drop trigger if exists a_payments_independent_approval_guard on public.payments;
create trigger a_payments_independent_approval_guard
before update of status, approved_by on public.payments
for each row
execute function public.enforce_independent_payment_approval();
