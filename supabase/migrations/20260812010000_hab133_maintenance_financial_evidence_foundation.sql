-- HAB-133: close the remaining maintenance operational gaps without duplicating
-- accounting or storage. Quotes belong to work orders, evidence remains private in
-- R2 with immutable PostgreSQL metadata, and expenses are linked by reference only.

create table public.maintenance_quotes (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  work_order_id uuid not null,
  vendor_id uuid not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  reference text check (reference is null or char_length(trim(reference)) between 1 and 160),
  valid_until date,
  notes text check (notes is null or char_length(notes) <= 3000),
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'superseded')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text check (
    decision_note is null or char_length(trim(decision_note)) between 3 and 2000
  ),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, condominium_id),
  unique (id, condominium_id, work_order_id),
  foreign key (work_order_id, condominium_id)
    references public.maintenance_work_orders(id, condominium_id) on delete cascade,
  foreign key (vendor_id, condominium_id)
    references public.vendors(id, condominium_id),
  check (
    (status = 'submitted' and decided_by is null and decided_at is null and decision_note is null)
    or (status in ('approved', 'rejected') and decided_by is not null and decided_at is not null)
    or (status = 'superseded' and decided_at is not null)
  )
);

create unique index maintenance_quotes_one_approved_per_order
  on public.maintenance_quotes (work_order_id)
  where status = 'approved';
create index maintenance_quotes_work_order_idx
  on public.maintenance_quotes (work_order_id, status, created_at desc);
create index maintenance_quotes_vendor_idx
  on public.maintenance_quotes (condominium_id, vendor_id, created_at desc);

create table public.maintenance_attachments (
  id uuid primary key,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  work_order_id uuid not null,
  quote_id uuid,
  document_type text not null
    check (document_type in ('quote', 'completion_photo', 'completion_document', 'invoice', 'support', 'other')),
  storage_key text not null unique check (char_length(storage_key) between 3 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null check (char_length(content_type) between 3 and 150),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (work_order_id, condominium_id)
    references public.maintenance_work_orders(id, condominium_id) on delete cascade,
  foreign key (quote_id, condominium_id, work_order_id)
    references public.maintenance_quotes(id, condominium_id, work_order_id),
  check (document_type <> 'quote' or quote_id is not null)
);

create index maintenance_attachments_work_order_idx
  on public.maintenance_attachments (work_order_id, created_at, id);
create index maintenance_attachments_quote_idx
  on public.maintenance_attachments (quote_id, created_at, id)
  where quote_id is not null;

create table public.maintenance_work_order_expenses (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  work_order_id uuid not null,
  expense_id uuid not null,
  quote_id uuid,
  linked_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (work_order_id, expense_id),
  foreign key (work_order_id, condominium_id)
    references public.maintenance_work_orders(id, condominium_id) on delete cascade,
  foreign key (expense_id, condominium_id)
    references public.expenses(id, condominium_id),
  foreign key (quote_id, condominium_id, work_order_id)
    references public.maintenance_quotes(id, condominium_id, work_order_id)
);

create index maintenance_work_order_expenses_order_idx
  on public.maintenance_work_order_expenses (work_order_id, created_at, id);
create index maintenance_work_order_expenses_expense_idx
  on public.maintenance_work_order_expenses (expense_id, created_at, id);

create function public.can_approve_maintenance(target uuid)
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
        and cm.role = 'condominium_admin'
    );
$$;

create function public.maintenance_operational_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create trigger maintenance_attachments_append_only
before update or delete on public.maintenance_attachments
for each row execute function public.maintenance_operational_append_only();

create trigger maintenance_work_order_expenses_append_only
before update or delete on public.maintenance_work_order_expenses
for each row execute function public.maintenance_operational_append_only();

alter table public.maintenance_quotes enable row level security;
alter table public.maintenance_attachments enable row level security;
alter table public.maintenance_work_order_expenses enable row level security;

create policy maintenance_quotes_read on public.maintenance_quotes
for select using (public.can_read_maintenance(condominium_id));
create policy maintenance_attachments_read on public.maintenance_attachments
for select using (public.can_read_maintenance(condominium_id));
create policy maintenance_work_order_expenses_read on public.maintenance_work_order_expenses
for select using (
  public.can_read_maintenance(condominium_id)
  and public.can_read_expenses(condominium_id)
);

revoke all on public.maintenance_quotes, public.maintenance_attachments,
  public.maintenance_work_order_expenses from anon, authenticated;
grant select on public.maintenance_quotes, public.maintenance_attachments,
  public.maintenance_work_order_expenses to authenticated;

