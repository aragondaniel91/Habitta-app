#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="$(docker ps --format '{{.ID}} {{.Names}}' | awk '$2 ~ /^supabase_db_/ {print $1; exit}')"
if [[ -z "${DB_CONTAINER}" ]]; then
  echo 'HAB-322: local Supabase database container not found' >&2
  exit 1
fi

psql_exec() {
  docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

OWNER_A='32200000-0000-4000-8000-000000000001'
OWNER_B='32200000-0000-4000-8000-000000000002'
ORG_A='32210000-0000-4000-8000-000000000001'
ORG_B='32210000-0000-4000-8000-000000000002'
CONDO_A='32220000-0000-4000-8000-000000000001'
CONDO_B='32220000-0000-4000-8000-000000000002'
CONCEPT_A='32230000-0000-4000-8000-000000000001'
CONCEPT_B='32230000-0000-4000-8000-000000000002'
BATCH_A='32240000-0000-4000-8000-000000000001'
BATCH_B='32240000-0000-4000-8000-000000000002'

psql_exec <<SQL
insert into auth.users(id, email)
values
  ('${OWNER_A}', 'hab322-owner-a@example.com'),
  ('${OWNER_B}', 'hab322-owner-b@example.com');

insert into public.organizations(id, name, created_by)
values
  ('${ORG_A}', 'HAB-322 Organization A', '${OWNER_A}'),
  ('${ORG_B}', 'HAB-322 Organization B', '${OWNER_B}');

insert into public.condominiums(id, organization_id, name, created_by)
values
  ('${CONDO_A}', '${ORG_A}', 'Residencia HAB 322 A', '${OWNER_A}'),
  ('${CONDO_B}', '${ORG_B}', 'Residencia HAB 322 B', '${OWNER_B}');

insert into public.organization_memberships(organization_id, user_id, role)
values
  ('${ORG_A}', '${OWNER_A}', 'organization_owner'),
  ('${ORG_B}', '${OWNER_B}', 'organization_owner');

insert into public.condominium_memberships(condominium_id, user_id, role)
values
  ('${CONDO_A}', '${OWNER_A}', 'condominium_admin'),
  ('${CONDO_B}', '${OWNER_B}', 'condominium_admin');

insert into public.charge_concepts(
  id, condominium_id, code, name, category, default_currency_code, default_amount, is_active, created_by
)
values
  ('${CONCEPT_A}', '${CONDO_A}', 'hab322-a', 'HAB-322 Concept A', 'regular_dues', 'USD', 10.00, true, '${OWNER_A}'),
  ('${CONCEPT_B}', '${CONDO_B}', 'hab322-b', 'HAB-322 Concept B', 'regular_dues', 'USD', 10.00, true, '${OWNER_B}');

insert into public.charge_batches(
  id, condominium_id, concept_id, name, period, issue_date, due_date, currency_code,
  distribution_method, status, idempotency_key, posted_at, posted_by, created_by
)
values (
  '${BATCH_A}', '${CONDO_A}', '${CONCEPT_A}', 'HAB-322 posted batch A', '2026-08',
  '2026-08-01', '2026-08-10', 'USD', 'fixed_per_unit', 'posted', 'hab322-target-posted',
  now(), '${OWNER_A}', '${OWNER_A}'
);
SQL

PURGE_LOG="$(mktemp)"
PURGE_PID=''
cleanup() {
  if [[ -n "${PURGE_PID}" ]] && kill -0 "${PURGE_PID}" 2>/dev/null; then
    kill "${PURGE_PID}" 2>/dev/null || true
    wait "${PURGE_PID}" 2>/dev/null || true
  fi
  rm -f "${PURGE_LOG}"
}
trap cleanup EXIT

(
  psql_exec <<SQL
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub','${OWNER_A}','role','authenticated','email','hab322-owner-a@example.com')::text,
  true
);
select count(*)
from public.request_condominium_deletion(
  '${CONDO_A}',
  'ELIMINAR Residencia HAB 322 A'
);
reset role;
select pg_sleep(5) /* hab322_hold_after_purge */;
commit;
SQL
) >"${PURGE_LOG}" 2>&1 &
PURGE_PID=$!

# Wait until the destructive RPC has returned but its transaction is intentionally still open.
# Any ACCESS EXCLUSIVE locks taken by the old implementation would still be held at this point.
READY=0
for _ in $(seq 1 100); do
  if ! kill -0 "${PURGE_PID}" 2>/dev/null; then
    echo 'HAB-322: purge connection exited before concurrency probe' >&2
    cat "${PURGE_LOG}" >&2
    exit 1
  fi
  ACTIVE="$(psql_exec -c "select count(*) from pg_catalog.pg_stat_activity where pid <> pg_backend_pid() and state='active' and query like '%hab322_hold_after_purge%';")"
  if [[ "${ACTIVE}" -gt 0 ]]; then
    READY=1
    break
  fi
  sleep 0.1
done

if [[ "${READY}" -ne 1 ]]; then
  echo 'HAB-322: purge transaction never reached the hold point' >&2
  cat "${PURGE_LOG}" >&2
  exit 1
fi

# This insert touches the same shared table but a different condominium. It must not wait behind
# the purge transaction. The old ALTER TABLE ... DISABLE TRIGGER USER implementation times out here.
psql_exec <<SQL
set lock_timeout = '750ms';
set statement_timeout = '2s';
insert into public.charge_batches(
  id, condominium_id, concept_id, name, period, issue_date, due_date, currency_code,
  distribution_method, status, idempotency_key, created_by
)
values (
  '${BATCH_B}', '${CONDO_B}', '${CONCEPT_B}', 'HAB-322 unrelated batch B', '2026-08',
  '2026-08-01', '2026-08-10', 'USD', 'fixed_per_unit', 'draft', 'hab322-unrelated-write', '${OWNER_B}'
);
SQL

if ! wait "${PURGE_PID}"; then
  PURGE_PID=''
  echo 'HAB-322: purge transaction failed' >&2
  cat "${PURGE_LOG}" >&2
  exit 1
fi
PURGE_PID=''

TARGET_COUNT="$(psql_exec -c "select count(*) from public.condominiums where id='${CONDO_A}';")"
OTHER_COUNT="$(psql_exec -c "select count(*) from public.charge_batches where id='${BATCH_B}' and condominium_id='${CONDO_B}';")"
if [[ "${TARGET_COUNT}" -ne 0 || "${OTHER_COUNT}" -ne 1 ]]; then
  echo "HAB-322: post-concurrency invariants failed target=${TARGET_COUNT} other_batch=${OTHER_COUNT}" >&2
  exit 1
fi

echo 'HAB-322 concurrency regression passed: unrelated tenant write was not blocked by purge.'
