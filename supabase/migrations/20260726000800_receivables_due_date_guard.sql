alter table public.receivable_items
  add constraint receivable_items_due_date_valid
  check (due_date is null or due_date >= issue_date);
