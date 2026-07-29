create type public.service_request_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.service_request_status as enum (
  'submitted',
  'acknowledged',
  'in_progress',
  'waiting_resident',
  'waiting_vendor',
  'resolved',
  'closed',
  'cancelled'
);
create type public.service_request_visibility as enum ('public', 'internal');
create type public.service_request_event_type as enum (
  'created',
  'status_changed',
  'priority_changed',
  'category_changed',
  'assigned',
  'unassigned',
  'due_date_changed',
  'comment_added',
  'resolved',
  'reopened',
  'cancelled',
  'attachment_added'
);

create sequence public.service_request_number_seq;

create table public.service_request_categories (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (condominium_id, code),
  unique (id, condominium_id)
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null default (
    'SR-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.service_request_number_seq')::text, 6, '0')
  ),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  unit_id uuid,
  category_id uuid not null,
  requester_person_id uuid,
  submitted_by_user_id uuid not null references auth.users(id),
  assigned_to_user_id uuid references auth.users(id),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null check (char_length(trim(description)) between 3 and 5000),
  priority public.service_request_priority not null default 'normal',
  status public.service_request_status not null default 'submitted',
  due_at timestamptz,
  resolution_summary text check (
    resolution_summary is null or char_length(trim(resolution_summary)) between 3 and 4000
  ),
  acknowledged_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_number),
  unique (id, condominium_id),
  foreign key (unit_id, condominium_id)
    references public.units(id, condominium_id),
  foreign key (category_id, condominium_id)
    references public.service_request_categories(id, condominium_id),
  foreign key (requester_person_id, condominium_id)
    references public.people(id, condominium_id)
);

create table public.service_request_comments (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  request_id uuid not null,
  author_user_id uuid not null references auth.users(id),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  visibility public.service_request_visibility not null default 'public',
  created_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (id, request_id, condominium_id),
  foreign key (request_id, condominium_id)
    references public.service_requests(id, condominium_id) on delete cascade
);

create table public.service_request_attachments (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  request_id uuid not null,
  comment_id uuid,
  storage_key text not null unique check (char_length(storage_key) between 3 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (char_length(content_type) between 3 and 150),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  visibility public.service_request_visibility not null default 'public',
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (request_id, condominium_id)
    references public.service_requests(id, condominium_id) on delete cascade,
  foreign key (comment_id, request_id, condominium_id)
    references public.service_request_comments(id, request_id, condominium_id)
);

create table public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  request_id uuid not null,
  event_type public.service_request_event_type not null,
  visibility public.service_request_visibility not null default 'public',
  actor_user_id uuid references auth.users(id),
  from_value jsonb,
  to_value jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (request_id, condominium_id)
    references public.service_requests(id, condominium_id) on delete cascade
);

create index service_request_categories_active_idx
  on public.service_request_categories (condominium_id, is_active, sort_order, name);
create index service_requests_status_idx
  on public.service_requests (condominium_id, status, priority, updated_at desc);
create index service_requests_unit_idx
  on public.service_requests (unit_id, updated_at desc)
  where unit_id is not null;
create index service_requests_assignee_idx
  on public.service_requests (condominium_id, assigned_to_user_id, updated_at desc)
  where assigned_to_user_id is not null;
create index service_requests_requester_idx
  on public.service_requests (requester_person_id, updated_at desc)
  where requester_person_id is not null;
create index service_request_comments_timeline_idx
  on public.service_request_comments (request_id, created_at, id);
create index service_request_events_timeline_idx
  on public.service_request_events (request_id, created_at, id);
create index service_request_attachments_request_idx
  on public.service_request_attachments (request_id, created_at, id);

create function public.can_manage_service_requests(target uuid)
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

create function public.can_read_internal_service_requests(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_manage_service_requests(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and cm.role = 'board_member'
    );
$$;

create function public.user_can_access_service_request_unit(target_unit uuid)
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
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and (
        exists (
          select 1
          from public.unit_owners o
          where o.person_id = p.id
            and o.unit_id = target_unit
            and o.ends_at is null
        )
        or exists (
          select 1
          from public.unit_occupancies uo
          where uo.person_id = p.id
            and uo.unit_id = target_unit
            and uo.ends_at is null
        )
      )
  );
$$;

create function public.can_access_service_request(target_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.service_requests r
    where r.id = target_request
      and (
        public.can_read_internal_service_requests(r.condominium_id)
        or r.submitted_by_user_id = auth.uid()
        or exists (
          select 1
          from public.people p
          where p.id = r.requester_person_id
            and p.auth_user_id = auth.uid()
        )
        or (
          r.unit_id is not null
          and public.user_can_access_service_request_unit(r.unit_id)
        )
      )
  );
