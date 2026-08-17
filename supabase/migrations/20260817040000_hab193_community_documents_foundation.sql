-- HAB-193: condominium-scoped Community Documents library foundation.
--
-- This is intentionally separate from private_documents, which remains the
-- transactional attachment system. Community Documents owns logical documents,
-- immutable versions, audience rules, retention metadata, related-record links,
-- and download audit. Binary objects remain private and are stored by the API in
-- the existing R2 binding.

create type public.community_document_audience as enum (
  'management',
  'owners',
  'residents'
);

create type public.community_document_status as enum (
  'active',
  'archived'
);

create type public.community_document_link_type as enum (
  'announcement',
  'service_request',
  'expense',
  'assembly',
  'proposal'
);

create table public.community_document_categories (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  default_audience public.community_document_audience not null default 'management',
  default_retention_days integer check (default_retention_days is null or default_retention_days > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id)
);

create unique index community_document_categories_name_unique
  on public.community_document_categories (condominium_id, lower(name));

create table public.community_document_folders (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  parent_folder_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (parent_folder_id, condominium_id)
    references public.community_document_folders(id, condominium_id)
);

create unique index community_document_folders_sibling_name_unique
  on public.community_document_folders (
    condominium_id,
    coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

create table public.community_documents (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  folder_id uuid,
  category_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text,
  audience public.community_document_audience not null default 'management',
  status public.community_document_status not null default 'active',
  retention_days integer check (retention_days is null or retention_days > 0),
  latest_version_number integer not null default 0 check (latest_version_number >= 0),
  created_by uuid not null references auth.users(id),
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  foreign key (folder_id, condominium_id)
    references public.community_document_folders(id, condominium_id),
  foreign key (category_id, condominium_id)
    references public.community_document_categories(id, condominium_id),
  check (
    (status = 'active' and archived_at is null and archived_by is null)
    or (status = 'archived' and archived_at is not null and archived_by is not null)
  )
);

create index community_documents_library_idx
  on public.community_documents (condominium_id, status, folder_id, category_id, updated_at desc);

create table public.community_document_versions (
  id uuid primary key,
  document_id uuid not null,
  condominium_id uuid not null,
  version_number integer not null check (version_number > 0),
  storage_key text not null unique,
  original_filename text not null check (char_length(trim(original_filename)) between 1 and 255),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  change_note text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (id, document_id, condominium_id),
  foreign key (document_id, condominium_id)
    references public.community_documents(id, condominium_id)
);

create index community_document_versions_document_idx
  on public.community_document_versions (document_id, version_number desc);

create table public.community_document_download_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  version_id uuid not null,
  condominium_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  occurred_at timestamptz not null default now(),
  foreign key (version_id, document_id, condominium_id)
    references public.community_document_versions(id, document_id, condominium_id)
);

create index community_document_download_events_document_idx
  on public.community_document_download_events (document_id, occurred_at desc);

create index community_document_download_events_actor_idx
  on public.community_document_download_events (actor_user_id, occurred_at desc);

create table public.community_document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  condominium_id uuid not null,
  target_type public.community_document_link_type not null,
  target_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, target_type, target_id),
  foreign key (document_id, condominium_id)
    references public.community_documents(id, condominium_id)
);

create index community_document_links_target_idx
  on public.community_document_links (condominium_id, target_type, target_id);

-- Organization owners and the existing administration/governance roles can
-- manage the library. payment_reviewer is intentionally excluded: reviewing a
-- payment is not sufficient privilege to publish community documents.
create function public.can_manage_community_documents(target_condominium_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_organization_owner_for_condominium(target_condominium_id)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target_condominium_id
        and cm.user_id = auth.uid()
        and cm.role in (
          'condominium_admin',
          'accountant',
          'assistant',
          'board_member'
        )
    );
$$;

create function public.can_read_community_document_scope(
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
    )
    when target_audience = 'residents' then public.can_read_condominium(target_condominium_id)
    else false
  end;
$$;

revoke execute on function public.can_manage_community_documents(uuid) from public;
revoke execute on function public.can_read_community_document_scope(
  uuid,
  public.community_document_audience,
  public.community_document_status
) from public;
grant execute on function public.can_manage_community_documents(uuid) to authenticated, service_role;
grant execute on function public.can_read_community_document_scope(
  uuid,
  public.community_document_audience,
  public.community_document_status
) to authenticated, service_role;

