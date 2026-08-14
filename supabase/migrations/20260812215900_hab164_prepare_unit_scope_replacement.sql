-- HAB-164 replaces the owner/tenant unit-read helper introduced by the earlier pilot scoping
-- migration. PostgreSQL does not allow CREATE OR REPLACE FUNCTION to rename an existing input
-- parameter, so remove the dependent SELECT policy and helper first. The following HAB-164
-- migration recreates the helper, grants and a single unit_read_v3 policy atomically in the same
-- migration sequence.

drop policy if exists unit_read on public.units;
drop policy if exists unit_read_v2 on public.units;
drop function if exists public.can_read_unit(uuid);
