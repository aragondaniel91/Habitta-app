-- HAB-413: make the shipped condominium deletion work on a condominium that has owners.
--
-- `request_condominium_deletion` could not delete any condominium holding a `unit_owners` row,
-- which is every condominium where ownership was ever recorded. The purge loop enumerates tables by
-- looking for a `condominium_id` column; `unit_owners` and `unit_occupancies` are scoped through
-- `unit_id` instead, so the loop never issued a DELETE against them and the closing
-- `delete from public.condominiums` hit their NO ACTION foreign keys.
--
-- The rest of the machinery already anticipated these tables. The function collects
-- `target_unit_ids` and stores them in `habitta_internal.condominium_purge_authorizations`, and the
-- append-only guard on `unit_owners` permits DELETE precisely when
-- `is_unit_condominium_purge_authorized(old.unit_id)` holds. The authorization to remove ownership
-- history during a purge was designed, built and tested; the statement that would use it was
-- missing.
--
-- Written as a minimal delta on the body currently in the database: one declaration and one
-- additional pass inside the existing fixed-point loop. The owner check, the confirmation string,
-- the row lock, the storage manifest and the purge authorization are byte-for-byte unchanged.

CREATE OR REPLACE FUNCTION public.request_condominium_deletion(target_condominium_id uuid, confirmation_value text)
 RETURNS TABLE(job_id uuid, deleted_condominium_id uuid, deleted_condominium_name text, storage_object_count integer, storage_keys text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_user_id uuid := auth.uid();
  target_organization_id uuid;
  target_condominium_name text;
  expected_confirmation text;
  deletion_job_id uuid;
  object_keys text[];
  target_unit_ids uuid[];
  tenant_table text;
  tenant_column text;
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

    -- HAB-413: tables scoped through a unit rather than through a condominium. The pass above
    -- enumerates by the presence of a `condominium_id` column, so it never reached these, their
    -- NO ACTION foreign keys to `units` survived, and the closing delete of the condominium failed.
    -- That was the whole defect: `unit_owners` and `unit_occupancies` made the shipped deletion
    -- feature unusable on any condominium where ownership had ever been recorded.
    --
    -- Membership here is decided by foreign-key metadata, never by a column name. A future table
    -- with its own `unit_id` meaning something unrelated must not be swept into a tenant purge
    -- because it happened to pick that word. To qualify, a table carries a single-column foreign
    -- key pointing at `public.units(id)` itself, and is not already covered by the pass above.
    --
    -- No table currently needs an exemption. If one ever does, exclude it by name here rather than
    -- by loosening the rule, so that the exclusion is a decision somebody wrote down.
    for tenant_table, tenant_column in
      select c.relname, a.attname
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c on c.oid = con.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a
        on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      join pg_catalog.pg_attribute fa
        on fa.attrelid = con.confrelid and fa.attnum = con.confkey[1]
      where con.contype = 'f'
        and con.confrelid = 'public.units'::pg_catalog.regclass
        and fa.attname = 'id'
        and pg_catalog.array_length(con.conkey, 1) = 1
        and n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not a.attisdropped
        and not exists (
          select 1
          from pg_catalog.pg_attribute covered
          where covered.attrelid = c.oid
            and covered.attname = 'condominium_id'
            and not covered.attisdropped
        )
      order by c.relname, a.attname
    loop
      begin
        execute pg_catalog.format(
          'delete from public.%I where %I = any($1)',
          tenant_table,
          tenant_column
        ) using target_unit_ids;
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

  delete from habitta_internal.condominium_purge_authorizations purge_auth
  where purge_auth.backend_pid = pg_backend_pid()
    and purge_auth.transaction_id = authorization_transaction_id
    and purge_auth.condominium_id = target_condominium_id;

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
$function$;
