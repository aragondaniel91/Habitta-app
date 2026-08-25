-- HAB-322: eliminate global table locks from condominium deletion.
--
-- Runtime tenant purge used to ALTER TABLE ... DISABLE TRIGGER USER on shared tables. PostgreSQL
-- holds those relation locks until transaction end, so deleting one condominium could stall writes
-- for every other tenant. This migration replaces that global switch with a non-forgeable internal
-- authorization scoped to one backend, one transaction and one condominium.

create schema if not exists habitta_internal;
revoke all on schema habitta_internal from public, anon, authenticated, service_role;

create table if not exists habitta_internal.condominium_purge_authorizations (
  backend_pid integer not null,
  transaction_id text not null,
  condominium_id uuid not null,
  unit_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default clock_timestamp(),
  primary key (backend_pid, transaction_id, condominium_id)
);

revoke all on table habitta_internal.condominium_purge_authorizations
  from public, anon, authenticated, service_role;

-- Read-only helpers are callable by runtime roles because existing trigger functions execute as the
-- invoking role. They cannot create authorization: the backing schema/table remains inaccessible.
create or replace function public.is_condominium_purge_authorized(target_condominium_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from habitta_internal.condominium_purge_authorizations authorization
    where authorization.backend_pid = pg_backend_pid()
      and authorization.transaction_id = pg_current_xact_id()::text
      and authorization.condominium_id = target_condominium_id
  );
$$;

create or replace function public.is_unit_condominium_purge_authorized(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from habitta_internal.condominium_purge_authorizations authorization
    where authorization.backend_pid = pg_backend_pid()
      and authorization.transaction_id = pg_current_xact_id()::text
      and target_unit_id = any(authorization.unit_ids)
  );
$$;

create or replace function public.has_condominium_purge_authorization()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from habitta_internal.condominium_purge_authorizations authorization
    where authorization.backend_pid = pg_backend_pid()
      and authorization.transaction_id = pg_current_xact_id()::text
  );
$$;

revoke all on function public.is_condominium_purge_authorized(uuid) from public, anon;
revoke all on function public.is_unit_condominium_purge_authorized(uuid) from public, anon;
revoke all on function public.has_condominium_purge_authorization() from public, anon;
grant execute on function public.is_condominium_purge_authorized(uuid) to authenticated, service_role;
grant execute on function public.is_unit_condominium_purge_authorized(uuid) to authenticated, service_role;
grant execute on function public.has_condominium_purge_authorization() to authenticated, service_role;

-- Append-only / immutable guards keep their normal behavior. The only new path is DELETE while the
-- current transaction holds the internal authorization for OLD.condominium_id.
create or replace function public.announcement_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create or replace function public.assert_assembly_action_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'assembly action item events are append-only';
end;
$$;

create or replace function public.assert_assembly_action_item_no_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'assembly action item history cannot be deleted';
end;
$$;

create or replace function public.assert_assembly_agenda_mutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.assembly_status;
  target_assembly_id uuid;
  target_condominium_id uuid;
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    target_assembly_id := old.assembly_id;
    target_condominium_id := old.condominium_id;
  else
    target_assembly_id := new.assembly_id;
    target_condominium_id := new.condominium_id;
  end if;

  select status into current_status
  from public.assemblies
  where id = target_assembly_id
    and condominium_id = target_condominium_id;

  if current_status not in ('draft', 'scheduled') then
    raise exception 'assembly agenda is frozen after the meeting starts';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.assert_assembly_snapshot_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'assembly eligibility snapshot is immutable';
end;
$$;

create or replace function public.assert_assembly_resolution_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

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

create or replace function public.reject_budget_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'budget history is immutable';
end;
$$;

create or replace function public.protect_posted_batch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  if old.status <> 'draft' then
    raise exception 'posted batches are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.reject_community_document_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'community document history is immutable';
end;
$$;

create or replace function public.reject_community_document_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'community documents must be archived, not deleted';
end;
$$;

