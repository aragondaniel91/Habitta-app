-- HAB-484: connect the existing AdminOnboardingWizard to an accepted customer invitation without
-- creating a second onboarding implementation. The membership write created by
-- create_admin_workspace_v2 is the authoritative proof that this user created/owns the workspace.

create or replace function public.hab484_link_customer_invitation_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium public.condominiums;
  target_organization public.organizations;
  invitation_id uuid;
begin
  if new.role <> 'condominium_admin' then
    return new;
  end if;

  select * into target_condominium from public.condominiums c where c.id = new.condominium_id;
  if target_condominium.id is null or target_condominium.created_by is distinct from new.user_id then
    return new;
  end if;

  select * into target_organization
  from public.organizations o
  where o.id = target_condominium.organization_id;
  if target_organization.id is null
    or target_organization.created_by is distinct from new.user_id
    or target_organization.account_type <> 'customer'
  then
    return new;
  end if;

  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = target_organization.id
      and om.user_id = new.user_id
      and om.role = 'organization_owner'
  ) then
    return new;
  end if;

  select ci.id into invitation_id
  from public.customer_invitations ci
  where ci.accepted_by = new.user_id
    and ci.status = 'accepted'
    and ci.onboarding_completed_at is null
  order by ci.accepted_at desc
  limit 1
  for update;

  if invitation_id is null then
    return new;
  end if;

  update public.customer_invitations ci
     set onboarding_organization_id = target_organization.id,
         onboarding_condominium_id = target_condominium.id,
         onboarding_completed_at = now(),
         onboarding_result = jsonb_build_object(
           'organization', jsonb_build_object('id', target_organization.id, 'name', target_organization.name),
           'condominium', jsonb_build_object('id', target_condominium.id, 'name', target_condominium.name),
           'source', 'customer_invitation_existing_onboarding'
         )
   where ci.id = invitation_id;

  return new;
end;
$$;

revoke all on function public.hab484_link_customer_invitation_workspace() from public, anon, authenticated;

drop trigger if exists hab484_link_customer_invitation_workspace on public.condominium_memberships;
create trigger hab484_link_customer_invitation_workspace
after insert on public.condominium_memberships
for each row execute function public.hab484_link_customer_invitation_workspace();

-- Once a condominium is linked to a customer invitation, every new commercial term must preserve
-- the plan and period that the operator selected. This closes the only browser-tampering gap in the
-- reused self-service intent metadata and also protects later guided Platform Admin activation.
create or replace function public.hab484_enforce_invitation_subscription_terms()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium uuid;
  invitation public.customer_invitations;
begin
  select s.condominium_id into target_condominium
  from public.subscriptions s
  where s.id = new.subscription_id;

  if target_condominium is null then
    return new;
  end if;

  select * into invitation
  from public.customer_invitations ci
  where ci.onboarding_condominium_id = target_condominium
    and ci.status = 'accepted'
  order by ci.onboarding_completed_at desc
  limit 1;

  if invitation.id is null then
    return new;
  end if;

  if invitation.plan_code is distinct from new.plan_code then
    raise exception using errcode = '23514', message = 'subscription plan does not match customer invitation';
  end if;
  if invitation.billing_period is distinct from new.billing_period then
    raise exception using errcode = '23514', message = 'billing period does not match customer invitation';
  end if;

  return new;
end;
$$;

revoke all on function public.hab484_enforce_invitation_subscription_terms() from public, anon, authenticated;

drop trigger if exists hab484_enforce_invitation_subscription_terms on public.subscription_terms;
create trigger hab484_enforce_invitation_subscription_terms
before insert on public.subscription_terms
for each row execute function public.hab484_enforce_invitation_subscription_terms();
