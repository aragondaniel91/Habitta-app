-- Postgres cannot use a new enum value in the same transaction that adds it, so this stays its
-- own migration, ahead of the settings table and generation function that use these values.
alter type public.receivable_item_type add value if not exists 'late_fee';
alter type public.ledger_entry_type add value if not exists 'late_fee_charge';