$$;

create function public.is_valid_service_request_assignee(target uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.condominiums c
    join public.organization_memberships om
      on om.organization_id = c.organization_id
    where c.id = target
      and om.user_id = target_user
      and om.role = 'organization_owner'
  ) or exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = target_user
      and cm.role in ('condominium_admin', 'assistant')
  );
$$;

create function public.service_request_transition_allowed(
  current_status public.service_request_status,
  next_status public.service_request_status
)
returns boolean
language sql
immutable
as $$
  select current_status = next_status or case current_status
    when 'submitted' then next_status in ('acknowledged', 'in_progress', 'cancelled')
    when 'acknowledged' then next_status in ('in_progress', 'waiting_resident', 'waiting_vendor', 'resolved', 'cancelled')
    when 'in_progress' then next_status in ('waiting_resident', 'waiting_vendor', 'resolved', 'cancelled')
    when 'waiting_resident' then next_status in ('in_progress', 'resolved', 'cancelled')
    when 'waiting_vendor' then next_status in ('in_progress', 'resolved', 'cancelled')
    when 'resolved' then next_status in ('in_progress', 'closed')
    when 'closed' then false
    when 'cancelled' then false
  end;
$$;

revoke execute on function public.can_manage_service_requests(uuid) from public;
revoke execute on function public.can_read_internal_service_requests(uuid) from public;
revoke execute on function public.user_can_access_service_request_unit(uuid) from public;
revoke execute on function public.can_access_service_request(uuid) from public;
revoke execute on function public.is_valid_service_request_assignee(uuid, uuid) from public;
revoke execute on function public.service_request_transition_allowed(public.service_request_status, public.service_request_status) from public;
grant execute on function public.can_manage_service_requests(uuid) to authenticated, service_role;
grant execute on function public.can_read_internal_service_requests(uuid) to authenticated, service_role;
grant execute on function public.user_can_access_service_request_unit(uuid) to authenticated, service_role;
grant execute on function public.can_access_service_request(uuid) to authenticated, service_role;
grant execute on function public.is_valid_service_request_assignee(uuid, uuid) to authenticated, service_role;
grant execute on function public.service_request_transition_allowed(public.service_request_status, public.service_request_status) to authenticated, service_role;

create function public.seed_default_service_request_categories()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.service_request_categories (
    condominium_id,
    code,
    name,
    description,
    sort_order,
    created_by
  ) values
    (new.id, 'maintenance', 'Mantenimiento', 'Reparaciones dentro de unidades o áreas comunes.', 10, new.created_by),
    (new.id, 'common_area', 'Áreas comunes', 'Incidencias en ascensores, iluminación, piscina y otras áreas compartidas.', 20, new.created_by),
    (new.id, 'access_security', 'Acceso y seguridad', 'Llaves, controles, portones, vigilancia y accesos.', 30, new.created_by),
    (new.id, 'administrative', 'Consulta administrativa', 'Documentos, constancias y consultas para la administración.', 40, new.created_by),
    (new.id, 'complaint', 'Reclamo o convivencia', 'Ruidos, convivencia y otros reclamos comunitarios.', 50, new.created_by),
    (new.id, 'other', 'Otro', 'Solicitudes que no encajan en otra categoría.', 100, new.created_by)
  on conflict (condominium_id, code) do nothing;
  return new;
end;
$$;

create trigger condominiums_seed_service_request_categories
after insert on public.condominiums
for each row execute function public.seed_default_service_request_categories();

insert into public.service_request_categories (
  condominium_id,
  code,
  name,
  description,
  sort_order,
  created_by
)
select c.id, seed.code, seed.name, seed.description, seed.sort_order, c.created_by
from public.condominiums c
cross join (
  values
    ('maintenance', 'Mantenimiento', 'Reparaciones dentro de unidades o áreas comunes.', 10),
    ('common_area', 'Áreas comunes', 'Incidencias en ascensores, iluminación, piscina y otras áreas compartidas.', 20),
    ('access_security', 'Acceso y seguridad', 'Llaves, controles, portones, vigilancia y accesos.', 30),
    ('administrative', 'Consulta administrativa', 'Documentos, constancias y consultas para la administración.', 40),
    ('complaint', 'Reclamo o convivencia', 'Ruidos, convivencia y otros reclamos comunitarios.', 50),
    ('other', 'Otro', 'Solicitudes que no encajan en otra categoría.', 100)
) as seed(code, name, description, sort_order)
on conflict (condominium_id, code) do nothing;

