begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_schema('habitta_internal', 'tenant purge authorization lives outside the public API schema');
select has_table(
  'habitta_internal',
  'condominium_purge_authorizations',
  'internal transaction-scoped purge authorization table exists'
);
select has_function(
  'public',
  'is_condominium_purge_authorized',
  array['uuid'],
  'row-level immutable guards can verify the exact condominium authorization'
);
select has_function(
  'public',
  'is_unit_condominium_purge_authorized',
  array['uuid'],
  'unit ownership history can verify purge scope without a condominium_id column'
);
select has_function(
  'public',
  'has_condominium_purge_authorization',
  array[]::text[],
  'statement-level maintenance guards can detect the controlled purge transaction'
);

select ok(
  not has_table_privilege('authenticated', 'habitta_internal.condominium_purge_authorizations', 'SELECT')
  and not has_table_privilege('authenticated', 'habitta_internal.condominium_purge_authorizations', 'INSERT')
  and not has_table_privilege('authenticated', 'habitta_internal.condominium_purge_authorizations', 'UPDATE')
  and not has_table_privilege('authenticated', 'habitta_internal.condominium_purge_authorizations', 'DELETE'),
  'authenticated callers cannot forge or inspect purge authorization rows'
);

select ok(
  not public.is_condominium_purge_authorized('32200000-0000-4000-8000-000000000001'),
  'condominium purge authorization is false outside the owner-only deletion RPC'
);

select unlike(
  lower(pg_get_functiondef('public.request_condominium_deletion(uuid,text)'::regprocedure)),
  '%disable trigger%',
  'runtime deletion no longer disables USER triggers'
);
select unlike(
  lower(pg_get_functiondef('public.request_condominium_deletion(uuid,text)'::regprocedure)),
  '%enable trigger%',
  'runtime deletion no longer toggles USER triggers back on'
);
select like(
  lower(pg_get_functiondef('public.request_condominium_deletion(uuid,text)'::regprocedure)),
  '%for update of c%',
  'deletion locks only the target condominium row against same-tenant races'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'announcement_append_only',
        'assert_assembly_action_event_append_only',
        'assert_assembly_action_item_no_delete',
        'assert_assembly_agenda_mutable',
        'assert_assembly_snapshot_immutable',
        'assert_assembly_resolution_immutable',
        'reject_budget_history_mutation',
        'protect_posted_batch',
        'reject_community_document_history_mutation',
        'reject_community_document_delete',
        'protect_exchange_rate_history',
        'private_document_append_only',
        'reject_governance_eligibility_snapshot_mutation',
        'reject_governance_event_history_mutation',
        'guard_governance_option_immutability',
        'reject_governance_ballot_history_mutation',
        'maintenance_operational_append_only',
        'maintenance_append_only',
        'notification_delivery_guard',
        'notification_event_immutable',
        'protect_ownership_transfer_history',
        'payment_allocations_immutable',
        'payment_event_immutable',
        'protect_payment_proof_history',
        'payment_receipt_immutable',
        'payment_immutable',
        'prevent_ledger_mutation',
        'protect_posted_recurring_run',
        'service_request_append_only',
        'protect_solvency_certificate_history',
        'treasury_append_only',
        'treasury_overdraft_authorization_append_only',
        'guard_unit_owner_history'
      ])
      and p.prosrc ilike '%purge_author%'
  ),
  33,
  'all immutable/no-delete guards used by condominium purge require narrow authorization'
);

select like(
  pg_get_functiondef('public.guard_unit_owner_history()'::regprocedure),
  '%is_unit_condominium_purge_authorized%',
  'unit owner history uses captured target unit UUIDs rather than a global bypass'
);

select like(
  pg_get_functiondef('public.maintenance_append_only()'::regprocedure),
  '%has_condominium_purge_authorization%',
  'statement-level maintenance history only yields inside an authorized purge transaction'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and t.tgenabled <> 'O'
      and c.relname = any(array[
        'announcement_attachments','announcement_events','assembly_action_item_events',
        'assembly_action_items','assembly_agenda_items','assembly_eligibility_snapshots',
        'assembly_resolutions','budget_events','budget_lines','charge_batches',
        'community_document_download_events','community_document_versions','community_documents',
        'condominium_exchange_rates','expense_attachments','governance_attachments',
        'governance_eligibility_snapshots','governance_events','governance_options','governance_votes',
        'maintenance_attachments','maintenance_events','maintenance_service_logs',
        'maintenance_work_order_expenses','notification_deliveries','notification_events',
        'ownership_transfers','payment_allocations','payment_events','payment_proofs',
        'payment_receipts','payments','receivable_ledger_entries','recurring_charge_runs',
        'service_request_attachments','service_request_comments','service_request_events',
        'service_requests','solvency_certificates','treasury_events','treasury_movements',
        'treasury_overdraft_authorizations','treasury_reconciliation_items','treasury_transfers',
        'unit_owners'
      ])
  ),
  0,
  'shared tenant-table USER triggers remain enabled after migration'
);

select is(
  (select count(*)::integer from habitta_internal.condominium_purge_authorizations),
  0,
  'no purge authorization exists at rest'
);

select ok(
  position('condominium_id = target_condominium_id' in pg_get_functiondef('public.request_condominium_deletion(uuid,text)'::regprocedure)) > 0,
  'dynamic purge deletes remain tenant-filtered'
);

select * from finish();
rollback;
