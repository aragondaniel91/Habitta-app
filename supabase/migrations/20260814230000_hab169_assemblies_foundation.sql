-- HAB-169: assemblies, minutes and resolutions foundation.
-- Governance meetings are condominium-scoped, lifecycle-controlled and preserve immutable snapshots/history.

create type public.assembly_status as enum (
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);

create type public.assembly_attendance_mode as enum (
  'in_person',
  'remote',
  'proxy'
);

create table public.assemblies (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 180),
  description text,
  scheduled_at timestamptz not null,
  location text,
  status public.assembly_status not null default 'draft',
  voting_basis public.governance_voting_basis not null default 'one_per_unit',
  quorum_percentage numeric(5, 2) not null default 50
    check (quorum_percentage >= 0 and quorum_percentage <= 100),
  eligibility_count integer check (eligibility_count is null or eligibility_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  minutes_body text,
  minutes_published_at timestamptz,
  minutes_published_by uuid references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  check ((minutes_published_at is null) = (minutes_published_by is null))
);

create index assemblies_condominium_status_scheduled_idx
  on public.assemblies (condominium_id, status, scheduled_at desc);

create table public.assembly_agenda_items (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  condominium_id uuid not null,
  proposal_id uuid,
  title text not null check (char_length(trim(title)) between 2 and 180),
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (assembly_id, sort_order),
  foreign key (assembly_id, condominium_id)
    references public.assemblies(id, condominium_id) on delete cascade,
  foreign key (proposal_id, condominium_id)
    references public.governance_proposals(id, condominium_id)
);

create index assembly_agenda_items_assembly_idx
  on public.assembly_agenda_items (assembly_id, sort_order);

create table public.assembly_eligibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  condominium_id uuid not null,
  entity_kind text not null check (entity_kind in ('unit', 'owner')),
  unit_id uuid references public.units(id),
  person_id uuid references public.people(id),
  label text not null,
  captured_at timestamptz not null default now(),
  foreign key (assembly_id, condominium_id)
    references public.assemblies(id, condominium_id) on delete cascade,
  check (
    (entity_kind = 'unit' and unit_id is not null and person_id is null)
    or (entity_kind = 'owner' and person_id is not null)
  )
);

create unique index assembly_eligibility_unit_unique
  on public.assembly_eligibility_snapshots (assembly_id, unit_id)
  where entity_kind = 'unit';

create unique index assembly_eligibility_owner_unique
  on public.assembly_eligibility_snapshots (assembly_id, person_id)
  where entity_kind = 'owner';

create table public.assembly_attendance (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  condominium_id uuid not null,
  eligibility_snapshot_id uuid not null unique
    references public.assembly_eligibility_snapshots(id),
  attendee_person_id uuid references public.people(id),
  mode public.assembly_attendance_mode not null default 'in_person',
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key (assembly_id, condominium_id)
    references public.assemblies(id, condominium_id) on delete cascade
);

create index assembly_attendance_assembly_idx
  on public.assembly_attendance (assembly_id, recorded_at);

create table public.assembly_resolutions (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  condominium_id uuid not null,
  agenda_item_id uuid,
  proposal_id uuid,
  title text not null check (char_length(trim(title)) between 2 and 180),
  resolution_text text not null check (char_length(trim(resolution_text)) >= 2),
  adopted_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (assembly_id, condominium_id)
    references public.assemblies(id, condominium_id) on delete cascade,
  foreign key (agenda_item_id, condominium_id)
    references public.assembly_agenda_items(id, condominium_id),
  foreign key (proposal_id, condominium_id)
    references public.governance_proposals(id, condominium_id),
  check ((published_at is null) = (published_by is null))
);

create index assembly_resolutions_assembly_idx
  on public.assembly_resolutions (assembly_id, created_at);

