-- pg-delta: transaction=false
-- Keep this enum update isolated: PostgreSQL cannot safely use a new enum value in a
-- constraint until the transaction that adds it has committed.
alter type public.budget_version_status add value if not exists 'rejected' after 'pending_approval';
