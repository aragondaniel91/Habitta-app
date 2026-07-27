-- Run with the Supabase test runner after loading two auth users and memberships.
-- The policies above assert: member A reads condominium A, cannot read/write B, and owner cannot write buildings/units.
select has_table('public', 'units');
select has_table('public', 'organization_memberships');