create table public.assembly_events (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null,
  condominium_id uuid not null,
  event_type text not null check (
    event_type in (
      'created',
      'agenda_item_added',
      'scheduled',
      'started',
      'attendance_recorded',
      'minutes_saved',
      'minutes_published',
      'resolution_created',
      'resolution_published',
      'completed',
      'cancelled'
    )
  ),
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (assembly_id, condominium_id)
    references public.assemblies(id, condominium_id) on delete cascade
);

create index assembly_events_assembly_idx
  on public.assembly_events (assembly_id, occurred_at);

alter table public.assemblies enable row level security;
alter table public.assembly_agenda_items enable row level security;
alter table public.assembly_eligibility_snapshots enable row level security;
alter table public.assembly_attendance enable row level security;
alter table public.assembly_resolutions enable row level security;
alter table public.assembly_events enable row level security;

create policy assemblies_read on public.assemblies
for select using (public.can_read_governance(condominium_id));

create policy assembly_agenda_items_read on public.assembly_agenda_items
for select using (public.can_read_governance(condominium_id));

create policy assembly_eligibility_snapshots_manage_read on public.assembly_eligibility_snapshots
for select using (public.can_manage_governance(condominium_id));

create policy assembly_attendance_manage_read on public.assembly_attendance
for select using (public.can_manage_governance(condominium_id));

create policy assembly_resolutions_read on public.assembly_resolutions
for select using (
  public.can_manage_governance(condominium_id)
  or (published_at is not null and public.can_read_governance(condominium_id))
);

create policy assembly_events_manage_read on public.assembly_events
for select using (public.can_manage_governance(condominium_id));

-- Reads are allowed through RLS. All application writes go through the security-definer lifecycle
-- functions below so status, snapshots and publication rules cannot be bypassed by a browser client.
revoke insert, update, delete on public.assemblies from authenticated;
revoke insert, update, delete on public.assembly_agenda_items from authenticated;
revoke insert, update, delete on public.assembly_eligibility_snapshots from authenticated;
revoke insert, update, delete on public.assembly_attendance from authenticated;
revoke insert, update, delete on public.assembly_resolutions from authenticated;
revoke insert, update, delete on public.assembly_events from authenticated;

grant select on public.assemblies to authenticated;
grant select on public.assembly_agenda_items to authenticated;
grant select on public.assembly_eligibility_snapshots to authenticated;
grant select on public.assembly_attendance to authenticated;
grant select on public.assembly_resolutions to authenticated;
grant select on public.assembly_events to authenticated;

create function public.assert_assembly_snapshot_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'assembly eligibility snapshot is immutable';
end;
$$;

revoke execute on function public.assert_assembly_snapshot_immutable() from public;

create trigger assembly_eligibility_snapshots_immutable
before update or delete on public.assembly_eligibility_snapshots
for each row execute function public.assert_assembly_snapshot_immutable();

create function public.assert_assembly_resolution_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.published_at is not null then
    raise exception 'published assembly resolution is immutable';
  end if;

  if tg_op = 'UPDATE' and old.published_at is not null and new is distinct from old then
    raise exception 'published assembly resolution is immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.assert_assembly_resolution_immutable() from public;

create trigger assembly_resolutions_immutable_after_publication
before update or delete on public.assembly_resolutions
for each row execute function public.assert_assembly_resolution_immutable();

create function public.assert_assembly_agenda_mutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.assembly_status;
begin
  select status into current_status
  from public.assemblies
  where id = coalesce(new.assembly_id, old.assembly_id)
    and condominium_id = coalesce(new.condominium_id, old.condominium_id);

  if current_status not in ('draft', 'scheduled') then
    raise exception 'assembly agenda is frozen after the meeting starts';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.assert_assembly_agenda_mutable() from public;

create trigger assembly_agenda_items_freeze_after_start
before insert or update or delete on public.assembly_agenda_items
for each row execute function public.assert_assembly_agenda_mutable();

