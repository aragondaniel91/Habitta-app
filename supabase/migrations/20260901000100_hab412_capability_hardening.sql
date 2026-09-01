-- HAB-412 / HAB-418, part two: replace the negative role checks with explicit capabilities, and
-- close the financial vectors the audit found.
--
-- The authorization graph asked "is this role not a tenant" in eight places. That was sound while
-- the only residential roles were owner and tenant and everything else was staff. It stops being
-- sound the moment `family_member` and `authorized_occupant` exist, because both answer "not
-- tenant" while being the two least privileged roles in the product.
--
-- Nothing below widens owner, tenant or staff. Three things narrow, each deliberately, each with
-- its own assertion in supabase/tests:
--
--   1. `can_read_financial_unit` no longer accepts `authorized_occupant`. That was reachable
--      before this branch, with no membership at all, and is the pre-existing bug the regression
--      test in hab412_authorized_occupant_financial_vector.sql reproduces.
--   2. `can_submit_payment` no longer accepts an occupancy of just any type. Being somebody's
--      family is not a financial standing.
--   3. `user_can_access_service_request_unit` likewise.
--
-- And two capabilities are decoupled from `can_read_condominium` so that widening a read cannot
-- widen them by transitivity: creating a service request, and reading governance.

-- ------------------------------------------------------------------ vocabulary

-- The five roles that run the condominium. Written once, as a list, so every capability below can
-- name it instead of describing its complement. A complement silently absorbs every role added
-- later, which is exactly how this branch became dangerous.
create or replace function public.is_staff_role(target public.condominium_role)
returns boolean
language sql
immutable
set search_path = public
as $$
  select target in (
    'condominium_admin',
    'accountant',
    'assistant',
    'payment_reviewer',
    'board_member'
  );
$$;

-- The roles that carry no elevated capability of their own. `owner` is deliberately absent: an
-- owner is a resident with financial standing.
create or replace function public.is_restricted_resident_role(target public.condominium_role)
returns boolean
language sql
immutable
set search_path = public
as $$
  select target in ('tenant', 'family_member', 'authorized_occupant');
$$;

revoke all on function public.is_staff_role(public.condominium_role) from public;
revoke all on function public.is_restricted_resident_role(public.condominium_role) from public;
grant execute on function public.is_staff_role(public.condominium_role) to authenticated, service_role;
grant execute on function public.is_restricted_resident_role(public.condominium_role) to authenticated, service_role;

-- ------------------------------------------------------------------ the residential relation

-- A membership is never enough on its own. The relationship in `unit_occupancies` is the source of
-- truth, and it is re-read on every request, so an old JWT cannot resurrect access that ended.
--
-- Dates are stated in full for these two roles: a relationship that starts tomorrow is not active
-- today, and the end date stays inclusive to match the semantics HAB-164 settled. The existing
-- tenant helpers omit `starts_at`; that asymmetry is left exactly as it is, because changing it
-- would alter live tenant behaviour and belongs to its own issue.
create or replace function public.has_active_resident_relation(
  target_condominium uuid,
  target_type public.occupancy_type
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.people p
    join public.unit_occupancies uo on uo.person_id = p.id
    join public.units u on u.id = uo.unit_id
    where p.auth_user_id = auth.uid()
      and p.condominium_id = target_condominium
      and p.status = 'active'
      and u.condominium_id = target_condominium
      and u.status = 'active'
      and uo.occupancy_type = target_type
      and uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
  );
$$;

revoke all on function public.has_active_resident_relation(uuid, public.occupancy_type) from public, anon;
grant execute on function public.has_active_resident_relation(uuid, public.occupancy_type) to authenticated, service_role;

-- True when everything this user holds here is a restricted residential role. Presence of
-- `family_member` or `authorized_occupant` never lifts anyone out of this: they add no capability,
-- so they cannot remove a restriction either.
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
    and not exists (
      select 1 from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and (cm.role = 'owner' or public.is_staff_role(cm.role))
    );
$$;

revoke all on function public.is_restricted_resident_only_for_condominium(uuid) from public, anon;
grant execute on function public.is_restricted_resident_only_for_condominium(uuid) to authenticated, service_role;

-- Kept for compatibility, with the dangerous half replaced. The escape list is now the roles that
-- genuinely elevate a tenant -- owner and the five staff roles -- instead of "anything that is not
-- tenant". Before this, granting a tenant a `family_member` membership would have made this false
-- and switched off the read-only triggers that depend on it.
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
  and not exists (
    select 1 from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = auth.uid()
      and (cm.role = 'owner' or public.is_staff_role(cm.role))
  );
$$;

-- ------------------------------------------------------------------ condominium context

-- Owner, tenant and staff keep exactly what they had. The two new roles are admitted only with the
-- matching active relationship, checked per request.
create or replace function public.can_read_condominium(target uuid)
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
          cm.role = 'owner'
          or public.is_staff_role(cm.role)
          or (cm.role = 'tenant' and public.has_active_tenant_occupancy(target))
          or (
            cm.role = 'family_member'
            and public.has_active_resident_relation(target, 'family_member')
          )
          or (
            cm.role = 'authorized_occupant'
            and public.has_active_resident_relation(target, 'authorized_occupant')
          )
        )
    );