create function public.service_request_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger service_request_comments_append_only
before update or delete on public.service_request_comments
for each row execute function public.service_request_append_only();
create trigger service_request_attachments_append_only
before update or delete on public.service_request_attachments
for each row execute function public.service_request_append_only();
create trigger service_request_events_append_only
before update or delete on public.service_request_events
for each row execute function public.service_request_append_only();

revoke execute on function public.seed_default_service_request_categories() from public;
revoke execute on function public.service_request_append_only() from public;

create function public.create_service_request(
  target_condominium uuid,
  target_unit uuid,
  target_category uuid,
  request_title text,
  request_description text,
  request_priority public.service_request_priority default 'normal',
  target_requester uuid default null
)
returns public.service_requests
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  requester public.people;
  created public.service_requests;
  is_staff boolean;
begin
  if auth.uid() is null or not public.can_read_condominium(target_condominium) then
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
$$;

create function public.update_service_request(
  target_condominium uuid,
  target_request uuid,
  next_status public.service_request_status default null,
  next_priority public.service_request_priority default null,
  target_category uuid default null,
  target_assignee uuid default null,
  clear_assignee boolean default false,
  due_on timestamptz default null,
  clear_due boolean default false,
  resolution text default null,
  expected_version integer default null
)
returns public.service_requests
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_request public.service_requests;
  updated_request public.service_requests;
  resolved_status public.service_request_status;
  resolved_priority public.service_request_priority;
  resolved_category uuid;
  resolved_assignee uuid;
  resolved_due timestamptz;
  resolved_summary text;
  status_event public.service_request_event_type;
