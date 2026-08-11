alter table public.condominium_notification_settings
  add column live_email_enabled boolean not null default false,
  add column live_email_changed_at timestamptz,
  add column live_email_changed_by uuid references auth.users(id);

create table public.notification_live_email_audit (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  enabled boolean not null,
  reason text not null check (length(trim(reason)) >= 8),
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.notification_live_email_audit enable row level security;

create function public.can_activate_condominium_live_email(target_condominium uuid, target_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = target_condominium
      and cm.user_id = target_actor
      and cm.role = 'condominium_admin'
  )
  or exists (
    select 1
    from public.condominiums c
    join public.organization_memberships om on om.organization_id = c.organization_id
    where c.id = target_condominium
      and om.user_id = target_actor
      and om.role = 'organization_owner'
  )
$$;

create policy notification_live_email_audit_read
on public.notification_live_email_audit
for select
using (
  public.is_organization_owner_for_condominium(condominium_id)
  or exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = notification_live_email_audit.condominium_id
      and cm.user_id = auth.uid()
      and cm.role = 'condominium_admin'
  )
);

grant select on public.notification_live_email_audit to authenticated;

create function public.guard_live_email_delivery_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  live_allowed boolean;
begin
  select s.live_email_enabled
    into live_allowed
    from public.condominium_notification_settings s
   where s.condominium_id = new.condominium_id;

  if not coalesce(live_allowed, false) then
    new.status := 'skipped'::public.notification_delivery_status;
    new.last_error_code := 'live_email_not_activated';
    new.claimed_at := null;
    new.claimed_by := null;
  end if;

  return new;
end;
$$;

create trigger notification_delivery_live_email_guard
before insert on public.notification_deliveries
for each row execute function public.guard_live_email_delivery_insert();

-- Existing hosted rows predate the production-owned live-email boundary. Fail them closed.
update public.notification_deliveries d
   set status = 'skipped',
       last_error_code = 'live_email_not_activated',
       claimed_at = null,
       claimed_by = null,
       updated_at = now()
  from public.condominium_notification_settings s
 where s.condominium_id = d.condominium_id
   and not s.live_email_enabled
   and d.status in ('pending', 'retry', 'queued', 'processing');

create or replace function public.set_condominium_live_email_enabled(
  target_condominium uuid,
  target_enabled boolean,
  target_reason text,
  target_actor uuid
)
returns public.condominium_notification_settings
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  result public.condominium_notification_settings;
begin
  if target_actor is null or not public.can_activate_condominium_live_email(target_condominium, target_actor) then
    raise exception 'permission denied';
  end if;

  if target_reason is null or length(trim(target_reason)) < 8 then
    raise exception 'activation reason required';
  end if;

  select * into result
    from public.condominium_notification_settings
   where condominium_id = target_condominium
   for update;

  if result.condominium_id is null then
    raise exception 'notification settings not found';
  end if;

  if result.live_email_enabled = target_enabled then
    return result;
  end if;

  -- Never allow deliveries accumulated while the condominium was unactivated to become live later.
  update public.notification_deliveries
     set status = 'skipped',
         last_error_code = 'live_email_not_activated',
         claimed_at = null,
         claimed_by = null,
         updated_at = now()
   where condominium_id = target_condominium
     and status in ('pending', 'retry', 'queued', 'processing');

  update public.condominium_notification_settings
     set live_email_enabled = target_enabled,
         live_email_changed_at = now(),
         live_email_changed_by = target_actor,
         updated_at = now()
   where condominium_id = target_condominium
  returning * into result;

  insert into public.notification_live_email_audit(condominium_id, enabled, reason, changed_by)
  values(target_condominium, target_enabled, trim(target_reason), target_actor);

  return result;
end;
$$;

create or replace function public.claim_due_notification_deliveries(limit_count integer default 100)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Defense in depth: if any legacy/administrative write produced an active delivery while the
  -- condominium is not activated, neutralize it before queueing.
  update public.notification_deliveries d
     set status = 'skipped',
         last_error_code = 'live_email_not_activated',
         claimed_at = null,
         claimed_by = null,
         updated_at = now()
    from public.condominium_notification_settings s
   where s.condominium_id = d.condominium_id
     and not s.live_email_enabled
     and d.status in ('pending', 'retry', 'queued', 'processing');

  return query
  with candidates as (
    select d.id
      from public.notification_deliveries d
      join public.condominium_notification_settings s on s.condominium_id = d.condominium_id
     where s.live_email_enabled
       and d.status in ('pending', 'retry')
       and d.next_attempt_at <= now()
     order by d.created_at
     for update of d skip locked
     limit least(greatest(limit_count, 1), 200)
  )
  update public.notification_deliveries d
     set status = 'queued', updated_at = now()
    from candidates c
   where d.id = c.id
  returning d.id;
end;
$$;

create or replace function public.claim_notification_delivery(target uuid, worker text)
returns public.notification_deliveries
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  delivery public.notification_deliveries;
begin
  update public.notification_deliveries d
     set status = 'skipped',
         last_error_code = 'live_email_not_activated',
         claimed_at = null,
         claimed_by = null,
         updated_at = now()
   where d.id = target
     and d.status in ('pending', 'retry', 'queued', 'processing')
     and not exists (
       select 1
         from public.condominium_notification_settings s
        where s.condominium_id = d.condominium_id
          and s.live_email_enabled
     );

  update public.notification_deliveries d
     set status = 'dead',
         last_error_code = 'processing_timeout',
         updated_at = now()
   where d.id = target
     and d.status = 'processing'
     and d.claimed_at < now() - interval '10 minutes'
     and d.attempts >= 5
     and exists (
       select 1
         from public.condominium_notification_settings s
        where s.condominium_id = d.condominium_id
          and s.live_email_enabled
     );

  update public.notification_deliveries d
     set status = 'processing',
         claimed_at = now(),
         claimed_by = worker,
         attempts = attempts + 1,
         updated_at = now()
   where d.id = target
     and d.attempts < 5
     and exists (
       select 1
         from public.condominium_notification_settings s
        where s.condominium_id = d.condominium_id
          and s.live_email_enabled
     )
     and (
       (d.status in ('pending', 'retry', 'queued') and d.next_attempt_at <= now())
       or (d.status = 'processing' and d.claimed_at < now() - interval '10 minutes')
     )
  returning d.* into delivery;

  return delivery;
end;
$$;

create or replace function public.should_send_notification_delivery(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(s.live_email_enabled, false)
    and coalesce(s.email_enabled, false)
    and coalesce(p.email_enabled, true)
  from public.notification_deliveries d
  join public.notification_events e on e.id = d.event_id
  join public.condominium_notification_settings s on s.condominium_id = d.condominium_id
  left join public.notification_preferences p
    on p.condominium_id = d.condominium_id
   and p.user_id = d.recipient_user_id
   and p.notification_type = e.event_type
  where d.id = target
$$;

revoke all on function public.can_activate_condominium_live_email(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_condominium_live_email_enabled(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.guard_live_email_delivery_insert() from public, anon, authenticated;
revoke all on function public.claim_due_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.claim_notification_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.should_send_notification_delivery(uuid) from public, anon, authenticated;

grant execute on function public.can_activate_condominium_live_email(uuid, uuid) to service_role;
grant execute on function public.set_condominium_live_email_enabled(uuid, boolean, text, uuid) to service_role;
grant execute on function public.claim_due_notification_deliveries(integer) to service_role;
grant execute on function public.claim_notification_delivery(uuid, text) to service_role;
grant execute on function public.should_send_notification_delivery(uuid) to service_role;
