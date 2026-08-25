from pathlib import Path

path = Path('supabase/migrations/20260825041500_hab322_tenant_purge_no_global_locks.sql')
text = path.read_text()
text = text.replace(
    'from habitta_internal.condominium_purge_authorizations authorization',
    'from habitta_internal.condominium_purge_authorizations purge_auth',
)
text = text.replace(
    'delete from habitta_internal.condominium_purge_authorizations authorization',
    'delete from habitta_internal.condominium_purge_authorizations purge_auth',
)
text = text.replace('authorization.backend_pid', 'purge_auth.backend_pid')
text = text.replace('authorization.transaction_id', 'purge_auth.transaction_id')
text = text.replace('authorization.condominium_id', 'purge_auth.condominium_id')
text = text.replace('authorization.unit_ids', 'purge_auth.unit_ids')

if 'condominium_purge_authorizations authorization' in text or 'authorization.' in text:
    raise SystemExit('reserved SQL alias remains in migration')
path.write_text(text)
