-- Private operational documents for expenses, governance, service requests and announcements.
-- Binary objects remain private in Cloudflare R2; PostgreSQL stores immutable metadata only.

create table public.expense_attachments (
  id uuid primary key,
  expense_id uuid not null,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  document_type text not null default 'support'
    check (document_type in ('invoice', 'receipt', 'quote', 'support', 'other')),
  storage_key text not null unique check (char_length(storage_key) between 3 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (char_length(content_type) between 3 and 150),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (expense_id, condominium_id)
    references public.expenses(id, condominium_id) on delete cascade
);

create index expense_attachments_expense_idx
  on public.expense_attachments (expense_id, created_at, id);

alter table public.governance_attachments
  alter column url drop not null,
  add column storage_key text,
  add column content_type text,
  add column size_bytes bigint,
  add column sha256 text;

alter table public.governance_attachments
  add constraint governance_attachments_storage_key_length
    check (storage_key is null or char_length(storage_key) between 3 and 500),
  add constraint governance_attachments_content_type_length
    check (content_type is null or char_length(content_type) between 3 and 150),
  add constraint governance_attachments_size
    check (size_bytes is null or size_bytes between 1 and 20971520),
  add constraint governance_attachments_sha256
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  add constraint governance_attachments_source
    check (
      (
        url is not null
        and storage_key is null
        and content_type is null
        and size_bytes is null
        and sha256 is null
      )
      or (
        url is null
        and storage_key is not null
        and content_type is not null
        and size_bytes is not null
        and sha256 is not null
      )
    );

create unique index governance_attachments_storage_key_unique
  on public.governance_attachments (storage_key)
  where storage_key is not null;

create index governance_attachments_proposal_idx
  on public.governance_attachments (proposal_id, created_at, id);

create function public.private_document_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger expense_attachments_append_only
before update or delete on public.expense_attachments
for each row execute function public.private_document_append_only();

create trigger governance_attachments_append_only
before update or delete on public.governance_attachments
for each row execute function public.private_document_append_only();

alter table public.expense_attachments enable row level security;

create policy expense_attachments_read on public.expense_attachments
for select using (public.can_read_expenses(condominium_id));

revoke all on public.expense_attachments from anon, authenticated;
grant select on public.expense_attachments to authenticated;
grant select on public.governance_attachments to authenticated;

create function public.record_expense_attachment(
  target_condominium uuid,
  target_expense uuid,
  target_attachment uuid,
  document_kind text,
  key_value text,
  filename text,
  mime text,
  bytes bigint,
  hash text
)
returns public.expense_attachments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.expense_attachments;
begin
  if auth.uid() is null or not public.can_manage_expenses(target_condominium) then
    raise exception 'expense attachment upload denied';
  end if;

  if not exists (
    select 1 from public.expenses e
    where e.id = target_expense and e.condominium_id = target_condominium
  ) then
    raise exception 'expense not found';
  end if;

  if document_kind not in ('invoice', 'receipt', 'quote', 'support', 'other')
    or key_value <> format('expenses/%s', target_attachment)
    or char_length(trim(filename)) not between 1 and 255
    or char_length(mime) not between 3 and 150
    or bytes not between 1 and 20971520
    or hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid expense attachment metadata';
  end if;

  insert into public.expense_attachments (
    id, expense_id, condominium_id, document_type, storage_key,
    original_filename, content_type, size_bytes, sha256, uploaded_by
  ) values (
    target_attachment, target_expense, target_condominium, document_kind, key_value,
    trim(filename), mime, bytes, hash, auth.uid()
  ) returning * into created;

  insert into public.expense_events (
    expense_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_expense,
    target_condominium,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'change', 'attachment_added',
      'attachment_id', created.id,
      'document_type', created.document_type,
      'file_name', created.original_filename
    )
  );

  return created;
end;
$$;

create function public.record_governance_attachment(
  target_condominium uuid,
  target_proposal uuid,
  target_attachment uuid,
  document_kind text,
  key_value text,
  filename text,
  mime text,
  bytes bigint,
  hash text
)
returns public.governance_attachments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.governance_attachments;
begin
  if auth.uid() is null or not public.can_manage_governance(target_condominium) then
    raise exception 'governance attachment upload denied';
  end if;

  if not exists (
    select 1 from public.governance_proposals p
    where p.id = target_proposal and p.condominium_id = target_condominium
  ) then
    raise exception 'proposal not found';
  end if;

  if document_kind not in ('quote', 'budget', 'support', 'minutes', 'other')
    or key_value <> format('governance/%s', target_attachment)
    or char_length(trim(filename)) not between 1 and 255
    or char_length(mime) not between 3 and 150
    or bytes not between 1 and 20971520
    or hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid governance attachment metadata';
  end if;

  insert into public.governance_attachments (
    id, proposal_id, condominium_id, document_type, file_name, url,
    storage_key, content_type, size_bytes, sha256, created_by
  ) values (
    target_attachment, target_proposal, target_condominium, document_kind, trim(filename), null,
    key_value, mime, bytes, hash, auth.uid()
  ) returning * into created;

  return created;