begin
  if auth.uid() is null or not public.can_manage_service_requests(target_condominium) then
    raise exception 'request management denied';
  end if;

  select * into current_request
  from public.service_requests r
  where r.id = target_request
    and r.condominium_id = target_condominium
  for update;

  if current_request.id is null then
    raise exception 'request not found';
  end if;
  if current_request.status in ('closed', 'cancelled') then
    raise exception 'request lifecycle is final';
  end if;
  if expected_version is not null and current_request.version <> expected_version then
    raise exception 'request version conflict';
  end if;
  if target_assignee is not null and clear_assignee then
    raise exception 'invalid assignee change';
  end if;
  if due_on is not null and clear_due then
    raise exception 'invalid due date change';
  end if;

  resolved_status := coalesce(next_status, current_request.status);
  resolved_priority := coalesce(next_priority, current_request.priority);
  resolved_category := coalesce(target_category, current_request.category_id);
  resolved_assignee := case
    when clear_assignee then null
    when target_assignee is not null then target_assignee
    else current_request.assigned_to_user_id
  end;
  resolved_due := case
    when clear_due then null
    when due_on is not null then due_on
    else current_request.due_at
  end;
  resolved_summary := case
    when resolution is not null then nullif(trim(resolution), '')
    when current_request.status = 'resolved' and resolved_status = 'in_progress' then null
    else current_request.resolution_summary
  end;

  if not public.service_request_transition_allowed(current_request.status, resolved_status) then
    raise exception 'invalid request transition';
  end if;
  if target_category is not null and not exists (
    select 1
    from public.service_request_categories c
    where c.id = target_category
      and c.condominium_id = target_condominium
      and c.is_active
  ) then
    raise exception 'invalid request category';
  end if;
  if resolved_assignee is not null
    and not public.is_valid_service_request_assignee(target_condominium, resolved_assignee) then
    raise exception 'invalid request assignee';
  end if;
  if next_status = 'cancelled' then
    raise exception 'use cancel_service_request for cancellations';
  end if;
  if resolution is not null and resolved_status not in ('resolved', 'closed') then
    raise exception 'resolution summary is only valid for resolved requests';
  end if;
  if resolved_status = 'resolved' and coalesce(char_length(resolved_summary), 0) < 3 then
    raise exception 'resolution summary required';
  end if;
  if resolved_status = 'closed' and current_request.status <> 'resolved' then
    raise exception 'only resolved requests can be closed';
  end if;
  if next_status is null
    and next_priority is null
    and target_category is null
    and target_assignee is null
    and not clear_assignee
    and due_on is null
    and not clear_due
    and resolution is null then
    raise exception 'no request changes supplied';
  end if;

  update public.service_requests
  set status = resolved_status,
      priority = resolved_priority,
      category_id = resolved_category,
      assigned_to_user_id = resolved_assignee,
      due_at = resolved_due,
      resolution_summary = resolved_summary,
      acknowledged_at = case
        when current_request.status <> 'acknowledged' and resolved_status = 'acknowledged'
          then coalesce(current_request.acknowledged_at, now())
        else current_request.acknowledged_at
      end,
      started_at = case
        when current_request.status <> 'in_progress' and resolved_status = 'in_progress'
          then coalesce(current_request.started_at, now())
        else current_request.started_at
      end,
      resolved_at = case
        when resolved_status = 'resolved' and current_request.status <> 'resolved' then now()
        when current_request.status = 'resolved' and resolved_status = 'in_progress' then null
        else current_request.resolved_at
      end,
      closed_at = case
        when resolved_status = 'closed' and current_request.status <> 'closed' then now()
        else current_request.closed_at
      end,
      cancelled_at = case
        when resolved_status = 'cancelled' and current_request.status <> 'cancelled' then now()
        else current_request.cancelled_at
      end,
      version = current_request.version + 1,
      updated_at = now()
  where id = current_request.id
  returning * into updated_request;

  if updated_request.status <> current_request.status then
    status_event := case
      when updated_request.status = 'resolved' then 'resolved'
      when updated_request.status = 'cancelled' then 'cancelled'
      when current_request.status = 'resolved' and updated_request.status = 'in_progress' then 'reopened'
      else 'status_changed'
    end;
    insert into public.service_request_events (
      condominium_id, request_id, event_type, actor_user_id, from_value, to_value
    ) values (
      target_condominium,
      updated_request.id,
      status_event,
      auth.uid(),
      jsonb_build_object('status', current_request.status),
      jsonb_build_object('status', updated_request.status, 'resolution_summary', updated_request.resolution_summary)
    );
  end if;

  if updated_request.priority <> current_request.priority then
    insert into public.service_request_events (
      condominium_id, request_id, event_type, actor_user_id, from_value, to_value
    ) values (
      target_condominium,
      updated_request.id,
      'priority_changed',
      auth.uid(),
      jsonb_build_object('priority', current_request.priority),
      jsonb_build_object('priority', updated_request.priority)
    );
  end if;

  if updated_request.category_id <> current_request.category_id then
    insert into public.service_request_events (
      condominium_id, request_id, event_type, actor_user_id, from_value, to_value
    ) values (
      target_condominium,
      updated_request.id,
      'category_changed',
      auth.uid(),
      jsonb_build_object('category_id', current_request.category_id),
      jsonb_build_object('category_id', updated_request.category_id)
    );
  end if;

  if updated_request.assigned_to_user_id is distinct from current_request.assigned_to_user_id then
    insert into public.service_request_events (
      condominium_id,
      request_id,
      event_type,
      visibility,
      actor_user_id,
      from_value,
      to_value
    ) values (
      target_condominium,
      updated_request.id,
      case when updated_request.assigned_to_user_id is null then 'unassigned' else 'assigned' end,
      'internal',
      auth.uid(),
      jsonb_build_object('assigned_to_user_id', current_request.assigned_to_user_id),
      jsonb_build_object('assigned_to_user_id', updated_request.assigned_to_user_id)
    );
  end if;

  if updated_request.due_at is distinct from current_request.due_at then
    insert into public.service_request_events (
      condominium_id, request_id, event_type, actor_user_id, from_value, to_value
    ) values (
      target_condominium,
      updated_request.id,
      'due_date_changed',
      auth.uid(),
      jsonb_build_object('due_at', current_request.due_at),
      jsonb_build_object('due_at', updated_request.due_at)
    );
  end if;

  return updated_request;
end;
$$;

create function public.cancel_service_request(
  target_condominium uuid,
  target_request uuid,
  reason text
)
returns public.service_requests
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_request public.service_requests;
  cancelled_request public.service_requests;