create function public.create_assembly(
  target_condominium_id uuid,
  assembly_title text,
  assembly_description text,
  assembly_scheduled_at timestamptz,
  assembly_location text default null,
  assembly_voting_basis public.governance_voting_basis default 'one_per_unit',
  assembly_quorum_percentage numeric default 50
)
returns public.assemblies
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.assemblies;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to manage assemblies';
  end if;

  if char_length(trim(coalesce(assembly_title, ''))) < 2 then
    raise exception 'assembly title is required';
  end if;

  if assembly_quorum_percentage < 0 or assembly_quorum_percentage > 100 then
    raise exception 'invalid assembly quorum percentage';
  end if;

  insert into public.assemblies (
    condominium_id,
    title,
    description,
    scheduled_at,
    location,
    voting_basis,
    quorum_percentage,
    created_by,
    updated_by
  )
  values (
    target_condominium_id,
    trim(assembly_title),
    nullif(trim(coalesce(assembly_description, '')), ''),
    assembly_scheduled_at,
    nullif(trim(coalesce(assembly_location, '')), ''),
    assembly_voting_basis,
    assembly_quorum_percentage,
    auth.uid(),
    auth.uid()
  )
  returning * into created;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id
  ) values (
    created.id, target_condominium_id, 'created', auth.uid()
  );

  return created;
end;
$$;

create function public.add_assembly_agenda_item(
  target_condominium_id uuid,
  target_assembly_id uuid,
  item_title text,
  item_description text default null,
  linked_proposal_id uuid default null,
  item_sort_order integer default 0
)
returns public.assembly_agenda_items
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.assembly_agenda_items;
  current_status public.assembly_status;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to manage assembly agenda';
  end if;

  select status into current_status
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id;

  if current_status is null then
    raise exception 'assembly not found';
  end if;
  if current_status not in ('draft', 'scheduled') then
    raise exception 'assembly agenda is frozen after the meeting starts';
  end if;

  insert into public.assembly_agenda_items (
    assembly_id,
    condominium_id,
    proposal_id,
    title,
    description,
    sort_order,
    created_by
  ) values (
    target_assembly_id,
    target_condominium_id,
    linked_proposal_id,
    trim(item_title),
    nullif(trim(coalesce(item_description, '')), ''),
    item_sort_order,
    auth.uid()
  ) returning * into created;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_assembly_id,
    target_condominium_id,
    'agenda_item_added',
    auth.uid(),
    jsonb_build_object('agenda_item_id', created.id)
  );

  return created;
end;
$$;