end;
$$;

create function public.record_service_request_attachment(
  target_condominium uuid,
  target_request uuid,
  target_comment uuid,
  target_attachment uuid,
  key_value text,
  filename text,
  mime text,
  bytes bigint,
  hash text,
  attachment_visibility public.service_request_visibility default 'public'
)
returns public.service_request_attachments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  request_row public.service_requests;
  created public.service_request_attachments;
  manager boolean;
begin
  if auth.uid() is null then raise exception 'request attachment upload denied'; end if;

  select * into request_row
  from public.service_requests r
  where r.id = target_request and r.condominium_id = target_condominium;
  if request_row.id is null or not public.can_access_service_request(target_request) then
    raise exception 'request attachment upload denied';
  end if;

  manager := public.can_manage_service_requests(target_condominium);
  if attachment_visibility = 'internal' and not manager then
    raise exception 'internal request attachment denied';
  end if;
  if request_row.status in ('closed', 'cancelled') and not manager then
    raise exception 'request is closed';
  end if;
  if target_comment is not null and not exists (
    select 1 from public.service_request_comments c
    where c.id = target_comment
      and c.request_id = target_request
      and c.condominium_id = target_condominium
  ) then
    raise exception 'request comment not found';
  end if;

  if key_value <> format('requests/%s', target_attachment)
    or char_length(trim(filename)) not between 1 and 255
    or char_length(mime) not between 3 and 150
    or bytes not between 1 and 20971520
    or hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid request attachment metadata';
  end if;

  insert into public.service_request_attachments (
    id, condominium_id, request_id, comment_id, storage_key,
    original_filename, content_type, size_bytes, sha256, visibility, uploaded_by
  ) values (
    target_attachment, target_condominium, target_request, target_comment, key_value,
    trim(filename), mime, bytes, hash, attachment_visibility, auth.uid()
  ) returning * into created;

  insert into public.service_request_events (
    condominium_id, request_id, event_type, visibility, actor_user_id, metadata
  ) values (
    target_condominium,
    target_request,
    'attachment_added',
    attachment_visibility,
    auth.uid(),
    jsonb_build_object(
      'attachment_id', created.id,
      'comment_id', created.comment_id,
      'file_name', created.original_filename
    )
  );

  return created;
end;
$$;

create function public.record_announcement_attachment(
  target_condominium uuid,
  target_announcement uuid,
  target_attachment uuid,
  key_value text,
  filename text,
  mime text,
  bytes bigint,
  hash text
)
returns public.announcement_attachments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  announcement_row public.announcements;
  created public.announcement_attachments;
begin
  if auth.uid() is null or not public.can_manage_announcements(target_condominium) then
    raise exception 'announcement attachment upload denied';
  end if;

  select * into announcement_row
  from public.announcements a
  where a.id = target_announcement and a.condominium_id = target_condominium;
  if announcement_row.id is null then raise exception 'announcement not found'; end if;
  if announcement_row.status not in ('draft', 'scheduled') then
    raise exception 'published announcement attachments are immutable';
  end if;

  if key_value <> format('announcements/%s', target_attachment)
    or char_length(trim(filename)) not between 1 and 255
    or char_length(mime) not between 3 and 150
    or bytes not between 1 and 20971520
    or hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid announcement attachment metadata';
  end if;

  insert into public.announcement_attachments (
    id, announcement_id, condominium_id, storage_key,
    original_filename, content_type, size_bytes, sha256, uploaded_by
  ) values (
    target_attachment, target_announcement, target_condominium, key_value,
    trim(filename), mime, bytes, hash, auth.uid()
  ) returning * into created;

  insert into public.announcement_events (
    announcement_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    target_announcement,
    target_condominium,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'change', 'attachment_added',
      'attachment_id', created.id,
      'file_name', created.original_filename
    )
  );

  return created;
end;
$$;

revoke execute on function public.private_document_append_only() from public;
revoke execute on function public.record_expense_attachment(uuid, uuid, uuid, text, text, text, text, bigint, text) from public;
revoke execute on function public.record_governance_attachment(uuid, uuid, uuid, text, text, text, text, bigint, text) from public;
revoke execute on function public.record_service_request_attachment(uuid, uuid, uuid, uuid, text, text, text, bigint, text, public.service_request_visibility) from public;
revoke execute on function public.record_announcement_attachment(uuid, uuid, uuid, text, text, text, bigint, text) from public;

grant execute on function public.record_expense_attachment(uuid, uuid, uuid, text, text, text, text, bigint, text) to authenticated, service_role;
grant execute on function public.record_governance_attachment(uuid, uuid, uuid, text, text, text, text, bigint, text) to authenticated, service_role;
grant execute on function public.record_service_request_attachment(uuid, uuid, uuid, uuid, text, text, text, bigint, text, public.service_request_visibility) to authenticated, service_role;
grant execute on function public.record_announcement_attachment(uuid, uuid, uuid, text, text, text, bigint, text) to authenticated, service_role;
