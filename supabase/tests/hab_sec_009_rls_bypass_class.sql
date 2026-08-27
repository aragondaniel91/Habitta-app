begin;
select plan(2);

/*
 * The same grant mistake surfaced three times in this audit: HAB-SEC-001 revoked from
 * `public, authenticated` and forgot `anon`; HAB-SEC-008 and HAB-SEC-009 revoked from
 * `public, anon` and forgot `authenticated`. Naming each function is how the fourth one gets
 * missed, so this pins the *shape* instead.
 *
 * A function that turns RLS off and performs no authorization of its own must not be reachable by
 * a client role -- unless it is on the list below, where each entry states why it is safe.
 */
select is(
  (select coalesce(array_agg(p.proname order by p.proname), '{}')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and p.prorettype <> 'trigger'::regtype::oid
     and exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c ilike 'row_security=off')
     and pg_get_functiondef(p.oid) !~* 'can_[a-z_]+\(|is_organization_owner|is_platform_admin|auth\.uid\(\)|auth\.role\(\)'
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     and p.proname not in (
       -- Public by design: a certificate is verified by whoever it is handed to.
       'verify_solvency_certificate',
       -- Token-gated by design: you read the invitation before you have an account.
       'get_admin_invitation_preview',
       'get_resident_invitation_preview',
       'get_customer_invitation_preview',
       -- Pure predicates over ids the caller already supplied. They return a boolean and write
       -- nothing, and are used from checks and triggers rather than as endpoints.
       'announcement_audience_valid',
       'is_valid_assembly_action_assignee',
       'is_valid_maintenance_assignee',
       'is_valid_service_request_assignee',
       -- Verified by probe during the audit: each rejects a caller from another condominium
       -- through a helper this pattern cannot see (governance manager required, review denied,
       -- assembly not found).
       'create_governance_proposal_v2',
       'preview_payment_allocation',
       'capture_assembly_eligibility'
     )),
  '{}'::name[],
  'no RLS-bypassing function without its own authorization is reachable by anon or authenticated'
);

-- The allowlist must not become a place to hide a new function. Every entry has to still exist.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname in (
     'verify_solvency_certificate','get_admin_invitation_preview','get_resident_invitation_preview',
     'get_customer_invitation_preview',
     'announcement_audience_valid','is_valid_assembly_action_assignee','is_valid_maintenance_assignee',
     'is_valid_service_request_assignee','create_governance_proposal_v2','preview_payment_allocation',
     'capture_assembly_eligibility')),
  11::bigint,
  'every allowlisted exemption still names a real function'
);

select * from finish();
rollback;