create function public.capture_assembly_eligibility(
  target_condominium_id uuid,
  target_assembly_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  basis public.governance_voting_basis;
  captured integer;
begin
  select voting_basis into basis
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id;

  if basis is null then
    raise exception 'assembly not found';
  end if;

  if exists (
    select 1 from public.assembly_eligibility_snapshots
    where assembly_id = target_assembly_id
  ) then
    raise exception 'assembly eligibility already captured';
  end if;

  if basis = 'one_per_unit' then
    insert into public.assembly_eligibility_snapshots (
      assembly_id, condominium_id, entity_kind, unit_id, label
    )
    select
      target_assembly_id,
      target_condominium_id,
      'unit',
      u.id,
      u.code
    from public.units u
    where u.condominium_id = target_condominium_id
      and u.status = 'active'
      and exists (
        select 1
        from public.unit_owners uo
        join public.people p on p.id = uo.person_id
        where uo.unit_id = u.id
          and p.condominium_id = target_condominium_id
          and p.status = 'active'
          and uo.starts_at <= current_date
          and (uo.ends_at is null or uo.ends_at >= current_date)
      )
    order by u.code;
  else
    insert into public.assembly_eligibility_snapshots (
      assembly_id, condominium_id, entity_kind, person_id, label
    )
    select distinct on (p.id)
      target_assembly_id,
      target_condominium_id,
      'owner',
      p.id,
      trim(p.first_name || ' ' || p.last_name)
    from public.unit_owners uo
    join public.units u on u.id = uo.unit_id
    join public.people p on p.id = uo.person_id
    where u.condominium_id = target_condominium_id
      and u.status = 'active'
      and p.condominium_id = target_condominium_id
      and p.status = 'active'
      and uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
    order by p.id;
  end if;

  select count(*)::integer into captured
  from public.assembly_eligibility_snapshots
  where assembly_id = target_assembly_id;

  return captured;
end;
$$;

create function public.transition_assembly(
  target_condominium_id uuid,
  target_assembly_id uuid,
  action text,
  expected_version integer
)
returns public.assemblies
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_row public.assemblies;
  updated public.assemblies;
  captured integer;
  next_status public.assembly_status;
  event_name text;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to manage assemblies';
  end if;

  select * into current_row
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id
  for update;

  if current_row.id is null then
    raise exception 'assembly not found';
  end if;
  if current_row.version <> expected_version then
    raise exception 'assembly version conflict';
  end if;

  case action
    when 'schedule' then
      if current_row.status <> 'draft' then
        raise exception 'assembly cannot be scheduled from current status';
      end if;
      next_status := 'scheduled';
      event_name := 'scheduled';
    when 'start' then
      if current_row.status <> 'scheduled' then
        raise exception 'assembly must be scheduled before it starts';
      end if;
      captured := public.capture_assembly_eligibility(target_condominium_id, target_assembly_id);
      if captured <= 0 then
        raise exception 'assembly has no eligible voting entities';
      end if;
      next_status := 'in_progress';
      event_name := 'started';
    when 'complete' then
      if current_row.status <> 'in_progress' then
        raise exception 'only an in-progress assembly can be completed';
      end if;
      next_status := 'completed';
      event_name := 'completed';
    when 'cancel' then
      if current_row.status not in ('draft', 'scheduled') then
        raise exception 'assembly cannot be cancelled after it starts';
      end if;
      next_status := 'cancelled';
      event_name := 'cancelled';
    else
      raise exception 'unsupported assembly action';
  end case;

  update public.assemblies
  set
    status = next_status,
    eligibility_count = case when action = 'start' then captured else eligibility_count end,
    started_at = case when action = 'start' then now() else started_at end,
    completed_at = case when action = 'complete' then now() else completed_at end,
    cancelled_at = case when action = 'cancel' then now() else cancelled_at end,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = target_assembly_id and condominium_id = target_condominium_id
  returning * into updated;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_assembly_id,
    target_condominium_id,
    event_name,
    auth.uid(),
    case when action = 'start'
      then jsonb_build_object('eligibility_count', captured, 'voting_basis', current_row.voting_basis)
      else '{}'::jsonb
    end
  );

  return updated;
end;
$$;

create function public.record_assembly_attendance(
  target_condominium_id uuid,
  target_assembly_id uuid,
  target_snapshot_id uuid,
  attendee_id uuid default null,
  attendance_mode public.assembly_attendance_mode default 'in_person'
)
returns public.assembly_attendance
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.assembly_attendance;
  current_status public.assembly_status;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to record assembly attendance';
  end if;

  select status into current_status
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id;

  if current_status <> 'in_progress' then
    raise exception 'attendance can only be recorded while assembly is in progress';
  end if;

  if not exists (
    select 1 from public.assembly_eligibility_snapshots
    where id = target_snapshot_id
      and assembly_id = target_assembly_id
      and condominium_id = target_condominium_id
  ) then
    raise exception 'eligibility snapshot not found for assembly';
  end if;

  if attendee_id is not null and not exists (
    select 1 from public.people
    where id = attendee_id and condominium_id = target_condominium_id
  ) then
    raise exception 'attendee must belong to assembly condominium';
  end if;

  insert into public.assembly_attendance (
    assembly_id,
    condominium_id,
    eligibility_snapshot_id,
    attendee_person_id,
    mode,
    recorded_by
  ) values (
    target_assembly_id,
    target_condominium_id,
    target_snapshot_id,
    attendee_id,
    attendance_mode,
    auth.uid()
  ) returning * into created;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_assembly_id,
    target_condominium_id,
    'attendance_recorded',
    auth.uid(),
    jsonb_build_object('eligibility_snapshot_id', target_snapshot_id, 'mode', attendance_mode)
  );

  return created;
