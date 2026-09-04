-- HAB-484: pilot-ready customer provisioning from Platform Admin.
--
-- Customer invitations existed before the SaaS catalogue/billing-period contract. This migration
-- closes that gap without exposing invitation tokens or privileged credentials to either browser.
-- The invitation becomes the authoritative bridge between what Habitta sold and the first
-- workspace the invited customer provisions.

alter table public.customer_invitations
  add column if not exists billing_period text,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists delivery_error_code text,
  add column if not exists last_delivery_at timestamptz,
  add column if not exists onboarding_organization_id uuid references public.organizations(id),
  add column if not exists onboarding_condominium_id uuid references public.condominiums(id),
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_result jsonb;

alter table public.customer_invitations
  drop constraint if exists customer_invitations_billing_period_shape,
  add constraint customer_invitations_billing_period_shape
    check (billing_period is null or billing_period in ('monthly', 'annual')),
  drop constraint if exists customer_invitations_delivery_status_shape,
  add constraint customer_invitations_delivery_status_shape
    check (delivery_status in ('pending', 'sent', 'failed')),
  drop constraint if exists customer_invitations_onboarding_link_shape,
  add constraint customer_invitations_onboarding_link_shape check (
    (onboarding_completed_at is null and onboarding_organization_id is null and onboarding_condominium_id is null and onboarding_result is null)
    or
    (onboarding_completed_at is not null and onboarding_organization_id is not null and onboarding_condominium_id is not null and onboarding_result is not null)
  );

create index if not exists customer_invitations_onboarding_queue
  on public.customer_invitations (status, delivery_status, created_at desc);