create or replace function public.protect_exchange_rate_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'exchange rates are immutable';
  end if;
  if new.status = old.status then
    raise exception 'exchange rate snapshots are immutable';
  end if;
  if old.status <> 'approved' or new.status <> 'superseded' then
    raise exception 'invalid exchange rate transition';
  end if;
  if (new.condominium_id, new.from_currency_code, new.to_currency_code, new.rate,
      new.effective_on, new.rate_at, new.source, new.source_reference,
      new.created_by, new.approved_by, new.approved_at, new.created_at)
     is distinct from
     (old.condominium_id, old.from_currency_code, old.to_currency_code, old.rate,
      old.effective_on, old.rate_at, old.source, old.source_reference,
      old.created_by, old.approved_by, old.approved_at, old.created_at) then
    raise exception 'exchange rate snapshots are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.private_document_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create or replace function public.reject_governance_eligibility_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'governance eligibility snapshot is immutable';
end;
$$;

create or replace function public.reject_governance_event_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'governance event history is immutable';
end;
$$;

create or replace function public.guard_governance_option_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_proposal_id uuid := coalesce(new.proposal_id, old.proposal_id);
  proposal_status public.governance_proposal_status;
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  select status
  into proposal_status
  from public.governance_proposals
  where id = target_proposal_id;

  if proposal_status is distinct from 'draft'::public.governance_proposal_status then
    raise exception 'governance voting options are immutable after opening';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.reject_governance_ballot_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'governance ballot history is immutable';
end;
$$;

create or replace function public.maintenance_operational_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;

-- maintenance_events and maintenance_service_logs use statement-level guards. During the owner-only
-- RPC the transaction has exactly one internal authorization and the RPC itself only emits tenant-
-- filtered DELETE statements. The authorization is removed before returning to the caller.
create or replace function public.maintenance_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.has_condominium_purge_authorization() then
    return null;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create or replace function public.notification_delivery_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'notification deliveries are immutable';
  end if;

  if (new.id,
      new.condominium_id,
      new.event_id,
      new.recipient_user_id,
      new.recipient_email,
      new.channel,
      new.template_key,
      new.locale,
      new.payload,
      new.deduplication_key,
      new.created_at)
     is distinct from
     (old.id,
      old.condominium_id,
      old.event_id,
      old.recipient_user_id,
      old.recipient_email,
      old.channel,
      old.template_key,
      old.locale,
      old.payload,
      old.deduplication_key,
      old.created_at) then
    raise exception 'notification deliveries are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.notification_event_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'notification events are immutable';
  end if;

  if (new.id,
      new.condominium_id,
      new.event_type,
      new.aggregate_type,
      new.aggregate_id,
      new.unit_id,
      new.actor_user_id,
      new.payload,
      new.deduplication_key,
      new.created_at)
     is distinct from
     (old.id,
      old.condominium_id,
      old.event_type,
      old.aggregate_type,
      old.aggregate_id,
      old.unit_id,
      old.actor_user_id,
      old.payload,
      old.deduplication_key,
      old.created_at) then
    raise exception 'notification events are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.protect_ownership_transfer_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'ownership transfers are immutable';
end;
$$;

create or replace function public.payment_allocations_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'payment allocations are immutable';
end;
$$;

create or replace function public.payment_event_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'payment events are immutable';
end;
$$;

create or replace function public.protect_payment_proof_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'payment proofs cannot be deleted';
  end if;

  if old.superseded_at is not null
    or new.id <> old.id
    or new.condominium_id <> old.condominium_id
    or new.payment_id <> old.payment_id
    or new.object_key <> old.object_key
    or new.original_filename <> old.original_filename
    or new.content_type <> old.content_type
    or new.size_bytes <> old.size_bytes
    or new.sha256 <> old.sha256
    or new.uploaded_by <> old.uploaded_by
    or new.created_at <> old.created_at
    or new.superseded_at is null
    or new.superseded_by_proof_id is null then
    raise exception 'payment proof history is immutable';
  end if;

  return new;