end;
$$;

create function public.get_assembly_quorum(
  target_condominium_id uuid,
  target_assembly_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  required numeric(5, 2);
  eligible integer;
  present_count integer;
  percentage numeric(8, 2);
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to read assembly quorum details';
  end if;

  select quorum_percentage, eligibility_count
  into required, eligible
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id;

  if required is null then
    raise exception 'assembly not found';
  end if;

  select count(*)::integer into present_count
  from public.assembly_attendance
  where assembly_id = target_assembly_id and condominium_id = target_condominium_id;

  percentage := case
    when coalesce(eligible, 0) = 0 then 0
    else round((present_count::numeric / eligible::numeric) * 100, 2)
  end;

  return jsonb_build_object(
    'eligible', coalesce(eligible, 0),
    'present', present_count,
    'percentage', percentage,
    'requiredPercentage', required,
    'quorumMet', percentage >= required
  );
end;
$$;

create function public.save_assembly_minutes(
  target_condominium_id uuid,
  target_assembly_id uuid,
  minutes text,
  expected_version integer
)
returns public.assemblies
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_row public.assemblies;
  updated public.assemblies;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to manage assembly minutes';
  end if;

  select * into current_row
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id
  for update;

  if current_row.id is null then raise exception 'assembly not found'; end if;
  if current_row.version <> expected_version then raise exception 'assembly version conflict'; end if;
  if current_row.status not in ('in_progress', 'completed') then
    raise exception 'minutes can only be edited after assembly starts';
  end if;
  if current_row.minutes_published_at is not null then
    raise exception 'published assembly minutes are immutable';
  end if;
  if char_length(trim(coalesce(minutes, ''))) < 2 then
    raise exception 'assembly minutes are required';
  end if;

  update public.assemblies
  set minutes_body = trim(minutes), version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = target_assembly_id and condominium_id = target_condominium_id
  returning * into updated;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id
  ) values (
    target_assembly_id, target_condominium_id, 'minutes_saved', auth.uid()
  );

  return updated;
end;
$$;

create function public.publish_assembly_minutes(
  target_condominium_id uuid,
  target_assembly_id uuid,
  expected_version integer
)
returns public.assemblies
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_row public.assemblies;
  updated public.assemblies;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to publish assembly minutes';
  end if;

  select * into current_row
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id
  for update;

  if current_row.id is null then raise exception 'assembly not found'; end if;
  if current_row.version <> expected_version then raise exception 'assembly version conflict'; end if;
  if current_row.status <> 'completed' then
    raise exception 'assembly must be completed before minutes are published';
  end if;
  if current_row.minutes_published_at is not null then
    raise exception 'assembly minutes are already published';
  end if;
  if char_length(trim(coalesce(current_row.minutes_body, ''))) < 2 then
    raise exception 'assembly minutes are required before publication';
  end if;

  update public.assemblies
  set
    minutes_published_at = now(),
    minutes_published_by = auth.uid(),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = target_assembly_id and condominium_id = target_condominium_id
  returning * into updated;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id
  ) values (
    target_assembly_id, target_condominium_id, 'minutes_published', auth.uid()
  );

  return updated;
end;
$$;

create function public.create_assembly_resolution(
  target_condominium_id uuid,
  target_assembly_id uuid,
  resolution_title text,
  resolution_body text,
  linked_agenda_item_id uuid default null,
  linked_proposal_id uuid default null
)
returns public.assembly_resolutions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_status public.assembly_status;
  created public.assembly_resolutions;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to manage assembly resolutions';
  end if;

  select status into current_status from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id;

  if current_status not in ('in_progress', 'completed') then
    raise exception 'resolution requires an active or completed assembly';
  end if;

  insert into public.assembly_resolutions (
    assembly_id,
    condominium_id,
    agenda_item_id,
    proposal_id,
    title,
    resolution_text,
    adopted_at,
    created_by
  ) values (
    target_assembly_id,
    target_condominium_id,
    linked_agenda_item_id,
    linked_proposal_id,
    trim(resolution_title),
    trim(resolution_body),
    now(),
    auth.uid()
  ) returning * into created;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_assembly_id,
    target_condominium_id,
    'resolution_created',
    auth.uid(),
    jsonb_build_object('resolution_id', created.id)
  );

  return created;
