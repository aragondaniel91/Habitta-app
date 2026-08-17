create table if not exists public.condominium_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  condominium_name text not null,
  requested_by uuid not null,
  storage_keys text[] not null default '{}'::text[],
  storage_cleanup_status text not null default 'pending'
    check (storage_cleanup_status in ('pending', 'completed', 'failed')),
  storage_cleanup_error text,
  requested_at timestamptz not null default now(),
  database_deleted_at timestamptz,
  storage_cleanup_completed_at timestamptz
);

alter table public.condominium_deletion_jobs enable row level security;
revoke all on table public.condominium_deletion_jobs from public, anon, authenticated;

create or replace function public.request_condominium_deletion(
  target_condominium_id uuid,
  confirmation_value text
)
returns table (
  job_id uuid,
  deleted_condominium_id uuid,
  deleted_condominium_name text,
  storage_object_count integer
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
begin
  if caller_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select c.organization_id, c.name
    into target_organization_id, target_condominium_name
  from public.condominiums c
  join public.organization_memberships om
    on om.organization_id = c.organization_id
   and om.user_id = caller_user_id
   and om.role = 'organization_owner'::public.organization_role
  where c.id = target_condominium_id;

  if target_organization_id is null then
    raise exception 'Organization owner required' using errcode = '42501';
  end if;

  expected_confirmation := 'ELIMINAR ' || target_condominium_name;
  if confirmation_value is distinct from expected_confirmation then
    raise exception 'Confirmation does not match condominium name' using errcode = '22023';
  end if;

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

  -- Financial tables intentionally use NO ACTION to prevent accidental history loss.
  -- The dedicated owner-only deletion path must remove them from leaf to root.
  delete from public.receivable_ledger_entries where condominium_id = target_condominium_id;
  delete from public.payment_allocations where condominium_id = target_condominium_id;
  delete from public.payment_events where condominium_id = target_condominium_id;
  delete from public.payment_receipts where condominium_id = target_condominium_id;
  delete from public.payment_proofs where condominium_id = target_condominium_id;
  delete from public.payments where condominium_id = target_condominium_id;
  delete from public.late_fee_charges where condominium_id = target_condominium_id;
  delete from public.receivable_items where condominium_id = target_condominium_id;
  delete from public.recurring_charge_runs where condominium_id = target_condominium_id;
  delete from public.charge_batches where condominium_id = target_condominium_id;
  delete from public.payment_receipt_sequences where condominium_id = target_condominium_id;
  delete from public.opening_balance_imports where condominium_id = target_condominium_id;
  delete from public.people_imports where condominium_id = target_condominium_id;

  -- Notification history also uses NO ACTION so normal tenant deletion cannot erase it by accident.
  delete from public.notification_deliveries where condominium_id = target_condominium_id;
  delete from public.notifications where condominium_id = target_condominium_id;
  delete from public.notification_events where condominium_id = target_condominium_id;
  delete from public.notification_preferences where condominium_id = target_condominium_id;
  delete from public.condominium_notification_settings where condominium_id = target_condominium_id;
  delete from public.condominium_late_fee_settings where condominium_id = target_condominium_id;

  -- Integration outbox is RESTRICT by design; purge only inside this explicit destructive operation.
  delete from public.integration_outbox where condominium_id = target_condominium_id;

  -- Everything else tenant-scoped must either cascade or fail this transaction closed.
  delete from public.condominiums where id = target_condominium_id;

  update public.condominium_deletion_jobs
     set database_deleted_at = now()
   where id = deletion_job_id;

  return query
  select
    deletion_job_id,
    target_condominium_id,
    target_condominium_name,
    coalesce(array_length(object_keys, 1), 0);
end;
$$;

revoke execute on function public.request_condominium_deletion(uuid, text) from public, anon;
grant execute on function public.request_condominium_deletion(uuid, text) to authenticated;

create or replace function public.get_condominium_deletion_storage_keys(target_job_id uuid)
returns text[]
language sql
security definer
set search_path = ''
as $$
  select j.storage_keys
  from public.condominium_deletion_jobs j
  where j.id = target_job_id
    and j.database_deleted_at is not null
    and j.storage_cleanup_status <> 'completed';
$$;

revoke execute on function public.get_condominium_deletion_storage_keys(uuid) from public, anon, authenticated;
grant execute on function public.get_condominium_deletion_storage_keys(uuid) to service_role;

create or replace function public.finish_condominium_deletion_storage_cleanup(
  target_job_id uuid,
  cleanup_succeeded boolean,
  cleanup_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.condominium_deletion_jobs
     set storage_cleanup_status = case when cleanup_succeeded then 'completed' else 'failed' end,
         storage_cleanup_error = case
           when cleanup_succeeded then null
           else left(coalesce(cleanup_error, 'R2 cleanup failed'), 500)
         end,
         storage_cleanup_completed_at = case when cleanup_succeeded then now() else null end,
         storage_keys = case when cleanup_succeeded then '{}'::text[] else storage_keys end
   where id = target_job_id
     and database_deleted_at is not null;
end;
$$;

revoke execute on function public.finish_condominium_deletion_storage_cleanup(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.finish_condominium_deletion_storage_cleanup(uuid, boolean, text)
  to service_role;
