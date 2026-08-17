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
  protected_table text;
  tenant_table text;
  deleted_rows bigint;
  made_progress boolean;
  protected_tables constant text[] := array[
    'announcement_attachments',
    'announcement_events',
    'assembly_action_item_events',
    'assembly_action_items',
    'assembly_agenda_items',
    'assembly_eligibility_snapshots',
    'assembly_resolutions',
    'budget_events',
    'budget_lines',
    'charge_batches',
    'community_document_download_events',
    'community_document_versions',
    'community_documents',
    'condominium_exchange_rates',
    'expense_attachments',
    'governance_attachments',
    'governance_eligibility_snapshots',
    'governance_events',
    'governance_options',
    'governance_votes',
    'maintenance_attachments',
    'maintenance_events',
    'maintenance_service_logs',
    'maintenance_work_order_expenses',
    'notification_deliveries',
    'notification_events',
    'ownership_transfers',
    'payment_allocations',
    'payment_events',
    'payment_proofs',
    'payment_receipts',
    'payments',
    'receivable_ledger_entries',
    'recurring_charge_runs',
    'service_request_attachments',
    'service_request_comments',
    'service_request_events',
    'service_requests',
    'solvency_certificates',
    'treasury_events',
    'treasury_movements',
    'treasury_overdraft_authorizations',
    'treasury_reconciliation_items',
    'treasury_transfers',
    'unit_owners'
  ];
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

  -- The reset is the only operation allowed to bypass append-only USER triggers. ALTER TABLE is
  -- transactional and locks these tables while disabled. Internal FK triggers remain enabled.
  foreach protected_table in array protected_tables loop
    execute pg_catalog.format('alter table public.%I disable trigger user', protected_table);
  end loop;

  -- HAB-45 has the only cross-direction tenant FK cycle: the period points to its approved version
  -- while versions cascade from the period. Break only that nullable pointer inside this reset.
  update public.budget_periods
     set approved_version_id = null
   where condominium_id = target_condominium_id
     and approved_version_id is not null;

  -- Delete every tenant-scoped base table in dependency-resolvable passes. NO ACTION/RESTRICT
  -- failures are retried after their child tables have been removed. Any other database error is
  -- not swallowed. If a future dependency cannot be resolved, the final condominium delete fails
  -- closed and rolls the entire transaction back.
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

  foreach protected_table in array protected_tables loop
    execute pg_catalog.format('alter table public.%I enable trigger user', protected_table);
  end loop;

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