create function public.create_maintenance_quote(
  target_condominium uuid,
  target_work_order uuid,
  target_vendor uuid,
  quote_amount numeric,
  quote_currency text,
  reference_value text default null,
  valid_until_value date default null,
  notes_value text default null
)
returns public.maintenance_quotes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_order public.maintenance_work_orders;
  created public.maintenance_quotes;
  normalized_currency text := upper(trim(quote_currency));
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance management denied';
  end if;

  select * into current_order
  from public.maintenance_work_orders w
  where w.id = target_work_order and w.condominium_id = target_condominium;

  if current_order.id is null then
    raise exception 'maintenance work order not found';
  end if;
  if current_order.status in ('completed', 'cancelled') then
    raise exception 'closed maintenance work order cannot accept quotes';
  end if;
  if quote_amount is null or quote_amount <= 0
    or normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid maintenance quote amount';
  end if;
  if valid_until_value is not null and valid_until_value < current_date then
    raise exception 'maintenance quote is already expired';
  end if;
  if not exists (
    select 1 from public.vendors v
    where v.id = target_vendor
      and v.condominium_id = target_condominium
      and v.is_active
  ) then
    raise exception 'invalid maintenance vendor';
  end if;

  insert into public.maintenance_quotes (
    condominium_id, work_order_id, vendor_id, amount, currency_code,
    reference, valid_until, notes, created_by
  ) values (
    target_condominium, target_work_order, target_vendor, quote_amount, normalized_currency,
    nullif(trim(reference_value), ''), valid_until_value, nullif(trim(notes_value), ''), auth.uid()
  ) returning * into created;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    target_condominium,
    'work_order',
    target_work_order,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'change', 'quote_submitted',
      'quote_id', created.id,
      'vendor_id', created.vendor_id,
      'amount', created.amount,
      'currency_code', created.currency_code
    )
  );

  return created;
end;
$$;

create function public.decide_maintenance_quote(
  target_condominium uuid,
  target_quote uuid,
  decision text,
  decision_note_value text default null
)
returns public.maintenance_quotes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_quote public.maintenance_quotes;
  updated_quote public.maintenance_quotes;
  normalized_note text := nullif(trim(decision_note_value), '');
begin
  if auth.uid() is null or not public.can_approve_maintenance(target_condominium) then
    raise exception 'maintenance approval denied';
  end if;

  select * into current_quote
  from public.maintenance_quotes q
  where q.id = target_quote and q.condominium_id = target_condominium
  for update;

  if current_quote.id is null then
    raise exception 'maintenance quote not found';
  end if;
  if current_quote.status <> 'submitted' then
    raise exception 'maintenance quote already decided';
  end if;
  if decision not in ('approve', 'reject') then
    raise exception 'invalid maintenance quote decision';
  end if;
  if decision = 'approve'
    and current_quote.valid_until is not null
    and current_quote.valid_until < current_date then
    raise exception 'expired maintenance quote cannot be approved';
  end if;
  if decision = 'reject' and coalesce(char_length(normalized_note), 0) < 3 then
    raise exception 'maintenance quote rejection note required';
  end if;

  if decision = 'approve' then
    update public.maintenance_quotes
    set status = 'superseded',
        decided_at = now(),
        decision_note = 'Superseded by approved quote',
        updated_at = now()
    where work_order_id = current_quote.work_order_id
      and condominium_id = target_condominium
      and id <> current_quote.id
      and status = 'submitted';
  end if;

  update public.maintenance_quotes
  set status = case when decision = 'approve' then 'approved' else 'rejected' end,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_note = normalized_note,
      updated_at = now()
  where id = current_quote.id
  returning * into updated_quote;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    target_condominium,
    'work_order',
    updated_quote.work_order_id,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'change', case when decision = 'approve' then 'quote_approved' else 'quote_rejected' end,
      'quote_id', updated_quote.id,
      'vendor_id', updated_quote.vendor_id,
      'amount', updated_quote.amount,
      'currency_code', updated_quote.currency_code,
      'note', normalized_note
    )
  );

  return updated_quote;
end;
$$;

