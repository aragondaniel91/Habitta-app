-- The expense_categories_manage RLS policy already restricts writes to expense
-- managers in the caller's condominium. Data API writes need these table
-- privileges before that policy can evaluate; this grants no access to other tables.
grant insert, update on table public.expense_categories to authenticated;