end;
$$;

create function public.publish_assembly_resolution(
  target_condominium_id uuid,
  target_assembly_id uuid,
  target_resolution_id uuid
)
returns public.assembly_resolutions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_row public.assembly_resolutions;
  assembly_state public.assembly_status;
  updated public.assembly_resolutions;
begin
  if not public.can_manage_governance(target_condominium_id) then
    raise exception 'not authorized to publish assembly resolution';
  end if;

  select status into assembly_state
  from public.assemblies
  where id = target_assembly_id and condominium_id = target_condominium_id;

  if assembly_state <> 'completed' then
    raise exception 'assembly must be completed before resolution publication';
  end if;

  select * into current_row
  from public.assembly_resolutions
  where id = target_resolution_id
    and assembly_id = target_assembly_id
    and condominium_id = target_condominium_id
  for update;

  if current_row.id is null then raise exception 'assembly resolution not found'; end if;
  if current_row.published_at is not null then raise exception 'assembly resolution is already published'; end if;

  update public.assembly_resolutions
  set published_at = now(), published_by = auth.uid(), updated_at = now()
  where id = target_resolution_id
  returning * into updated;

  insert into public.assembly_events (
    assembly_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_assembly_id,
    target_condominium_id,
    'resolution_published',
    auth.uid(),
    jsonb_build_object('resolution_id', target_resolution_id)
  );

  return updated;
end;
$$;

revoke execute on function public.create_assembly(uuid, text, text, timestamptz, text, public.governance_voting_basis, numeric) from public;
revoke execute on function public.add_assembly_agenda_item(uuid, uuid, text, text, uuid, integer) from public;
revoke execute on function public.capture_assembly_eligibility(uuid, uuid) from public;
revoke execute on function public.transition_assembly(uuid, uuid, text, integer) from public;
revoke execute on function public.record_assembly_attendance(uuid, uuid, uuid, uuid, public.assembly_attendance_mode) from public;
revoke execute on function public.get_assembly_quorum(uuid, uuid) from public;
revoke execute on function public.save_assembly_minutes(uuid, uuid, text, integer) from public;
revoke execute on function public.publish_assembly_minutes(uuid, uuid, integer) from public;
revoke execute on function public.create_assembly_resolution(uuid, uuid, text, text, uuid, uuid) from public;
revoke execute on function public.publish_assembly_resolution(uuid, uuid, uuid) from public;

grant execute on function public.create_assembly(uuid, text, text, timestamptz, text, public.governance_voting_basis, numeric) to authenticated, service_role;
grant execute on function public.add_assembly_agenda_item(uuid, uuid, text, text, uuid, integer) to authenticated, service_role;
-- capture_assembly_eligibility is intentionally internal-only; transition_assembly invokes it.
grant execute on function public.capture_assembly_eligibility(uuid, uuid) to service_role;
grant execute on function public.transition_assembly(uuid, uuid, text, integer) to authenticated, service_role;
grant execute on function public.record_assembly_attendance(uuid, uuid, uuid, uuid, public.assembly_attendance_mode) to authenticated, service_role;
grant execute on function public.get_assembly_quorum(uuid, uuid) to authenticated, service_role;
grant execute on function public.save_assembly_minutes(uuid, uuid, text, integer) to authenticated, service_role;
grant execute on function public.publish_assembly_minutes(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.create_assembly_resolution(uuid, uuid, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.publish_assembly_resolution(uuid, uuid, uuid) to authenticated, service_role;
