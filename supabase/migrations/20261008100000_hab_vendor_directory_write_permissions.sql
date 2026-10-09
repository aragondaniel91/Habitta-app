-- The vendors_manage RLS policy already restricts writes to expense managers in the
-- caller's condominium. Data API writes were failing before that policy could run because
-- authenticated lacked these two table privileges. This grants no access to other tables.
grant insert, update on table public.vendors to authenticated;
