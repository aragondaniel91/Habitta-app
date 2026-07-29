create type public.announcement_priority as enum ('normal', 'important', 'urgent');
create type public.announcement_status as enum ('draft', 'scheduled', 'published', 'archived');
create type public.announcement_audience as enum (
  'everyone',
  'owners',
  'tenants',
  'board',
  'building',
  'unit'
);
create type public.announcement_event_type as enum (
  'created',
  'updated',
  'scheduled',
  'unscheduled',
  'published',
  'archived',
  'acknowledged'
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 160),
  summary text not null check (char_length(trim(summary)) between 3 and 280),
  body text not null check (char_length(trim(body)) between 3 and 12000),
  priority public.announcement_priority not null default 'normal',
  status public.announcement_status not null default 'draft',
  audience public.announcement_audience not null default 'everyone',
  building_id uuid references public.buildings(id),
  unit_id uuid references public.units(id),
  requires_acknowledgement boolean not null default false,
  publish_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  check (
    (audience = 'building' and building_id is not null and unit_id is null)
    or (audience = 'unit' and unit_id is not null and building_id is null)
    or (audience not in ('building', 'unit') and building_id is null and unit_id is null)
  ),
  check (expires_at is null or publish_at is null or expires_at > publish_at),
  check (published_at is null or expires_at is null or expires_at > published_at)
);

create table public.announcement_recipients (
  announcement_id uuid not null,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  audience_reason text not null check (char_length(audience_reason) between 2 and 60),
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id),
  foreign key (announcement_id, condominium_id)
    references public.announcements(id, condominium_id) on delete cascade
);

create table public.announcement_events (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  event_type public.announcement_event_type not null,
  actor_user_id uuid references auth.users(id),
  from_value jsonb,
  to_value jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (announcement_id, condominium_id)
    references public.announcements(id, condominium_id) on delete cascade
);

create table public.announcement_attachments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  storage_key text not null unique check (char_length(storage_key) between 3 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (char_length(content_type) between 3 and 150),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (announcement_id, condominium_id)
    references public.announcements(id, condominium_id) on delete cascade
);

create index announcements_status_idx
  on public.announcements (condominium_id, status, priority, updated_at desc);
create index announcements_publish_idx
  on public.announcements (publish_at)
  where status = 'scheduled';
create index announcements_audience_idx
  on public.announcements (condominium_id, audience, published_at desc);
create index announcement_recipients_user_idx
  on public.announcement_recipients (user_id, created_at desc);
create index announcement_events_timeline_idx
  on public.announcement_events (announcement_id, created_at, id);
create index announcement_attachments_idx
  on public.announcement_attachments (announcement_id, created_at, id);


create or replace function public.validate_notification_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expected_unit uuid;
  aggregate_found boolean := false;
begin
  if new.aggregate_type = 'receivable' then
    select unit_id, true
      into expected_unit, aggregate_found
      from public.receivable_items
      where id = new.aggregate_id
        and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'payment' then
    select unit_id, true
      into expected_unit, aggregate_found
      from public.payments
      where id = new.aggregate_id
        and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'receipt' then
    select p.unit_id, true
      into expected_unit, aggregate_found
      from public.payment_receipts r
      join public.payments p on p.id = r.payment_id
      where r.id = new.aggregate_id
        and r.condominium_id = new.condominium_id
        and p.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'announcement' then
    select null::uuid, true
      into expected_unit, aggregate_found
      from public.announcements a
      where a.id = new.aggregate_id
        and a.condominium_id = new.condominium_id;
  else
    raise exception 'invalid notification aggregate type';
  end if;

  if not coalesce(aggregate_found, false) then
    raise exception 'notification aggregate does not belong to condominium';
  end if;

  if new.unit_id is distinct from expected_unit then
    raise exception 'notification unit does not match aggregate';
  end if;

  return new;
end;
$$;

create function public.can_manage_announcements(target uuid)
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
        and cm.role in ('condominium_admin', 'assistant')
    );
$$;