begin
  if auth.uid() is null or char_length(trim(reason)) not between 3 and 500 then
    raise exception 'invalid cancellation';
  end if;

  select * into current_request
  from public.service_requests r
  where r.id = target_request
    and r.condominium_id = target_condominium
  for update;

  if current_request.id is null or not public.can_access_service_request(current_request.id) then
    raise exception 'request access denied';
  end if;
  if not public.can_manage_service_requests(target_condominium)
    and current_request.submitted_by_user_id <> auth.uid()
    and not exists (
      select 1 from public.people p
      where p.id = current_request.requester_person_id
        and p.auth_user_id = auth.uid()
    ) then
    raise exception 'request cancellation denied';
  end if;
  if current_request.status in ('resolved', 'closed', 'cancelled') then
    raise exception 'request cannot be cancelled';
  end if;

  update public.service_requests
  set status = 'cancelled',
      resolution_summary = trim(reason),
      cancelled_at = now(),
      version = version + 1,
      updated_at = now()
  where id = current_request.id
  returning * into cancelled_request;

  insert into public.service_request_events (
    condominium_id, request_id, event_type, actor_user_id, from_value, to_value
  ) values (
    target_condominium,
    cancelled_request.id,
    'cancelled',
    auth.uid(),
    jsonb_build_object('status', current_request.status),
    jsonb_build_object('status', 'cancelled', 'reason', trim(reason))
  );

  return cancelled_request;
end;
$$;

create function public.add_service_request_comment(
  target_condominium uuid,
  target_request uuid,
  comment_body text,
  comment_visibility public.service_request_visibility default 'public'
)
returns public.service_request_comments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  request_row public.service_requests;
  created public.service_request_comments;
begin
  if auth.uid() is null or char_length(trim(comment_body)) not between 1 and 5000 then
    raise exception 'invalid request comment';
  end if;

  select * into request_row
  from public.service_requests r
  where r.id = target_request
    and r.condominium_id = target_condominium;

  if request_row.id is null or not public.can_access_service_request(request_row.id) then
    raise exception 'request access denied';
  end if;
  if comment_visibility = 'internal'
    and not public.can_manage_service_requests(target_condominium) then
    raise exception 'internal comment denied';
  end if;
  if request_row.status in ('closed', 'cancelled')
    and not public.can_manage_service_requests(target_condominium) then
    raise exception 'request comments closed';
  end if;

  insert into public.service_request_comments (
    condominium_id,
    request_id,
    author_user_id,
    body,
    visibility
  ) values (
    target_condominium,
    target_request,
    auth.uid(),
    trim(comment_body),
    comment_visibility
  ) returning * into created;

  insert into public.service_request_events (
    condominium_id,
    request_id,
    event_type,
    visibility,
    actor_user_id,
    metadata
  ) values (
    target_condominium,
    target_request,
    'comment_added',
    comment_visibility,
    auth.uid(),
    jsonb_build_object('comment_id', created.id)
  );

  return created;
end;
$$;

revoke execute on function public.create_service_request(uuid, uuid, uuid, text, text, public.service_request_priority, uuid) from public;
revoke execute on function public.update_service_request(uuid, uuid, public.service_request_status, public.service_request_priority, uuid, uuid, boolean, timestamptz, boolean, text, integer) from public;
revoke execute on function public.cancel_service_request(uuid, uuid, text) from public;
revoke execute on function public.add_service_request_comment(uuid, uuid, text, public.service_request_visibility) from public;
grant execute on function public.create_service_request(uuid, uuid, uuid, text, text, public.service_request_priority, uuid) to authenticated, service_role;
grant execute on function public.update_service_request(uuid, uuid, public.service_request_status, public.service_request_priority, uuid, uuid, boolean, timestamptz, boolean, text, integer) to authenticated, service_role;
grant execute on function public.cancel_service_request(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.add_service_request_comment(uuid, uuid, text, public.service_request_visibility) to authenticated, service_role;

alter table public.service_request_categories enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_request_comments enable row level security;
alter table public.service_request_attachments enable row level security;
alter table public.service_request_events enable row level security;

create policy service_request_categories_read on public.service_request_categories
for select
using (public.can_read_condominium(condominium_id));
create policy service_request_categories_insert on public.service_request_categories
for insert
with check (public.can_manage_service_requests(condominium_id));
create policy service_request_categories_update on public.service_request_categories
for update
using (public.can_manage_service_requests(condominium_id))
with check (public.can_manage_service_requests(condominium_id));

create policy service_requests_read on public.service_requests
for select
using (public.can_access_service_request(id));

create policy service_request_comments_read on public.service_request_comments
for select
using (
  public.can_access_service_request(request_id)
  and (
    visibility = 'public'
    or public.can_read_internal_service_requests(condominium_id)
  )
);

create policy service_request_attachments_read on public.service_request_attachments
for select
using (
  public.can_access_service_request(request_id)
  and (
    visibility = 'public'
    or public.can_read_internal_service_requests(condominium_id)
  )
);

create policy service_request_events_read on public.service_request_events
for select
using (
  public.can_access_service_request(request_id)
  and (
    visibility = 'public'
    or public.can_read_internal_service_requests(condominium_id)
  )
);
