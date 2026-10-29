-- HAB-597 / pilot 23: recipient rows are an immutable delivery/audit ledger,
-- never proof of current access.  Residential access is re-evaluated from the
-- effective-dated relationship on every read, attachment download and receipt
-- write. `ends_at` is inclusive by the established product contract.

create or replace function public.is_current_announcement_recipient(
  target_announcement uuid,
  target_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.announcements a
    where a.id = target_announcement
      and target_user is not null
      and (
        -- Valid operational roles (including board) are independent of a
        -- residential relationship. Their membership remains condominium-scoped.
        exists (
          select 1
          from public.condominium_memberships staff_membership
          where staff_membership.condominium_id = a.condominium_id
            and staff_membership.user_id = target_user
            and public.is_staff_role(staff_membership.role)
        )
        or exists (
          select 1
          from public.organization_memberships om
          join public.condominiums c on c.organization_id = om.organization_id
          where c.id = a.condominium_id
            and om.user_id = target_user
            and om.role = 'organization_owner'
        )
        or exists (
          select 1
          from public.condominium_memberships cm
          where cm.condominium_id = a.condominium_id
            and cm.user_id = target_user
            and (
              (cm.role = 'owner' and exists (
                select 1
                from public.people p
                join public.unit_owners o on o.person_id = p.id
                join public.units u on u.id = o.unit_id
                where p.auth_user_id = target_user
                  and p.condominium_id = a.condominium_id
                  and p.status = 'active'
                  and u.condominium_id = a.condominium_id
                  and u.status = 'active'
                  and o.starts_at <= current_date
                  and (o.ends_at is null or o.ends_at >= current_date)
                  and a.audience in ('everyone', 'owners', 'building', 'unit')
                  and (a.audience <> 'building' or u.building_id = a.building_id)
                  and (a.audience <> 'unit' or u.id = a.unit_id)
              ))
              or (cm.role in ('tenant', 'family_member', 'authorized_occupant') and exists (
                select 1
                from public.people p
                join public.unit_occupancies o on o.person_id = p.id
                join public.units u on u.id = o.unit_id
                where p.auth_user_id = target_user
                  and p.condominium_id = a.condominium_id
                  and p.status = 'active'
                  and u.condominium_id = a.condominium_id
                  and u.status = 'active'
                  and o.occupancy_type = cm.role::text::public.occupancy_type
                  and o.starts_at <= current_date
                  and (o.ends_at is null or o.ends_at >= current_date)
                  and a.audience in ('everyone', 'tenants', 'building', 'unit')
                  and (a.audience <> 'building' or u.building_id = a.building_id)
                  and (a.audience <> 'unit' or u.id = a.unit_id)
              ))
            )
        )
      )
  );
$$;

-- Publication uses the existing recipient insert. Filter it at the table
-- boundary so all publication paths (manual and scheduler) use the same
-- effective-membership rule without altering historical rows.
create or replace function public.reject_stale_announcement_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not public.is_current_announcement_recipient(new.announcement_id, new.user_id) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists announcement_recipients_current_membership on public.announcement_recipients;
create trigger announcement_recipients_current_membership
before insert on public.announcement_recipients
for each row execute function public.reject_stale_announcement_recipient();

create or replace function public.can_access_announcement(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.announcements a
      where a.id = target
        and (
          public.can_review_announcements(a.condominium_id)
          or (
            a.status in ('published', 'archived')
            and exists (
              select 1
              from public.announcement_recipients r
              where r.announcement_id = a.id
                and r.user_id = auth.uid()
            )
            and public.is_current_announcement_recipient(a.id, auth.uid())
          )
        )
    );
$$;

create or replace function public.mark_announcement_read(
  target_condominium uuid,
  target_announcement uuid
)
returns public.announcement_recipients
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  recipient public.announcement_recipients;
begin
  if auth.uid() is null or not public.can_access_announcement(target_announcement) then
    raise exception 'announcement unavailable';
  end if;

  update public.announcement_recipients
  set read_at = coalesce(read_at, now())
  where announcement_id = target_announcement
    and condominium_id = target_condominium
    and user_id = auth.uid()
  returning * into recipient;
  if recipient.announcement_id is null then raise exception 'announcement recipient not found'; end if;
  return recipient;
end;
$$;

create or replace function public.acknowledge_announcement(
  target_condominium uuid,
  target_announcement uuid
)
returns public.announcement_recipients
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_record public.announcements;
  recipient public.announcement_recipients;
  was_acknowledged boolean;
begin
  if auth.uid() is null or not public.can_access_announcement(target_announcement) then
    raise exception 'announcement unavailable';
  end if;

  select * into target_record
  from public.announcements a
  where a.id = target_announcement and a.condominium_id = target_condominium;
  if target_record.id is null or target_record.status not in ('published', 'archived') then
    raise exception 'announcement unavailable';
  end if;
  if not target_record.requires_acknowledgement then
    raise exception 'announcement does not require acknowledgement';
  end if;

  select acknowledged_at is not null into was_acknowledged
  from public.announcement_recipients
  where announcement_id = target_announcement
    and condominium_id = target_condominium
    and user_id = auth.uid();

  update public.announcement_recipients
  set read_at = coalesce(read_at, now()),
      acknowledged_at = coalesce(acknowledged_at, now())
  where announcement_id = target_announcement
    and condominium_id = target_condominium
    and user_id = auth.uid()
  returning * into recipient;
  if recipient.announcement_id is null then raise exception 'announcement recipient not found'; end if;

  if not coalesce(was_acknowledged, false) then
    insert into public.announcement_events (
      announcement_id, condominium_id, event_type, actor_user_id, metadata
    ) values (
      target_announcement, target_condominium, 'acknowledged', auth.uid(),
      jsonb_build_object('user_id', auth.uid())
    );
  end if;
  return recipient;
end;
$$;

-- Direct-recipient metadata is private once access expires; uploads do not
-- retain a perpetual read grant. The API's R2 download route first queries this
-- table with the caller JWT, so this RLS check also gates object retrieval.
drop policy if exists announcement_recipients_read on public.announcement_recipients;
create policy announcement_recipients_read on public.announcement_recipients
for select to authenticated using (
  public.can_review_announcements(condominium_id)
  or (user_id = auth.uid() and public.can_access_announcement(announcement_id))
);

drop policy if exists announcement_attachments_read on public.announcement_attachments;
create policy announcement_attachments_read on public.announcement_attachments
for select to authenticated using (public.can_access_announcement(announcement_id));

-- Explicit ACL reset: no PUBLIC/anon execution on new or replaced privileged
-- functions. Trigger-only code is intentionally not client-callable.
-- Never expose a target_user membership oracle to direct authenticated RPC callers.
-- SECURITY DEFINER announcement/trigger functions invoke this helper as its owner.
revoke all on function public.is_current_announcement_recipient(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.reject_stale_announcement_recipient() from public, anon, authenticated, service_role;
revoke all on function public.can_access_announcement(uuid) from public, anon, authenticated, service_role;
grant execute on function public.can_access_announcement(uuid) to authenticated, service_role;
revoke all on function public.mark_announcement_read(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_announcement_read(uuid, uuid) to authenticated, service_role;
revoke all on function public.acknowledge_announcement(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_announcement(uuid, uuid) to authenticated, service_role;