create function public.can_review_announcements(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_manage_announcements(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and cm.role = 'board_member'
    );
$$;

create function public.announcement_audience_valid(
  target_condominium uuid,
  target_audience public.announcement_audience,
  target_building uuid,
  target_unit uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case target_audience
    when 'building' then target_building is not null
      and target_unit is null
      and exists (
        select 1 from public.buildings b
        where b.id = target_building and b.condominium_id = target_condominium
      )
    when 'unit' then target_unit is not null
      and target_building is null
      and exists (
        select 1 from public.units u
        where u.id = target_unit and u.condominium_id = target_condominium
      )
    else target_building is null and target_unit is null
  end;
$$;

create function public.can_access_announcement(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
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
        )
      )
  );
$$;

create function public.announcement_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger announcement_events_append_only
before update or delete on public.announcement_events
for each row execute function public.announcement_append_only();

create trigger announcement_attachments_append_only
before update or delete on public.announcement_attachments
for each row execute function public.announcement_append_only();

create function public.create_announcement(
  target_condominium uuid,
  announcement_title text,
  announcement_summary text,
  announcement_body text,
  announcement_priority public.announcement_priority default 'normal',
  announcement_audience public.announcement_audience default 'everyone',
  target_building uuid default null,
  target_unit uuid default null,
  acknowledgement_required boolean default false,
  expires_on timestamptz default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.announcements;
begin
  if auth.uid() is null or not public.can_manage_announcements(target_condominium) then
    raise exception 'announcement management denied';
  end if;
  if char_length(trim(announcement_title)) not between 3 and 160
    or char_length(trim(announcement_summary)) not between 3 and 280
    or char_length(trim(announcement_body)) not between 3 and 12000 then
    raise exception 'invalid announcement content';
  end if;
  if not public.announcement_audience_valid(
    target_condominium,
    announcement_audience,
    target_building,
    target_unit
  ) then
    raise exception 'invalid announcement audience';
  end if;
  if expires_on is not null and expires_on <= now() then
    raise exception 'announcement expiration must be in the future';
  end if;

  insert into public.announcements (
    condominium_id,
    title,
    summary,
    body,
    priority,
    audience,
    building_id,
    unit_id,
    requires_acknowledgement,
    expires_at,
    created_by,
    updated_by
  ) values (
    target_condominium,
    trim(announcement_title),
    trim(announcement_summary),
    trim(announcement_body),
    announcement_priority,
    announcement_audience,
    target_building,
    target_unit,
    acknowledgement_required,
    expires_on,
    auth.uid(),
    auth.uid()
  ) returning * into created;

  insert into public.announcement_events (
    announcement_id,
    condominium_id,
    event_type,
    actor_user_id,
    to_value
  ) values (
    created.id,
    created.condominium_id,
    'created',
    auth.uid(),
    jsonb_build_object(
      'title', created.title,
      'priority', created.priority,
      'audience', created.audience,
      'requires_acknowledgement', created.requires_acknowledgement
    )
  );

  return created;
end;
$$;

create function public.update_announcement(
  target_condominium uuid,
  target_announcement uuid,
  next_title text default null,
  next_summary text default null,
  next_body text default null,
  next_priority public.announcement_priority default null,
  next_audience public.announcement_audience default null,
  target_building uuid default null,
  target_unit uuid default null,
  next_requires_acknowledgement boolean default null,
  expires_on timestamptz default null,
  clear_expires boolean default false,
  expected_version integer default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_announcement public.announcements;
  updated_announcement public.announcements;
  resolved_audience public.announcement_audience;
  resolved_building uuid;
  resolved_unit uuid;
  resolved_expires timestamptz;
begin
  if auth.uid() is null or not public.can_manage_announcements(target_condominium) then
    raise exception 'announcement management denied';
  end if;

  select * into current_announcement
  from public.announcements a
  where a.id = target_announcement
    and a.condominium_id = target_condominium
  for update;

  if current_announcement.id is null then
    raise exception 'announcement not found';
  end if;
  if current_announcement.status in ('published', 'archived') then
    raise exception 'published announcements are immutable';
  end if;
  if expected_version is not null and current_announcement.version <> expected_version then
    raise exception 'announcement version conflict';
  end if;
  if expires_on is not null and clear_expires then
    raise exception 'invalid expiration change';
  end if;
  if next_title is null
    and next_summary is null
    and next_body is null
    and next_priority is null
    and next_audience is null
    and target_building is null
    and target_unit is null
    and next_requires_acknowledgement is null
    and expires_on is null
    and not clear_expires then
    raise exception 'no announcement changes supplied';
  end if;

  resolved_audience := coalesce(next_audience, current_announcement.audience);
  resolved_building := case
    when resolved_audience = 'building' then coalesce(target_building, current_announcement.building_id)
    else null
  end;
  resolved_unit := case
    when resolved_audience = 'unit' then coalesce(target_unit, current_announcement.unit_id)
    else null
  end;
  resolved_expires := case
    when clear_expires then null
    when expires_on is not null then expires_on
    else current_announcement.expires_at
  end;

  if not public.announcement_audience_valid(
    target_condominium,
    resolved_audience,
    resolved_building,
    resolved_unit
  ) then
    raise exception 'invalid announcement audience';
  end if;
  if resolved_expires is not null and resolved_expires <= coalesce(current_announcement.publish_at, now()) then
    raise exception 'announcement expiration must follow publication';
  end if;

  update public.announcements
  set title = coalesce(nullif(trim(next_title), ''), current_announcement.title),
      summary = coalesce(nullif(trim(next_summary), ''), current_announcement.summary),
      body = coalesce(nullif(trim(next_body), ''), current_announcement.body),
      priority = coalesce(next_priority, current_announcement.priority),
      audience = resolved_audience,
      building_id = resolved_building,
      unit_id = resolved_unit,
      requires_acknowledgement = coalesce(
        next_requires_acknowledgement,
        current_announcement.requires_acknowledgement
      ),
      expires_at = resolved_expires,
      updated_by = auth.uid(),
      version = current_announcement.version + 1,
      updated_at = now()
  where id = current_announcement.id
  returning * into updated_announcement;

  insert into public.announcement_events (
    announcement_id,
    condominium_id,
    event_type,
    actor_user_id,
    from_value,
    to_value
  ) values (
    updated_announcement.id,
    updated_announcement.condominium_id,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'title', current_announcement.title,
      'priority', current_announcement.priority,
      'audience', current_announcement.audience,
      'building_id', current_announcement.building_id,
      'unit_id', current_announcement.unit_id,
      'expires_at', current_announcement.expires_at
    ),
    jsonb_build_object(
      'title', updated_announcement.title,
      'priority', updated_announcement.priority,
      'audience', updated_announcement.audience,
      'building_id', updated_announcement.building_id,
      'unit_id', updated_announcement.unit_id,
      'expires_at', updated_announcement.expires_at
    )
  );

  return updated_announcement;
end;
$$;

create function public.schedule_announcement(
  target_condominium uuid,
  target_announcement uuid,
  publish_on timestamptz,
  expected_version integer default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_announcement public.announcements;
  updated_announcement public.announcements;
begin
  if auth.uid() is null or not public.can_manage_announcements(target_condominium) then
    raise exception 'announcement management denied';
  end if;
  select * into current_announcement
  from public.announcements a
  where a.id = target_announcement and a.condominium_id = target_condominium
  for update;
  if current_announcement.id is null then raise exception 'announcement not found'; end if;
  if current_announcement.status not in ('draft', 'scheduled') then
    raise exception 'announcement cannot be scheduled';
  end if;
  if expected_version is not null and current_announcement.version <> expected_version then
    raise exception 'announcement version conflict';
  end if;
  if publish_on <= now() then raise exception 'publication time must be in the future'; end if;
  if current_announcement.expires_at is not null and current_announcement.expires_at <= publish_on then
    raise exception 'announcement expiration must follow publication';
  end if;

  update public.announcements
  set status = 'scheduled',
      publish_at = publish_on,
      updated_by = auth.uid(),
      version = current_announcement.version + 1,
      updated_at = now()
  where id = current_announcement.id
  returning * into updated_announcement;

  insert into public.announcement_events (
    announcement_id, condominium_id, event_type, actor_user_id, from_value, to_value
  ) values (
    updated_announcement.id,
    updated_announcement.condominium_id,
    'scheduled',
    auth.uid(),
    jsonb_build_object('status', current_announcement.status, 'publish_at', current_announcement.publish_at),
    jsonb_build_object('status', updated_announcement.status, 'publish_at', updated_announcement.publish_at)
  );
  return updated_announcement;
end;
$$;

create function public.unschedule_announcement(
  target_condominium uuid,
  target_announcement uuid,
  expected_version integer default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_announcement public.announcements;
  updated_announcement public.announcements;
begin
  if auth.uid() is null or not public.can_manage_announcements(target_condominium) then
    raise exception 'announcement management denied';
  end if;
  select * into current_announcement
  from public.announcements a
  where a.id = target_announcement and a.condominium_id = target_condominium
  for update;
  if current_announcement.id is null then raise exception 'announcement not found'; end if;
  if current_announcement.status <> 'scheduled' then raise exception 'announcement is not scheduled'; end if;
  if expected_version is not null and current_announcement.version <> expected_version then
    raise exception 'announcement version conflict';
  end if;

  update public.announcements
  set status = 'draft',
      publish_at = null,
      updated_by = auth.uid(),
      version = current_announcement.version + 1,
      updated_at = now()
  where id = current_announcement.id
  returning * into updated_announcement;

  insert into public.announcement_events (
    announcement_id, condominium_id, event_type, actor_user_id, from_value, to_value
  ) values (
    updated_announcement.id,
    updated_announcement.condominium_id,
    'unscheduled',
    auth.uid(),
    jsonb_build_object('status', current_announcement.status, 'publish_at', current_announcement.publish_at),
    jsonb_build_object('status', updated_announcement.status, 'publish_at', null)
  );
  return updated_announcement;
end;
$$;

create function public.finalize_announcement_publication(
  target_announcement uuid,
  publication_actor uuid
)
returns public.announcements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_announcement public.announcements;
  published_announcement public.announcements;
  notification_event_id uuid;
begin
  select * into current_announcement
  from public.announcements a
  where a.id = target_announcement
  for update;

  if current_announcement.id is null then raise exception 'announcement not found'; end if;
  if current_announcement.status not in ('draft', 'scheduled') then
    raise exception 'announcement cannot be published';
  end if;
  if current_announcement.expires_at is not null and current_announcement.expires_at <= now() then
    raise exception 'announcement has expired';
  end if;

  update public.announcements
  set status = 'published',
      publish_at = coalesce(publish_at, now()),
      published_at = now(),
      updated_by = publication_actor,
      version = version + 1,
      updated_at = now()
  where id = current_announcement.id
  returning * into published_announcement;

  insert into public.announcement_recipients (
    announcement_id,
    condominium_id,
    user_id,
    person_id,
    audience_reason
  )
  with people_targets as (
    select
      p.auth_user_id as user_id,
      p.id as person_id,
      published_announcement.audience::text as audience_reason
    from public.people p
    where p.condominium_id = published_announcement.condominium_id
      and p.auth_user_id is not null
      and p.status = 'active'
      and case published_announcement.audience
        when 'everyone' then true
        when 'owners' then exists (
          select 1
          from public.unit_owners owner_link
          join public.units u on u.id = owner_link.unit_id
          where owner_link.person_id = p.id
            and u.condominium_id = published_announcement.condominium_id
            and owner_link.starts_at <= current_date
            and (owner_link.ends_at is null or owner_link.ends_at >= current_date)
        )
        when 'tenants' then exists (
          select 1
          from public.unit_occupancies occupancy
          join public.units u on u.id = occupancy.unit_id
          where occupancy.person_id = p.id
            and u.condominium_id = published_announcement.condominium_id
            and occupancy.occupancy_type in ('tenant', 'family_member', 'authorized_occupant')
            and occupancy.starts_at <= current_date
            and (occupancy.ends_at is null or occupancy.ends_at >= current_date)
        )
        when 'building' then exists (
          select 1
          from public.units u
          where u.condominium_id = published_announcement.condominium_id
            and u.building_id = published_announcement.building_id
            and (
              exists (
                select 1 from public.unit_owners owner_link
                where owner_link.unit_id = u.id
                  and owner_link.person_id = p.id
                  and owner_link.starts_at <= current_date
                  and (owner_link.ends_at is null or owner_link.ends_at >= current_date)
              )
              or exists (
                select 1 from public.unit_occupancies occupancy
                where occupancy.unit_id = u.id
                  and occupancy.person_id = p.id
                  and occupancy.starts_at <= current_date
                  and (occupancy.ends_at is null or occupancy.ends_at >= current_date)
              )
            )
        )
        when 'unit' then exists (
          select 1
          from public.units u
          where u.id = published_announcement.unit_id
            and u.condominium_id = published_announcement.condominium_id
            and (
              exists (
                select 1 from public.unit_owners owner_link
                where owner_link.unit_id = u.id
                  and owner_link.person_id = p.id
                  and owner_link.starts_at <= current_date
                  and (owner_link.ends_at is null or owner_link.ends_at >= current_date)
              )
              or exists (
                select 1 from public.unit_occupancies occupancy
                where occupancy.unit_id = u.id
                  and occupancy.person_id = p.id
                  and occupancy.starts_at <= current_date
                  and (occupancy.ends_at is null or occupancy.ends_at >= current_date)
              )
            )
        )
        else false
      end
  ),
  membership_targets as (
    select cm.user_id, null::uuid as person_id, cm.role::text as audience_reason
    from public.condominium_memberships cm
    where cm.condominium_id = published_announcement.condominium_id
      and (
        published_announcement.audience = 'everyone'
        or (published_announcement.audience = 'board' and cm.role = 'board_member')
      )
  ),
  organization_targets as (
    select om.user_id, null::uuid as person_id, 'organization_owner'::text as audience_reason
    from public.organization_memberships om
    join public.condominiums c on c.organization_id = om.organization_id
    where c.id = published_announcement.condominium_id
      and om.role = 'organization_owner'
      and published_announcement.audience = 'everyone'
  ),
  targets as (
    select * from people_targets
    union all
    select * from membership_targets
    union all
    select * from organization_targets
  )
  select distinct on (targets.user_id)
    published_announcement.id,
    published_announcement.condominium_id,
    targets.user_id,
    targets.person_id,
    targets.audience_reason
  from targets
  where targets.user_id is not null
  order by targets.user_id, targets.person_id nulls last
  on conflict (announcement_id, user_id) do nothing;

  insert into public.announcement_events (
    announcement_id,
    condominium_id,
    event_type,
    actor_user_id,
    from_value,
    to_value,
    metadata
  ) values (
    published_announcement.id,
    published_announcement.condominium_id,
    'published',
    publication_actor,
    jsonb_build_object('status', current_announcement.status, 'publish_at', current_announcement.publish_at),
    jsonb_build_object('status', published_announcement.status, 'published_at', published_announcement.published_at),
    jsonb_build_object(
      'recipient_count', (
        select count(*) from public.announcement_recipients r
        where r.announcement_id = published_announcement.id
      )
    )
  );

  insert into public.notification_events (
    condominium_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    payload,
    deduplication_key,
    status,
    processed_at
  ) values (
    published_announcement.condominium_id,
    'announcement_published',
    'announcement',
    published_announcement.id,
    publication_actor,
    jsonb_build_object(
      'condominium_id', published_announcement.condominium_id,
      'condominium_name', (
        select c.name from public.condominiums c
        where c.id = published_announcement.condominium_id
      ),
      'announcement_id', published_announcement.id,
      'announcement_title', published_announcement.title,
      'announcement_summary', published_announcement.summary,
      'priority', published_announcement.priority,
      'requires_acknowledgement', published_announcement.requires_acknowledgement,
      'action_url', '/app/announcements'
    ),
    'announcement:' || published_announcement.id::text || ':published',
    'expanded',
    now()
  ) returning id into notification_event_id;

  insert into public.notifications (
    condominium_id,
    recipient_user_id,
    event_id,
    notification_type,
    title,
    body,
    action_url,
    metadata
  )
  select
    published_announcement.condominium_id,
    recipient.user_id,
    notification_event_id,
    'announcement_published',
    published_announcement.title,
    published_announcement.summary,
    '/app/announcements',
    jsonb_build_object(
      'announcement_id', published_announcement.id,
      'priority', published_announcement.priority,
      'requires_acknowledgement', published_announcement.requires_acknowledgement
    )
  from public.announcement_recipients recipient
  left join public.notification_preferences preference
    on preference.condominium_id = published_announcement.condominium_id
   and preference.user_id = recipient.user_id
   and preference.notification_type = 'announcement_published'
  where recipient.announcement_id = published_announcement.id
    and coalesce(preference.in_app_enabled, true)
  on conflict (event_id, recipient_user_id) do nothing;

  insert into public.notification_deliveries (
    condominium_id,
    event_id,
    recipient_user_id,
    recipient_email,
    channel,
    template_key,
    payload,
    deduplication_key
  )
  select
    published_announcement.condominium_id,
    notification_event_id,
    recipient.user_id,
    lower(auth_user.email),
    'email',
    'announcement_published',
    jsonb_build_object(
      'condominium_name', (
        select c.name from public.condominiums c
        where c.id = published_announcement.condominium_id
      ),
      'announcement_title', published_announcement.title,
      'announcement_summary', published_announcement.summary,
      'priority', published_announcement.priority,
      'action_url', '/app/announcements'
    ),
    'delivery:' || notification_event_id::text || ':' || recipient.user_id::text
  from public.announcement_recipients recipient
  join auth.users auth_user on auth_user.id = recipient.user_id
  join public.condominium_notification_settings settings
    on settings.condominium_id = published_announcement.condominium_id
  left join public.notification_preferences preference
    on preference.condominium_id = published_announcement.condominium_id
   and preference.user_id = recipient.user_id
   and preference.notification_type = 'announcement_published'
  where recipient.announcement_id = published_announcement.id
    and auth_user.email is not null
    and settings.email_enabled
    and coalesce(preference.email_enabled, true)
  on conflict (deduplication_key) do nothing;

  return published_announcement;
end;
$$;

create function public.publish_announcement(
  target_condominium uuid,
  target_announcement uuid,
  expected_version integer default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_announcement public.announcements;
begin
  if auth.uid() is null or not public.can_manage_announcements(target_condominium) then
    raise exception 'announcement management denied';
  end if;
  select * into current_announcement
  from public.announcements a
  where a.id = target_announcement and a.condominium_id = target_condominium;
  if current_announcement.id is null then raise exception 'announcement not found'; end if;
  if expected_version is not null and current_announcement.version <> expected_version then
    raise exception 'announcement version conflict';
  end if;
  return public.finalize_announcement_publication(target_announcement, auth.uid());
end;
$$;

create function public.publish_due_announcements(run_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  due_announcement record;
  published_count integer := 0;
begin
  for due_announcement in
    select a.id, a.updated_by, a.created_by
    from public.announcements a
    where a.status = 'scheduled'
      and a.publish_at <= run_at
    order by a.publish_at, a.created_at
    for update skip locked
  loop
    perform public.finalize_announcement_publication(
      due_announcement.id,
      coalesce(due_announcement.updated_by, due_announcement.created_by)
    );
    published_count := published_count + 1;
  end loop;
  return published_count;
end;
$$;

create function public.archive_announcement(
  target_condominium uuid,
  target_announcement uuid,
  expected_version integer default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_announcement public.announcements;
  archived_announcement public.announcements;
begin
  if auth.uid() is null or not public.can_manage_announcements(target_condominium) then
    raise exception 'announcement management denied';
  end if;
  select * into current_announcement
  from public.announcements a
  where a.id = target_announcement and a.condominium_id = target_condominium
  for update;
  if current_announcement.id is null then raise exception 'announcement not found'; end if;
  if current_announcement.status <> 'published' then raise exception 'only published announcements can be archived'; end if;
  if expected_version is not null and current_announcement.version <> expected_version then
    raise exception 'announcement version conflict';
  end if;

  update public.announcements
  set status = 'archived',
      archived_at = now(),
      updated_by = auth.uid(),
      version = current_announcement.version + 1,
      updated_at = now()
  where id = current_announcement.id
  returning * into archived_announcement;

  insert into public.announcement_events (
    announcement_id, condominium_id, event_type, actor_user_id, from_value, to_value
  ) values (
    archived_announcement.id,
    archived_announcement.condominium_id,
    'archived',
    auth.uid(),
    jsonb_build_object('status', current_announcement.status),
    jsonb_build_object('status', archived_announcement.status, 'archived_at', archived_announcement.archived_at)
  );
  return archived_announcement;
end;
$$;

create function public.mark_announcement_read(
  target_condominium uuid,
  target_announcement uuid
)
returns public.announcement_recipients
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  recipient public.announcement_recipients;
begin
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

create function public.acknowledge_announcement(
  target_condominium uuid,
  target_announcement uuid
)
returns public.announcement_recipients
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_record public.announcements;
  recipient public.announcement_recipients;
  was_acknowledged boolean;
begin
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
      target_announcement,
      target_condominium,
      'acknowledged',
      auth.uid(),
      jsonb_build_object('user_id', auth.uid())
    );
  end if;
  return recipient;
end;
$$;

alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.announcement_events enable row level security;
alter table public.announcement_attachments enable row level security;

create policy announcements_read on public.announcements
for select using (public.can_access_announcement(id));

create policy announcement_recipients_read on public.announcement_recipients
for select using (
  user_id = auth.uid() or public.can_review_announcements(condominium_id)
);

create policy announcement_events_read on public.announcement_events
for select using (public.can_review_announcements(condominium_id));

create policy announcement_attachments_read on public.announcement_attachments
for select using (public.can_access_announcement(announcement_id));

revoke all on public.announcements,
  public.announcement_recipients,
  public.announcement_events,
  public.announcement_attachments
from anon, authenticated;

grant select on public.announcements,
  public.announcement_recipients,
  public.announcement_events,
  public.announcement_attachments
 to authenticated;

revoke execute on function public.can_manage_announcements(uuid) from public;
revoke execute on function public.can_review_announcements(uuid) from public;
revoke execute on function public.announcement_audience_valid(uuid, public.announcement_audience, uuid, uuid) from public;
revoke execute on function public.can_access_announcement(uuid) from public;
revoke execute on function public.announcement_append_only() from public;
revoke execute on function public.create_announcement(uuid, text, text, text, public.announcement_priority, public.announcement_audience, uuid, uuid, boolean, timestamptz) from public;
revoke execute on function public.update_announcement(uuid, uuid, text, text, text, public.announcement_priority, public.announcement_audience, uuid, uuid, boolean, timestamptz, boolean, integer) from public;
revoke execute on function public.schedule_announcement(uuid, uuid, timestamptz, integer) from public;
revoke execute on function public.unschedule_announcement(uuid, uuid, integer) from public;
revoke execute on function public.finalize_announcement_publication(uuid, uuid) from public, authenticated;
revoke execute on function public.publish_announcement(uuid, uuid, integer) from public;
revoke execute on function public.publish_due_announcements(timestamptz) from public, authenticated;
revoke execute on function public.archive_announcement(uuid, uuid, integer) from public;
revoke execute on function public.mark_announcement_read(uuid, uuid) from public;
revoke execute on function public.acknowledge_announcement(uuid, uuid) from public;

grant execute on function public.can_manage_announcements(uuid) to authenticated, service_role;
grant execute on function public.can_review_announcements(uuid) to authenticated, service_role;
grant execute on function public.announcement_audience_valid(uuid, public.announcement_audience, uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_announcement(uuid) to authenticated, service_role;
grant execute on function public.create_announcement(uuid, text, text, text, public.announcement_priority, public.announcement_audience, uuid, uuid, boolean, timestamptz) to authenticated, service_role;
grant execute on function public.update_announcement(uuid, uuid, text, text, text, public.announcement_priority, public.announcement_audience, uuid, uuid, boolean, timestamptz, boolean, integer) to authenticated, service_role;
grant execute on function public.schedule_announcement(uuid, uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.unschedule_announcement(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.publish_announcement(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.publish_due_announcements(timestamptz) to service_role;
grant execute on function public.archive_announcement(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.mark_announcement_read(uuid, uuid) to authenticated, service_role;
grant execute on function public.acknowledge_announcement(uuid, uuid) to authenticated, service_role;
