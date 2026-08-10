// Copy to config.js (gitignored) for local use. In CI, the deploy workflow writes config.js from
// the PLATFORM_ADMIN_SUPABASE_ANON_KEY secret before `wrangler pages deploy` runs.
// The anon key is meant to be public - it authenticates as Postgres role `anon`; every actual
// permission is enforced by RLS (see is_platform_admin() and the platform_admin_read_* policies).
window.HABITTA_ADMIN_CONFIG = {
  supabaseUrl: 'https://kgsfaahixbcwcmykmhat.supabase.co',
  supabaseAnonKey: 'REPLACE_WITH_ANON_KEY',
};