alter table public.community_document_categories enable row level security;
alter table public.community_document_folders enable row level security;
alter table public.community_documents enable row level security;
alter table public.community_document_versions enable row level security;
alter table public.community_document_download_events enable row level security;
alter table public.community_document_links enable row level security;

create policy community_document_categories_read
on public.community_document_categories
for select
using (
  public.can_read_condominium(condominium_id)
  and (is_active or public.can_manage_community_documents(condominium_id))
);

create policy community_document_folders_read
on public.community_document_folders
for select
using (
  public.can_read_condominium(condominium_id)
  and (is_active or public.can_manage_community_documents(condominium_id))
);

create policy community_documents_read
on public.community_documents
for select
using (
  public.can_read_community_document_scope(condominium_id, audience, status)
);

create policy community_document_versions_read
on public.community_document_versions
for select
using (
  exists (
    select 1
    from public.community_documents d
    where d.id = document_id
      and d.condominium_id = condominium_id
  )
);

create policy community_document_download_events_read
on public.community_document_download_events
for select
using (
  actor_user_id = auth.uid()
  or public.can_manage_community_documents(condominium_id)
);

create policy community_document_links_read
on public.community_document_links
for select
using (
  exists (
    select 1
    from public.community_documents d
    where d.id = document_id
      and d.condominium_id = condominium_id
  )
);

-- Application roles can read through RLS but cannot mutate tables directly.
-- Security-definer lifecycle functions below own every write.
grant select on public.community_document_categories to authenticated;
grant select on public.community_document_folders to authenticated;
grant select on public.community_documents to authenticated;
grant select on public.community_document_versions to authenticated;
grant select on public.community_document_download_events to authenticated;
grant select on public.community_document_links to authenticated;

revoke insert, update, delete on public.community_document_categories from anon, authenticated;
revoke insert, update, delete on public.community_document_folders from anon, authenticated;
revoke insert, update, delete on public.community_documents from anon, authenticated;
revoke insert, update, delete on public.community_document_versions from anon, authenticated;
revoke insert, update, delete on public.community_document_download_events from anon, authenticated;
revoke insert, update, delete on public.community_document_links from anon, authenticated;

create function public.reject_community_document_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'community document history is immutable';
end;
$$;

revoke execute on function public.reject_community_document_history_mutation() from public;

create trigger community_document_versions_immutable
before update or delete on public.community_document_versions
for each row execute function public.reject_community_document_history_mutation();

create trigger community_document_download_events_immutable
before update or delete on public.community_document_download_events
for each row execute function public.reject_community_document_history_mutation();

create function public.reject_community_document_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'community documents must be archived, not deleted';
end;
$$;

revoke execute on function public.reject_community_document_delete() from public;

create trigger community_documents_no_delete
before delete on public.community_documents
for each row execute function public.reject_community_document_delete();

