-- HAB-PILOT #23 repair: `condominium_memberships.role = 'owner'` is an
-- historical/account-link record, not proof of current ownership.  Every
-- owner-derived capability must consult the effective-dated unit_owners row
-- at authorization time.  Do not replace this with a scheduled cleanup: a
-- job can run late or fail, while the date predicate remains fail-closed.
--
-- `ends_at` remains inclusive: an owner whose end date is today is active
-- through today.  This migration deliberately does not give date-only rows
-- intraday revocation semantics.

-- The previous migration removed the membership when an ownership row was
-- edited.  That is both scheduler-adjacent lifecycle state and destroys a
-- useful historical account-link record.  Remove the trigger; authorization
-- below no longer depends on whether that historical row is retained.
drop trigger if exists unit_owners_revoke_stale_owner_membership on public.unit_owners;
drop function if exists public.revoke_stale_owner_membership_after_ownership();

-- A current owner is not a restricted resident merely because a historical
-- owner membership exists; conversely, an expired owner link cannot lift the
-- tenant/family/authorized-occupant restrictions.
create or replace function public.is_restricted_resident_only_for_condominium(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select not public.is_organization_owner_for_condominium(target)
    and exists (
      select 1 from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and public.is_restricted_resident_role(cm.role)
    )
    and not public.has_active_owner_relationship(target)
    and not exists (
      select 1 from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and public.is_staff_role(cm.role)
    );
$$;

create or replace function public.is_tenant_only_for_condominium(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = auth.uid()
      and cm.role = 'tenant'::public.condominium_role
  )
  and not public.has_active_owner_relationship(target)
  and not exists (
    select 1 from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = auth.uid()
      and public.is_staff_role(cm.role)
  );
$$;

-- Service-request creation is a protected write path independent of the
-- condominium read helper, so retain its own owner relationship check.
create or replace function public.can_create_service_request(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner_for_condominium(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and (
          (cm.role = 'owner' and public.has_active_owner_relationship(target))
          or public.is_staff_role(cm.role)
          or (cm.role = 'tenant' and public.has_active_tenant_occupancy(target))
        )
    );
$$;

-- Owner-audience community documents were the remaining direct stale-owner
-- grant.  Versions, links and download recording all route through this
-- scope helper, so this closes their SECURITY DEFINER/RLS paths as well.
create or replace function public.can_read_community_document_scope(
  target_condominium_id uuid,
  target_audience public.community_document_audience,
  target_status public.community_document_status
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when auth.uid() is null then false
    when public.can_manage_community_documents(target_condominium_id) then true
    when target_status <> 'active' then false
    when target_audience = 'management' then false
    when target_audience = 'owners' then exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target_condominium_id
        and cm.user_id = auth.uid()
        and cm.role = 'owner'
        and public.has_active_owner_relationship(target_condominium_id)
    )
    when target_audience = 'residents' then public.can_read_condominium(target_condominium_id)
    else false
  end;
$$;

-- Preserve the original owner/tenant/board audience for charge concepts.
-- A generic condominium-read check would accidentally grant financial metadata
-- to family members and authorized occupants. Date-check ownership/tenancy instead.
drop policy if exists concepts_read on public.charge_concepts;
create policy concepts_read on public.charge_concepts
for select
using (
  public.can_read_receivables(condominium_id)
  or exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = charge_concepts.condominium_id
      and cm.user_id = auth.uid()
      and (
        (cm.role = 'owner' and public.has_active_owner_relationship(charge_concepts.condominium_id))
        or (cm.role = 'tenant' and public.has_active_tenant_occupancy(charge_concepts.condominium_id))
        or cm.role = 'board_member'
      )
  )
);

-- Explicit ACL reset for every replaced callable signature.  Helpers invoked
-- by RLS/SECURITY DEFINER are deliberately available only to authenticated
-- callers and the backend service role; no PUBLIC or anon execution remains.
revoke all on function public.is_restricted_resident_only_for_condominium(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_restricted_resident_only_for_condominium(uuid) to authenticated, service_role;
revoke all on function public.is_tenant_only_for_condominium(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_tenant_only_for_condominium(uuid) to authenticated, service_role;
revoke all on function public.can_create_service_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.can_create_service_request(uuid) to authenticated, service_role;
revoke all on function public.can_read_community_document_scope(uuid, public.community_document_audience, public.community_document_status) from public, anon, authenticated, service_role;
grant execute on function public.can_read_community_document_scope(uuid, public.community_document_audience, public.community_document_status) to authenticated, service_role;
