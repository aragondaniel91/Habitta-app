-- HAB-484 follow-up: after the customer accepts the emailed token, the browser must not persist the
-- raw token just to survive a refresh. Recover the one accepted/unlinked onboarding intent from the
-- authenticated identity instead.

create or replace function public.get_my_customer_onboarding_invitation()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  invitation public.customer_invitations;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select * into invitation
  from public.customer_invitations ci
  where ci.accepted_by = actor
    and ci.status = 'accepted'
    and ci.onboarding_completed_at is null
  order by ci.accepted_at desc
  limit 1;

  if invitation.id is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'id', invitation.id,
    'email', invitation.email,
    'plan_code', invitation.plan_code,
    'billing_period', invitation.billing_period,
    'accepted_at', invitation.accepted_at
  );
end;
$$;

revoke all on function public.get_my_customer_onboarding_invitation() from public, anon;
grant execute on function public.get_my_customer_onboarding_invitation() to authenticated;

comment on function public.get_my_customer_onboarding_invitation() is
  'Returns only the current authenticated user''s accepted, not-yet-provisioned customer invitation so onboarding can recover after refresh without storing the raw invitation token.';