end;
$$;

create or replace function public.payment_receipt_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'payment receipts are immutable';
end;
$$;

create or replace function public.payment_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'payments cannot be deleted';
  end if;

  if old.status = 'reversed' then
    raise exception 'financial payment is immutable';
  end if;

  if old.status = 'approved' and new.status <> 'reversed' then
    raise exception 'financial payment is immutable';
  end if;

  if new.treasury_account_id is distinct from old.treasury_account_id then
    if old.status not in ('submitted', 'under_review') then
      raise exception 'treasury account can only be selected during payment review';
    end if;

    if not public.can_review_payments(old.condominium_id) then
      raise exception 'payment treasury selection denied';
    end if;
  end if;

  if old.status not in ('draft', 'correction_requested')
     and (
       new.original_amount,
       new.original_currency_code,
       new.payment_method_id,
       new.payment_date,
       new.payer_name,
       new.reference,
       new.notes
     ) is distinct from (
       old.original_amount,
       old.original_currency_code,
       old.payment_method_id,
       old.payment_date,
       old.payer_name,
       old.reference,
       old.notes
     ) then
    raise exception 'submitted payment financial data is locked';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'ledger entries are immutable';
end;
$$;

create or replace function public.protect_posted_recurring_run()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  if old.status = 'posted' then
    raise exception 'posted recurring charge runs are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.service_request_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create or replace function public.protect_solvency_certificate_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'solvency certificates are immutable';
end;
$$;

create or replace function public.treasury_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception '% records are immutable', tg_table_name;
end;
$$;

create or replace function public.treasury_overdraft_authorization_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;
  raise exception 'treasury overdraft authorizations are immutable';
end;
$$;

