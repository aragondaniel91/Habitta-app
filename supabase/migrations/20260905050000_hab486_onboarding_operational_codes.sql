-- HAB-486: authoritative blocker and next-action codes for the Platform Admin onboarding queue.
--
-- The existing queue already contains the safe invitation/customer linkage required by the operator.
-- This migration keeps that boundary intact and derives only compact operational codes. It does not
-- expose onboarding_result, invitation tokens, tenant financial data, or mutate subscriptions.

-- PostgreSQL cannot change OUT parameters with CREATE OR REPLACE, so recreate the no-argument RPC
-- atomically inside this migration while preserving its name for existing Worker callers.
drop function public.list_customer_invitations_for_platform();

create function public.list_customer_invitations_for_platform()
returns table (
  id uuid,
  email text,
  plan_code text,
  billing_period text,
  reference text,
  notes text,
  status public.customer_invitation_status,
  delivery_status text,
  delivery_error_code text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz,
  last_delivery_at timestamptz,
  onboarding_organization_id uuid,
  onboarding_condominium_id uuid,
  onboarding_completed_at timestamptz,
  operational_state text,
  blocker_code text,
  next_action_code text,
  guided_activation_pending boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform administrator required';
  end if;

  return query
  with queue as (
    select
      ci.*,
      case
        when ci.onboarding_completed_at is not null then 'completed'
        when ci.status = 'pending' and ci.expires_at <= now() then 'expired'
        else ci.status::text
      end as derived_operational_state,
      coalesce(ci.onboarding_result #>> '{guided_activation,status}', '') =
        'pending_platform_activation' as derived_guided_activation_pending
    from public.customer_invitations ci
  )
  select
    q.id,
    q.email,
    q.plan_code,
    q.billing_period,
    q.reference,
    q.notes,
    q.status,
    q.delivery_status,
    q.delivery_error_code,
    q.expires_at,
    q.accepted_at,
    q.created_at,
    q.last_delivery_at,
    q.onboarding_organization_id,
    q.onboarding_condominium_id,
    q.onboarding_completed_at,
    q.derived_operational_state,
    case
      when q.derived_operational_state = 'completed' and q.derived_guided_activation_pending
        then 'pending_platform_activation'
      when q.derived_operational_state = 'completed' then 'none'
      when q.derived_operational_state = 'accepted' then 'awaiting_workspace_completion'
      when q.derived_operational_state = 'expired' then 'invitation_expired'
      when q.derived_operational_state = 'revoked' then 'invitation_revoked'
      when q.derived_operational_state = 'pending' and q.delivery_status = 'failed'
        then 'email_delivery_failed'
      when q.derived_operational_state = 'pending' then 'awaiting_customer_acceptance'
      else 'none'
    end,
    case
      when q.derived_operational_state = 'completed' and q.derived_guided_activation_pending
        then 'complete_commercial_activation'
      when q.derived_operational_state = 'completed' then 'open_customer_360'
      when q.derived_operational_state = 'accepted' then 'customer_complete_workspace'
      when q.derived_operational_state in ('expired', 'revoked') then 'issue_new_invitation'
      when q.derived_operational_state = 'pending' and q.delivery_status = 'failed'
        then 'resend_invitation'
      when q.derived_operational_state = 'pending' then 'wait_customer_acceptance'
      else 'none'
    end,
    q.derived_guided_activation_pending
  from queue q
  order by q.created_at desc;
end;
$$;

revoke all on function public.list_customer_invitations_for_platform() from public, anon;
grant execute on function public.list_customer_invitations_for_platform() to authenticated;
