begin;
select plan(6);
-- Executable with `supabase test db`; fixtures are intentionally isolated from prior tests.
select has_table('public','receivable_ledger_entries','ledger table exists');
select has_table('public','charge_concepts','concept table exists');
select has_function('public','create_receivable_item','manual charge RPC exists');
select has_function('public','post_charge_batch','batch RPC exists');
select has_function('public','import_opening_balances','opening balance RPC exists');
select has_function('public','reverse_receivable_item','reversal RPC exists');
select * from finish();
rollback;