create or replace function public.guard_unit_owner_history()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'DELETE' and public.is_unit_condominium_purge_authorized(old.unit_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'ownership history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if (new.unit_id, new.person_id, new.starts_at, new.ownership_percentage,
        new.is_primary_contact, new.created_by, new.created_at)
       is distinct from
       (old.unit_id, old.person_id, old.starts_at, old.ownership_percentage,
        old.is_primary_contact, old.created_by, old.created_at) then
      raise exception 'ownership history cannot be rewritten';
    end if;
    if old.ends_at is not null and new.ends_at is distinct from old.ends_at then
      raise exception 'closed ownership history cannot be changed';
    end if;
    if new.ends_at is not null and new.ends_at < old.starts_at then
      raise exception 'ownership end date cannot precede start date';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.request_condominium_deletion(
  target_condominium_id uuid,
  confirmation_value text
)
returns table (
  job_id uuid,
  deleted_condominium_id uuid,
  deleted_condominium_name text,
  storage_object_count integer,
  storage_keys text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  target_organization_id uuid;
  target_condominium_name text;
  expected_confirmation text;
  deletion_job_id uuid;
  object_keys text[];
  target_unit_ids uuid[];
  tenant_table text;
  deleted_rows bigint;
  made_progress boolean;
  authorization_transaction_id text;
begin
  if caller_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Lock only the target condominium row. Same-tenant FK inserts wait/fail while unrelated tenant
  -- rows remain writable; no shared application table receives an ACCESS EXCLUSIVE lock.
  select c.organization_id, c.name
    into target_organization_id, target_condominium_name
  from public.condominiums c
  join public.organization_memberships om
    on om.organization_id = c.organization_id
   and om.user_id = caller_user_id
   and om.role = 'organization_owner'::public.organization_role
  where c.id = target_condominium_id
  for update of c;

  if target_organization_id is null then
    raise exception 'Organization owner required' using errcode = '42501';
  end if;

  expected_confirmation := 'ELIMINAR ' || target_condominium_name;
  if confirmation_value is distinct from expected_confirmation then
    raise exception 'Confirmation does not match condominium name' using errcode = '22023';
  end if;

  select coalesce(array_agg(u.id order by u.id), '{}'::uuid[])
    into target_unit_ids
  from public.units u
  where u.condominium_id = target_condominium_id;

  select coalesce(array_agg(distinct storage_key order by storage_key), '{}'::text[])
    into object_keys
  from (
    select aa.storage_key
    from public.announcement_attachments aa
    where aa.condominium_id = target_condominium_id and aa.storage_key is not null
    union all
    select cdv.storage_key
    from public.community_document_versions cdv
    where cdv.condominium_id = target_condominium_id and cdv.storage_key is not null
    union all
    select ea.storage_key
    from public.expense_attachments ea
    where ea.condominium_id = target_condominium_id and ea.storage_key is not null
    union all
    select ga.storage_key
    from public.governance_attachments ga
    where ga.condominium_id = target_condominium_id and ga.storage_key is not null
    union all
    select ma.storage_key
    from public.maintenance_attachments ma
    where ma.condominium_id = target_condominium_id and ma.storage_key is not null
    union all
    select pp.object_key as storage_key
    from public.payment_proofs pp
    where pp.condominium_id = target_condominium_id and pp.object_key is not null
    union all
    select sra.storage_key
    from public.service_request_attachments sra
    where sra.condominium_id = target_condominium_id and sra.storage_key is not null
  ) keys;

  insert into public.condominium_deletion_jobs (
    condominium_id,
    organization_id,
    condominium_name,
    requested_by,
    storage_keys
  )
  values (
    target_condominium_id,
    target_organization_id,
    target_condominium_name,
    caller_user_id,
    object_keys
  )
  returning id into deletion_job_id;

  authorization_transaction_id := pg_current_xact_id()::text;
  insert into habitta_internal.condominium_purge_authorizations (
    backend_pid,
    transaction_id,
    condominium_id,
    unit_ids
  ) values (
    pg_backend_pid(),
    authorization_transaction_id,
    target_condominium_id,
    target_unit_ids
  );

  -- HAB-45 has the only cross-direction tenant FK cycle: the period points to its approved version
  -- while versions cascade from the period. Break only that nullable pointer inside this reset.
  update public.budget_periods
     set approved_version_id = null
   where condominium_id = target_condominium_id
     and approved_version_id is not null;

  -- Delete every tenant-scoped base table in dependency-resolvable passes. NO ACTION/RESTRICT
  -- failures are retried after child tables have been removed. Any non-FK error fails the entire
  -- transaction closed. The append-only triggers remain ENABLED throughout this operation.
  loop
    made_progress := false;

    for tenant_table in
      select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and a.attname = 'condominium_id'
        and not a.attisdropped
        and c.relname not in ('condominiums', 'condominium_deletion_jobs')
      order by c.relname
    loop
      begin
        execute pg_catalog.format(
          'delete from public.%I where condominium_id = $1',
          tenant_table
        ) using target_condominium_id;
        get diagnostics deleted_rows = row_count;
        if deleted_rows > 0 then
          made_progress := true;
        end if;
      exception
        when foreign_key_violation then
          null;
      end;
    end loop;

    exit when not made_progress;
  end loop;

  delete from public.condominiums where id = target_condominium_id;

  delete from habitta_internal.condominium_purge_authorizations authorization
  where authorization.backend_pid = pg_backend_pid()
    and authorization.transaction_id = authorization_transaction_id
    and authorization.condominium_id = target_condominium_id;

  if not found then
    raise exception 'Tenant purge authorization was lost' using errcode = '55000';
  end if;

  update public.condominium_deletion_jobs
     set database_deleted_at = now()
   where id = deletion_job_id;

  return query
  select
    deletion_job_id,
    target_condominium_id,
    target_condominium_name,
    coalesce(array_length(object_keys, 1), 0),
    object_keys;
end;
$$;

revoke execute on function public.request_condominium_deletion(uuid, text) from public, anon;
grant execute on function public.request_condominium_deletion(uuid, text) to authenticated;
