-- HAB-200: make the snapshot table explicitly read-only to application roles even when
-- Supabase default table privileges grant more capabilities to newly-created tables.

revoke all privileges on table public.governance_eligibility_snapshots from anon, authenticated;
grant select on table public.governance_eligibility_snapshots to authenticated;
