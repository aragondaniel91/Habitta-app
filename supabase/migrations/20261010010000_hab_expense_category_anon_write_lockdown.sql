-- Explicitly prevent anonymous expense-category writes on fresh and upgraded databases.
-- The authenticated grant is required for expense managers; existing RLS policies
-- still restrict which condominium rows may be inserted or updated.
revoke insert, update on table public.expense_categories from anon, public;
grant insert, update on table public.expense_categories to authenticated;