create or replace function public.create_customer_invitation_v2(
  target_email text,
  target_plan_code text,
  target_billing_period text,
  target_reference text default null,
  target_notes text default null,
  target_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  normalized_plan text := lower(btrim(coalesce(target_plan_code, '')));
  normalized_period text := lower(btrim(coalesce(target_billing_period, '')));
  raw_token text;
  resolved_expiration timestamptz;
  created public.customer_invitations;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform administrator required';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'invalid email';
  end if;
  if not exists (select 1 from public.plans p where p.code = normalized_plan and p.is_public) then
    raise exception using errcode = '22023', message = 'public plan not found';
  end if;
  if normalized_period not in ('monthly', 'annual') then
    raise exception using errcode = '22023', message = 'billing period must be monthly or annual';
  end if;

  resolved_expiration := coalesce(target_expires_at, now() + interval '14 days');
  if resolved_expiration <= now() + interval '1 hour'
    or resolved_expiration > now() + interval '90 days'
  then
    raise exception using errcode = '22023', message = 'invalid expiration';
  end if;

  -- A resend supersedes the previous token. Historical rows remain auditable.
  update public.customer_invitations
     set status = 'revoked', revoked_at = now()
   where email = normalized_email and status = 'pending';

  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.customer_invitations(
    email, plan_code, billing_period, reference, notes, token_hash, expires_at, created_by
  ) values (
    normalized_email,
    normalized_plan,
    normalized_period,
    nullif(btrim(coalesce(target_reference, '')), ''),
    nullif(btrim(coalesce(target_notes, '')), ''),
    encode(digest(raw_token, 'sha256'), 'hex'),
    resolved_expiration,
    auth.uid()
  ) returning * into created;

  return jsonb_build_object(
    'id', created.id,
    'email', created.email,
    'plan_code', created.plan_code,
    'billing_period', created.billing_period,
    'expires_at', created.expires_at,
    'token', raw_token
  );
end;
$$;

revoke all on function public.create_customer_invitation_v2(text,text,text,text,text,timestamptz)
  from public, anon;
grant execute on function public.create_customer_invitation_v2(text,text,text,text,text,timestamptz)
  to authenticated;

create or replace function public.get_customer_invitation_preview_v2(raw_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  invitation public.customer_invitations;
  actor uuid := auth.uid();
begin
  select * into invitation
    from public.customer_invitations ci
   where ci.token_hash = encode(digest(coalesce(raw_token, ''), 'sha256'), 'hex');

  if invitation.id is null then
    return jsonb_build_object('found', false);
  end if;

  if invitation.status = 'pending' and invitation.expires_at > now() then
    return jsonb_build_object(
      'found', true,
      'status', 'pending',
      'email', invitation.email,
      'plan_code', invitation.plan_code,
      'billing_period', invitation.billing_period,
      'expires_at', invitation.expires_at
    );
  end if;

  -- After acceptance only the same authenticated user may recover the onboarding context. This
  -- makes refresh/retry safe without turning an old token into a public customer lookup.
  if invitation.status = 'accepted' and actor is not null and invitation.accepted_by = actor then
    return jsonb_build_object(
      'found', true,
      'status', 'accepted',
      'id', invitation.id,
      'email', invitation.email,
      'plan_code', invitation.plan_code,
      'billing_period', invitation.billing_period,
      'expires_at', invitation.expires_at,
      'onboarding_completed', invitation.onboarding_completed_at is not null
    );
  end if;

  return jsonb_build_object('found', false);
end;
$$;

revoke all on function public.get_customer_invitation_preview_v2(text) from public;
grant execute on function public.get_customer_invitation_preview_v2(text) to anon, authenticated;

create or replace function public.accept_customer_invitation_v2(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  invitation public.customer_invitations;
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select * into invitation
    from public.customer_invitations ci
   where ci.token_hash = encode(digest(coalesce(raw_token, ''), 'sha256'), 'hex')
   for update;

  if invitation.id is null then
    raise exception using errcode = '22023', message = 'invalid invitation';
  end if;

  if invitation.status = 'accepted' and invitation.accepted_by = actor then
    return jsonb_build_object(
      'id', invitation.id,
      'email', invitation.email,
      'plan_code', invitation.plan_code,
      'billing_period', invitation.billing_period,
      'status', invitation.status,
      'onboarding_completed', invitation.onboarding_completed_at is not null
    );
  end if;

  if invitation.status <> 'pending' or invitation.expires_at <= now() then
    raise exception using errcode = '22023', message = 'invalid invitation';
  end if;

  select lower(u.email) into actor_email from auth.users u where u.id = actor;
  if actor_email is distinct from invitation.email then
    raise exception using errcode = '42501', message = 'invitation belongs to another email';
  end if;

  update public.customer_invitations
     set status = 'accepted', accepted_at = now(), accepted_by = actor
   where id = invitation.id;

  return jsonb_build_object(
    'id', invitation.id,
    'email', invitation.email,
    'plan_code', invitation.plan_code,
    'billing_period', invitation.billing_period,
    'status', 'accepted',
    'onboarding_completed', false
  );
end;
$$;

revoke all on function public.accept_customer_invitation_v2(text) from public, anon;
grant execute on function public.accept_customer_invitation_v2(text) to authenticated;

create or replace function public.record_customer_invitation_delivery(
  target_invitation uuid,
  delivered boolean,
  error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  changed public.customer_invitations;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'platform administrator required';
  end if;

  update public.customer_invitations
     set delivery_status = case when delivered then 'sent' else 'failed' end,
         delivery_error_code = case when delivered then null else nullif(btrim(coalesce(error_code, '')), '') end,
         last_delivery_at = now()
   where id = target_invitation
   returning * into changed;

  if changed.id is null then
    raise exception using errcode = 'P0002', message = 'customer invitation not found';
  end if;

  return jsonb_build_object(
    'id', changed.id,
    'delivery_status', changed.delivery_status,
    'last_delivery_at', changed.last_delivery_at
  );
end;
$$;

revoke all on function public.record_customer_invitation_delivery(uuid,boolean,text) from public, anon;
grant execute on function public.record_customer_invitation_delivery(uuid,boolean,text) to authenticated;

create or replace function public.list_customer_invitations_for_platform()
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
  onboarding_completed_at timestamptz
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
  select
    ci.id, ci.email, ci.plan_code, ci.billing_period, ci.reference, ci.notes, ci.status,
    ci.delivery_status, ci.delivery_error_code, ci.expires_at, ci.accepted_at, ci.created_at,
    ci.last_delivery_at, ci.onboarding_organization_id, ci.onboarding_condominium_id,
    ci.onboarding_completed_at
  from public.customer_invitations ci
  order by ci.created_at desc;
end;
$$;

revoke all on function public.list_customer_invitations_for_platform() from public, anon;
grant execute on function public.list_customer_invitations_for_platform() to authenticated;

-- Provision the first workspace from an accepted invitation. The invitation row is the lock and
-- idempotency boundary: after a successful first call, retries return onboarding_result instead of
-- creating a second tenant. Esencial/Comunidad reuse HAB-437's atomic trial path; guided plans create
-- the workspace only and remain commercially pending until Platform Admin explicitly activates it.
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
  organization_id uuid;
  condominium_id uuid;
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

  organization_id := (workspace #>> '{organization,id}')::uuid;
  condominium_id := (workspace #>> '{condominium,id}')::uuid;
  if organization_id is null or condominium_id is null then
    raise exception using errcode = 'P0001', message = 'workspace creation did not return required identifiers';
  end if;
  if not public.is_organization_owner(organization_id) then
    raise exception using errcode = '42501', message = 'created organization ownership mismatch';
  end if;
  if not exists (
    select 1 from public.condominiums c
    where c.id = condominium_id and c.organization_id = organization_id
  ) then
    raise exception using errcode = '23514', message = 'created condominium organization mismatch';
  end if;

  update public.customer_invitations
     set onboarding_organization_id = organization_id,
         onboarding_condominium_id = condominium_id,
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

comment on function public.create_customer_invitation_workspace_v1(
  uuid,uuid,text,text,text,text,text,text,text,text,public.condominium_property_topology,
  text,text,text,text,text,text,text,text,text,integer,integer,text
) is
  'HAB-484 accepted customer invitation -> first workspace. Esencial/Comunidad receive the existing atomic 30-day trial; guided plans remain pending explicit Platform Admin activation.';
