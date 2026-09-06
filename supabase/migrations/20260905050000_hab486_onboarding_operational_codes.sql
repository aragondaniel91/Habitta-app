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

-- HAB-484 shipped the accepted-invitation provisioning function with local variable names that
-- collide with condominiums.organization_id under PL/pgSQL's default ambiguity rules. Keep the
-- published migration immutable and repair the function forward-only here. The contract, security
-- boundary, idempotency behavior, and commercial branching remain unchanged.
create or replace function public.create_customer_invitation_workspace_v1(
  p_invitation_id uuid,
  p_idempotency_key uuid,
  p_organization_name text,
  p_organization_type text,
  p_condominium_name text,
  p_country_code text,
  p_address_line1 text,
  p_city text,
  p_timezone text,
  p_primary_currency_code text,
  p_property_topology public.condominium_property_topology,
  p_secondary_currency_code text default null,
  p_legal_name text default null,
  p_legal_id_type text default null,
  p_legal_id_number text default null,
  p_address_line2 text default null,
  p_state_region text default null,
  p_municipality text default null,
  p_parish text default null,
  p_postal_code text default null,
  p_declared_unit_count integer default null,
  p_declared_building_count integer default null,
  p_first_building_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  invitation public.customer_invitations;
  workspace jsonb;
  created_organization_id uuid;
  created_condominium_id uuid;
  guided boolean;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;

  select * into invitation
    from public.customer_invitations ci
   where ci.id = p_invitation_id
   for update;

  if invitation.id is null then
    raise exception using errcode = 'P0002', message = 'customer invitation not found';
  end if;
  if invitation.status <> 'accepted' or invitation.accepted_by is distinct from actor then
    raise exception using errcode = '42501', message = 'accepted customer invitation required';
  end if;
  if invitation.onboarding_result is not null then
    return invitation.onboarding_result;
  end if;
  if invitation.plan_code is null or invitation.billing_period is null then
    raise exception using errcode = '23514', message = 'customer invitation commercial intent is incomplete';
  end if;
  if exists (select 1 from public.organization_memberships om where om.user_id = actor) then
    raise exception using errcode = '23505', message = 'customer invitation onboarding is only available for the first workspace';
  end if;

  guided := invitation.plan_code not in ('esencial', 'comunidad');

  if guided then
    if not exists (
      select 1 from public.plans p where p.code = invitation.plan_code and p.is_public
    ) then
      raise exception using errcode = '22023', message = 'public plan not found';
    end if;

    workspace := public.create_admin_workspace_v2(
      organization_name => p_organization_name,
      organization_type => p_organization_type,
      condominium_name => p_condominium_name,
      country_code => p_country_code,
      address_line1 => p_address_line1,
      city => p_city,
      timezone => p_timezone,
      primary_currency_code => p_primary_currency_code,
      property_topology => p_property_topology,
      secondary_currency_code => p_secondary_currency_code,
      legal_name => p_legal_name,
      legal_id_type => p_legal_id_type,
      legal_id_number => p_legal_id_number,
      address_line2 => p_address_line2,
      state_region => p_state_region,
      municipality => p_municipality,
      parish => p_parish,
      postal_code => p_postal_code,
      declared_unit_count => p_declared_unit_count,
      declared_building_count => p_declared_building_count,
      first_building_name => p_first_building_name
    ) || jsonb_build_object(
      'guided_activation', jsonb_build_object(
        'required', true,
        'plan_code', invitation.plan_code,
        'billing_period', invitation.billing_period,
        'status', 'pending_platform_activation'
      )
    );
  else
    workspace := public.create_self_service_trial_workspace_v1(
      p_organization_name => p_organization_name,
      p_organization_type => p_organization_type,
      p_condominium_name => p_condominium_name,
      p_country_code => p_country_code,
      p_address_line1 => p_address_line1,
      p_city => p_city,
      p_timezone => p_timezone,
      p_primary_currency_code => p_primary_currency_code,
      p_property_topology => p_property_topology,
      p_plan_code => invitation.plan_code,
      p_billing_period => invitation.billing_period,
      p_idempotency_key => p_idempotency_key,
      p_secondary_currency_code => p_secondary_currency_code,
      p_legal_name => p_legal_name,
      p_legal_id_type => p_legal_id_type,
      p_legal_id_number => p_legal_id_number,
      p_address_line2 => p_address_line2,
      p_state_region => p_state_region,
      p_municipality => p_municipality,
      p_parish => p_parish,
      p_postal_code => p_postal_code,
      p_declared_unit_count => p_declared_unit_count,
      p_declared_building_count => p_declared_building_count,
      p_first_building_name => p_first_building_name
    );
  end if;

  created_organization_id := (workspace #>> '{organization,id}')::uuid;
  created_condominium_id := (workspace #>> '{condominium,id}')::uuid;
  if created_organization_id is null or created_condominium_id is null then
    raise exception using errcode = 'P0001', message = 'workspace creation did not return required identifiers';
  end if;
  if not public.is_organization_owner(created_organization_id) then
    raise exception using errcode = '42501', message = 'created organization ownership mismatch';
  end if;
  if not exists (
    select 1 from public.condominiums c
    where c.id = created_condominium_id and c.organization_id = created_organization_id
  ) then
    raise exception using errcode = '23514', message = 'created condominium organization mismatch';
  end if;

  update public.customer_invitations
     set onboarding_organization_id = created_organization_id,
         onboarding_condominium_id = created_condominium_id,
         onboarding_completed_at = now(),
         onboarding_result = workspace
   where id = invitation.id;

  return workspace;
end;
$$;

revoke all on function public.create_customer_invitation_workspace_v1(
  uuid,uuid,text,text,text,text,text,text,text,text,public.condominium_property_topology,
  text,text,text,text,text,text,text,text,text,integer,integer,text
) from public, anon;
grant execute on function public.create_customer_invitation_workspace_v1(
  uuid,uuid,text,text,text,text,text,text,text,text,public.condominium_property_topology,
  text,text,text,text,text,text,text,text,text,integer,integer,text
) to authenticated;