create function public.create_community_document_category(
  target_condominium_id uuid,
  target_name text,
  target_description text default null,
  target_default_audience public.community_document_audience default 'management',
  target_default_retention_days integer default null
)
returns public.community_document_categories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.community_document_categories;
begin
  if auth.uid() is null or not public.can_manage_community_documents(target_condominium_id) then
    raise exception 'community document manager required';
  end if;

  if char_length(trim(coalesce(target_name, ''))) not between 1 and 120 then
    raise exception 'invalid category name';
  end if;

  if target_default_retention_days is not null and target_default_retention_days <= 0 then
    raise exception 'invalid retention days';
  end if;

  insert into public.community_document_categories (
    condominium_id,
    name,
    description,
    default_audience,
    default_retention_days,
    created_by
  ) values (
    target_condominium_id,
    trim(target_name),
    nullif(trim(coalesce(target_description, '')), ''),
    target_default_audience,
    target_default_retention_days,
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;

create function public.create_community_document_folder(
  target_condominium_id uuid,
  target_name text,
  target_parent_folder_id uuid default null,
  target_description text default null
)
returns public.community_document_folders
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.community_document_folders;
begin
  if auth.uid() is null or not public.can_manage_community_documents(target_condominium_id) then
    raise exception 'community document manager required';
  end if;

  if char_length(trim(coalesce(target_name, ''))) not between 1 and 120 then
    raise exception 'invalid folder name';
  end if;

  if target_parent_folder_id is not null and not exists (
    select 1
    from public.community_document_folders f
    where f.id = target_parent_folder_id
      and f.condominium_id = target_condominium_id
      and f.is_active
  ) then
    raise exception 'active parent folder required';
  end if;

  insert into public.community_document_folders (
    condominium_id,
    parent_folder_id,
    name,
    description,
    created_by
  ) values (
    target_condominium_id,
    target_parent_folder_id,
    trim(target_name),
    nullif(trim(coalesce(target_description, '')), ''),
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;

create function public.create_community_document(
  target_condominium_id uuid,
  target_title text,
  target_description text default null,
  target_folder_id uuid default null,
  target_category_id uuid default null,
  target_audience public.community_document_audience default 'management',
  target_retention_days integer default null
)
returns public.community_documents
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.community_documents;
begin
  if auth.uid() is null or not public.can_manage_community_documents(target_condominium_id) then
    raise exception 'community document manager required';
  end if;

  if char_length(trim(coalesce(target_title, ''))) not between 1 and 200 then
    raise exception 'invalid document title';
  end if;

  if target_retention_days is not null and target_retention_days <= 0 then
    raise exception 'invalid retention days';
  end if;

  if target_folder_id is not null and not exists (
    select 1
    from public.community_document_folders f
    where f.id = target_folder_id
      and f.condominium_id = target_condominium_id
      and f.is_active
  ) then
    raise exception 'active folder required';
  end if;

  if target_category_id is not null and not exists (
    select 1
    from public.community_document_categories c
    where c.id = target_category_id
      and c.condominium_id = target_condominium_id
      and c.is_active
  ) then
    raise exception 'active category required';
  end if;

  insert into public.community_documents (
    condominium_id,
    folder_id,
    category_id,
    title,
    description,
    audience,
    retention_days,
    created_by
  ) values (
    target_condominium_id,
    target_folder_id,
    target_category_id,
    trim(target_title),
    nullif(trim(coalesce(target_description, '')), ''),
    target_audience,
    target_retention_days,
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;

create function public.record_community_document_version(
  target_document_id uuid,
  target_version_id uuid,
  target_original_filename text,
  target_content_type text,
  target_size_bytes bigint,
  target_sha256 text,
  target_storage_key text,
  target_change_note text default null
)
returns public.community_document_versions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_document public.community_documents;
  next_version integer;
  expected_storage_key text;
  created public.community_document_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into target_document
  from public.community_documents d
  where d.id = target_document_id
  for update;

  if target_document.id is null
    or not public.can_manage_community_documents(target_document.condominium_id)
  then
    raise exception 'community document manager required';
  end if;

  if target_document.status <> 'active' then
    raise exception 'active document required';
  end if;

  if target_version_id is null then
    raise exception 'version id required';
  end if;

  if char_length(trim(coalesce(target_original_filename, ''))) not between 1 and 255 then
    raise exception 'invalid file name';
  end if;

  if target_content_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported content type';
  end if;

  if target_size_bytes is null or target_size_bytes <= 0 or target_size_bytes > 10485760 then
    raise exception 'invalid file size';
  end if;

  if target_sha256 is null or target_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sha256';
  end if;

  expected_storage_key := format(
    'community-documents/%s/%s/%s',
    target_document.condominium_id,
    target_document.id,
    target_version_id
  );

  if target_storage_key is distinct from expected_storage_key then
    raise exception 'invalid community document storage key';
  end if;

  next_version := target_document.latest_version_number + 1;

  insert into public.community_document_versions (
    id,
    document_id,
    condominium_id,
    version_number,
    storage_key,
    original_filename,
    content_type,
    size_bytes,
    sha256,
    change_note,
    uploaded_by
  ) values (
    target_version_id,
    target_document.id,
    target_document.condominium_id,
    next_version,
    target_storage_key,
    trim(target_original_filename),
    target_content_type,
    target_size_bytes,
    target_sha256,
    nullif(trim(coalesce(target_change_note, '')), ''),
    auth.uid()
  )
  returning * into created;

  update public.community_documents
  set latest_version_number = next_version,
      updated_at = now()
  where id = target_document.id;

  return created;
end;
$$;

create function public.archive_community_document(target_document_id uuid)
returns public.community_documents
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_document public.community_documents;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into target_document
  from public.community_documents d
  where d.id = target_document_id
  for update;

  if target_document.id is null
    or not public.can_manage_community_documents(target_document.condominium_id)
  then
    raise exception 'community document manager required';
  end if;

  if target_document.status = 'archived' then
    return target_document;
  end if;

  update public.community_documents
  set status = 'archived',
      archived_by = auth.uid(),
      archived_at = now(),
      updated_at = now()
  where id = target_document.id
  returning * into target_document;

  return target_document;
end;
$$;

create function public.record_community_document_download(
  target_document_id uuid,
  target_version_id uuid
)
returns public.community_document_download_events
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_document public.community_documents;
  target_version public.community_document_versions;
  created public.community_document_download_events;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into target_document
  from public.community_documents d
  where d.id = target_document_id;

  if target_document.id is null
    or not public.can_read_community_document_scope(
      target_document.condominium_id,
      target_document.audience,
      target_document.status
    )
  then
    raise exception 'community document access denied';
  end if;

  select *
  into target_version
  from public.community_document_versions v
  where v.id = target_version_id
    and v.document_id = target_document.id
    and v.condominium_id = target_document.condominium_id;

  if target_version.id is null then
    raise exception 'community document version not found';
  end if;

  insert into public.community_document_download_events (
    document_id,
    version_id,
    condominium_id,
    actor_user_id
  ) values (
    target_document.id,
    target_version.id,
    target_document.condominium_id,
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;

create function public.link_community_document(
  target_document_id uuid,
  target_type public.community_document_link_type,
  target_id uuid
)
returns public.community_document_links
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_document public.community_documents;
  target_exists boolean := false;
  created public.community_document_links;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into target_document
  from public.community_documents d
  where d.id = target_document_id;

  if target_document.id is null
    or not public.can_manage_community_documents(target_document.condominium_id)
  then
    raise exception 'community document manager required';
  end if;

  case target_type
    when 'announcement' then
      select exists (
        select 1 from public.announcements a
        where a.id = target_id and a.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'service_request' then
      select exists (
        select 1 from public.service_requests r
        where r.id = target_id and r.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'expense' then
      select exists (
        select 1 from public.expenses e
        where e.id = target_id and e.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'assembly' then
      select exists (
        select 1 from public.assemblies a
        where a.id = target_id and a.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'proposal' then
      select exists (
        select 1 from public.governance_proposals p
        where p.id = target_id and p.condominium_id = target_document.condominium_id
      ) into target_exists;
  end case;

  if not target_exists then
    raise exception 'related record not found in condominium';
  end if;

  insert into public.community_document_links (
    document_id,
    condominium_id,
    target_type,
    target_id,
    created_by
  ) values (
    target_document.id,
    target_document.condominium_id,
    target_type,
    target_id,
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;

revoke execute on function public.create_community_document_category(
  uuid, text, text, public.community_document_audience, integer
) from public;
revoke execute on function public.create_community_document_folder(uuid, text, uuid, text) from public;
revoke execute on function public.create_community_document(
  uuid, text, text, uuid, uuid, public.community_document_audience, integer
) from public;
revoke execute on function public.record_community_document_version(
  uuid, uuid, text, text, bigint, text, text, text
) from public;
revoke execute on function public.archive_community_document(uuid) from public;
revoke execute on function public.record_community_document_download(uuid, uuid) from public;
revoke execute on function public.link_community_document(
  uuid, public.community_document_link_type, uuid
) from public;

grant execute on function public.create_community_document_category(
  uuid, text, text, public.community_document_audience, integer
) to authenticated, service_role;
grant execute on function public.create_community_document_folder(uuid, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.create_community_document(
  uuid, text, text, uuid, uuid, public.community_document_audience, integer
) to authenticated, service_role;
grant execute on function public.record_community_document_version(
  uuid, uuid, text, text, bigint, text, text, text
) to authenticated, service_role;
grant execute on function public.archive_community_document(uuid) to authenticated, service_role;
grant execute on function public.record_community_document_download(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.link_community_document(
  uuid, public.community_document_link_type, uuid
) to authenticated, service_role;