$$;

-- Governance was a pure delegation to `can_read_condominium`, so widening that read capability
-- above would have handed assemblies, proposals, options, attachments, agenda items, resolutions
-- and action items to the two new roles by transitivity -- seven policies and five functions,
-- none of them mentioned in this branch. Being someone's family is not a reason to see how the
-- building votes.
--
-- The body is now stated positively and holds exactly the audience `can_read_condominium` had
-- before HAB-412: the organization owner, owner and staff memberships, and a tenant under the same
-- active-occupancy condition as before. Nothing about owner, tenant or staff changes.
--
-- Deliberately not delegating to `can_create_service_request`, whose set happens to coincide today.
-- They are different questions, and sharing a body would mean a future change to one silently
-- moving the other.
create or replace function public.can_read_governance(target uuid)
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
          cm.role = 'owner'
          or public.is_staff_role(cm.role)
          or (cm.role = 'tenant' and public.has_active_tenant_occupancy(target))
        )
    );
$$;

-- The unit a resident lives in, by name. This gates exactly one policy -- `units.unit_read_v3` --
-- and no function in the schema calls it, so widening it cannot reach a financial domain. That was
-- verified against the catalogue rather than assumed.
create or replace function public.can_read_unit(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.units u
    where u.id = target_unit
      and u.status = 'active'
      and (
        public.is_organization_owner_for_condominium(u.condominium_id)
        or exists (
          select 1
          from public.condominium_memberships cm
          where cm.condominium_id = u.condominium_id
            and cm.user_id = auth.uid()
            and public.is_staff_role(cm.role)
        )
        or exists (
          select 1
          from public.unit_owners owner_link
          join public.people p on p.id = owner_link.person_id
          where owner_link.unit_id = u.id
            and owner_link.ends_at is null
            and p.condominium_id = u.condominium_id
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
        or public.is_active_tenant_for_unit(u.condominium_id, u.id)
        -- New: the resident can name their own unit, and only theirs. The relation is checked on
        -- this unit, so another unit in the same condominium stays invisible.
        or exists (
          select 1
          from public.people p
          join public.unit_occupancies uo on uo.person_id = p.id
          where uo.unit_id = u.id
            and uo.occupancy_type in ('family_member', 'authorized_occupant')
            and uo.starts_at <= current_date
            and (uo.ends_at is null or uo.ends_at >= current_date)
            and p.condominium_id = u.condominium_id
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
      )
  );
$$;

-- ------------------------------------------------------------------ financial boundary

-- The pre-existing bug. `authorized_occupant` was inside this allowlist and this function never
-- required a membership, so an authenticated person linked through any other access could read the
-- receivables, ledger, late fees and solvency of a unit they were merely authorized to occupy.
-- Financial standing now means owning the unit or renting it, and nothing else.
create or replace function public.can_read_financial_unit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_read_receivables(u.condominium_id)
    or exists (
      select 1
      from public.unit_owners o
      join public.people p on p.id = o.person_id
      where o.unit_id = target
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    )
    or exists (
      select 1
      from public.unit_occupancies o
      join public.people p on p.id = o.person_id
      where o.unit_id = target
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and o.occupancy_type in ('owner_occupant', 'tenant')
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    )
  from public.units u
  where u.id = target
    and u.status = 'active';
$$;

-- Positive authorization: name who may submit, rather than who may not. The restricted-resident
-- guard replaces `not is_tenant_only`, so family-only and authorized-only are refused for the same
-- reason a tenant is, and an administrator who happens to also be family keeps their staff
-- capability through `can_manage_people`, never through the residential role.
create or replace function public.can_submit_payment(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_manage_people(u.condominium_id)
    or (
      not public.is_restricted_resident_only_for_condominium(u.condominium_id)
      and (
        exists (
          select 1
          from public.unit_owners o
          join public.people p on p.id = o.person_id
          where o.unit_id = target_unit
            and o.ends_at is null
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.unit_occupancies o
          join public.people p on p.id = o.person_id
          where o.unit_id = target_unit
            and o.ends_at is null
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
            -- Narrowed on purpose: an occupancy of any type used to qualify here.
            and o.occupancy_type in ('owner_occupant', 'tenant')
        )
      )
    )
  from public.units u
  where u.id = target_unit
    and u.status = 'active';
$$;

-- ------------------------------------------------------------------ read-only enforcement

-- These triggers refused writes only while `is_tenant_only_for_condominium` was true, which made
-- them switchable off by granting a tenant any other membership. They now key on the restricted
-- resident capability, so family-only and authorized-only are covered too, and a tenant who is
-- also family stays exactly as restricted as before.
create or replace function public.enforce_tenant_payment_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium uuid;
begin
  target_condominium := case when tg_op = 'DELETE' then old.condominium_id else new.condominium_id end;
  if auth.uid() is not null
     and public.is_restricted_resident_only_for_condominium(target_condominium) then
    raise exception 'tenant access is read only';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.enforce_tenant_service_request_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium uuid;
begin
  target_condominium := case when tg_op = 'DELETE' then old.condominium_id else new.condominium_id end;
  if auth.uid() is not null
     and public.is_restricted_resident_only_for_condominium(target_condominium) then
    raise exception 'tenant access is read only';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.enforce_tenant_service_request_comment_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium uuid;
begin
  target_condominium := case when tg_op = 'DELETE' then old.condominium_id else new.condominium_id end;
  if auth.uid() is not null
     and public.is_restricted_resident_only_for_condominium(target_condominium) then
    raise exception 'tenant access is read only';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ------------------------------------------------------------------ service requests

-- Creating a request was authorized by `can_read_condominium`, so widening that read capability
-- would have handed the two new roles a write capability by transitivity. Writing now has a
-- capability of its own, holding exactly the set that could create requests before this branch.
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
          cm.role = 'owner'
          or public.is_staff_role(cm.role)
          or (cm.role = 'tenant' and public.has_active_tenant_occupancy(target))
        )
    );
$$;

revoke all on function public.can_create_service_request(uuid) from public, anon;
grant execute on function public.can_create_service_request(uuid) to authenticated, service_role;

-- The unit attached to a request accepted an occupancy of any type, so family and authorized would
-- have qualified as soon as they could reach the function at all.
create or replace function public.user_can_access_service_request_unit(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.unit_owners o
    join public.people p on p.id = o.person_id
    where o.unit_id = target_unit
      and o.ends_at is null
      and p.status = 'active'
      and p.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.unit_occupancies uo
    join public.people p on p.id = uo.person_id
    where uo.unit_id = target_unit
      and uo.ends_at is null
      and p.status = 'active'
      and p.auth_user_id = auth.uid()
      and uo.occupancy_type in ('owner_occupant', 'tenant')
  );
$$;

-- Rewired to the write capability. Only this line changes: the rest is the body already in the
-- database, so widening the read capability above cannot reach request creation. Diffing this
-- against the deployed definition shows one replaced call and nothing else.
CREATE OR REPLACE FUNCTION public.create_service_request(target_condominium uuid, target_unit uuid, target_category uuid, request_title text, request_description text, request_priority service_request_priority DEFAULT 'normal'::service_request_priority, target_requester uuid DEFAULT NULL::uuid)
 RETURNS service_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  requester public.people;
  created public.service_requests;
  is_staff boolean;
begin
  if auth.uid() is null or not public.can_create_service_request(target_condominium) then
    raise exception 'request access denied';
  end if;
  if char_length(trim(request_title)) not between 3 and 160
    or char_length(trim(request_description)) not between 3 and 5000 then
    raise exception 'invalid request content';
  end if;
  if not exists (
    select 1
    from public.service_request_categories c
    where c.id = target_category
      and c.condominium_id = target_condominium
      and c.is_active
  ) then
    raise exception 'invalid request category';
  end if;

  is_staff := public.can_manage_service_requests(target_condominium);

  if target_unit is not null then
    if not exists (
      select 1
      from public.units u
      where u.id = target_unit
        and u.condominium_id = target_condominium
    ) then
      raise exception 'invalid request unit';
    end if;
    if not is_staff and not public.user_can_access_service_request_unit(target_unit) then
      raise exception 'request unit access denied';
    end if;
  end if;

  if target_requester is not null then
    select * into requester
    from public.people p
    where p.id = target_requester
      and p.condominium_id = target_condominium
      and p.status = 'active';
    if requester.id is null then
      raise exception 'invalid requester';
    end if;
    if not is_staff and requester.auth_user_id is distinct from auth.uid() then
      raise exception 'requester access denied';
    end if;
  else
    select * into requester
    from public.people p
    where p.condominium_id = target_condominium
      and p.auth_user_id = auth.uid()
      and p.status = 'active'
    order by p.created_at
    limit 1;
  end if;

  insert into public.service_requests (
    condominium_id,
    unit_id,
    category_id,
    requester_person_id,
    submitted_by_user_id,
    title,
    description,
    priority
  ) values (
    target_condominium,
    target_unit,
    target_category,
    requester.id,
    auth.uid(),
    trim(request_title),
    trim(request_description),
    request_priority
  ) returning * into created;

  insert into public.service_request_events (
    condominium_id,
    request_id,
    event_type,
    actor_user_id,
    to_value,
    metadata
  ) values (
    target_condominium,
    created.id,
    'created',
    auth.uid(),
    jsonb_build_object(
      'status', created.status,
      'priority', created.priority,
      'category_id', created.category_id,
      'unit_id', created.unit_id
    ),
    jsonb_build_object('request_number', created.request_number)
  );

  return created;
end;
$function$;