create function public.record_maintenance_attachment(
  target_condominium uuid,
  target_work_order uuid,
  target_quote uuid,
  target_attachment uuid,
  document_kind text,
  key_value text,
  filename text,
  mime text,
  bytes bigint,
  hash text
)
returns public.maintenance_attachments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created public.maintenance_attachments;
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then
    raise exception 'maintenance attachment upload denied';
  end if;
  if not exists (
    select 1 from public.maintenance_work_orders w
    where w.id = target_work_order and w.condominium_id = target_condominium
  ) then
    raise exception 'maintenance work order not found';
  end if;
  if target_quote is not null and not exists (
    select 1 from public.maintenance_quotes q
    where q.id = target_quote
      and q.condominium_id = target_condominium
      and q.work_order_id = target_work_order
  ) then
    raise exception 'maintenance quote not found';
  end if;
  if document_kind not in ('quote', 'completion_photo', 'completion_document', 'invoice', 'support', 'other')
    or (document_kind = 'quote' and target_quote is null)
    or key_value <> format('maintenance/%s', target_attachment)
    or char_length(trim(filename)) not between 1 and 255
    or char_length(mime) not between 3 and 150
    or bytes not between 1 and 20971520
    or hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid maintenance attachment metadata';
  end if;

  insert into public.maintenance_attachments (
    id, condominium_id, work_order_id, quote_id, document_type, storage_key,
    original_filename, content_type, size_bytes, sha256, uploaded_by
  ) values (
    target_attachment, target_condominium, target_work_order, target_quote, document_kind, key_value,
    trim(filename), mime, bytes, hash, auth.uid()
  ) returning * into created;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    target_condominium,
    'work_order',
    target_work_order,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'change', 'attachment_added',
      'attachment_id', created.id,
      'quote_id', created.quote_id,
      'document_type', created.document_type,
      'file_name', created.original_filename
    )
  );

  return created;
end;
$$;

create function public.link_maintenance_expense(
  target_condominium uuid,
  target_work_order uuid,
  target_expense uuid,
  target_quote uuid default null
)
returns public.maintenance_work_order_expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expense_row public.expenses;
  created public.maintenance_work_order_expenses;
begin
  if auth.uid() is null
    or not public.can_manage_maintenance(target_condominium)
    or not public.can_manage_expenses(target_condominium) then
    raise exception 'maintenance expense link denied';
  end if;
  if not exists (
    select 1 from public.maintenance_work_orders w
    where w.id = target_work_order and w.condominium_id = target_condominium
  ) then
    raise exception 'maintenance work order not found';
  end if;

  select * into expense_row
  from public.expenses e
  where e.id = target_expense and e.condominium_id = target_condominium;

  if expense_row.id is null or expense_row.status = 'void' then
    raise exception 'invalid maintenance expense';
  end if;
  if target_quote is not null and not exists (
    select 1 from public.maintenance_quotes q
    where q.id = target_quote
      and q.condominium_id = target_condominium
      and q.work_order_id = target_work_order
      and q.status = 'approved'
  ) then
    raise exception 'approved maintenance quote required';
  end if;

  insert into public.maintenance_work_order_expenses (
    condominium_id, work_order_id, expense_id, quote_id, linked_by
  ) values (
    target_condominium, target_work_order, target_expense, target_quote, auth.uid()
  )
  on conflict (work_order_id, expense_id) do update
    set quote_id = coalesce(public.maintenance_work_order_expenses.quote_id, excluded.quote_id)
  returning * into created;

  insert into public.maintenance_events (
    condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    target_condominium,
    'work_order',
    target_work_order,
    'updated',
    auth.uid(),
    jsonb_build_object(
      'change', 'expense_linked',
      'expense_id', created.expense_id,
      'quote_id', created.quote_id,
      'amount', expense_row.amount,
      'currency_code', expense_row.currency_code
    )
  );

  return created;
end;
$$;

create function public.maintenance_work_order_has_completion_evidence(
  target_condominium uuid,
  target_work_order uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.can_read_maintenance(target_condominium) then
    raise exception 'maintenance reader required';
  end if;

  return exists (
    select 1 from public.maintenance_attachments a
    where a.condominium_id = target_condominium
      and a.work_order_id = target_work_order
      and a.document_type in ('completion_photo', 'completion_document')
  );
end;
$$;

revoke execute on function public.can_approve_maintenance(uuid) from public, anon;
revoke execute on function public.maintenance_operational_append_only() from public, anon, authenticated;
revoke execute on function public.create_maintenance_quote(uuid, uuid, uuid, numeric, text, text, date, text) from public, anon;
revoke execute on function public.decide_maintenance_quote(uuid, uuid, text, text) from public, anon;
revoke execute on function public.record_maintenance_attachment(uuid, uuid, uuid, uuid, text, text, text, text, bigint, text) from public, anon;
revoke execute on function public.link_maintenance_expense(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.maintenance_work_order_has_completion_evidence(uuid, uuid) from public, anon;

grant execute on function public.can_approve_maintenance(uuid) to authenticated, service_role;
grant execute on function public.create_maintenance_quote(uuid, uuid, uuid, numeric, text, text, date, text) to authenticated, service_role;
grant execute on function public.decide_maintenance_quote(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.record_maintenance_attachment(uuid, uuid, uuid, uuid, text, text, text, text, bigint, text) to authenticated, service_role;
grant execute on function public.link_maintenance_expense(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.maintenance_work_order_has_completion_evidence(uuid, uuid) to authenticated, service_role;
