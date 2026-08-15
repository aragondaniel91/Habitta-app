export const HABITTA_DEV_PROJECT_REF = 'kgsfaahixbcwcmykmhat';
export const HABITTA_DEV_SUPABASE_URL = `https://${HABITTA_DEV_PROJECT_REF}.supabase.co`;

export const validateProductionRelease = ({
  appEnv,
  emailMode,
  projectRef,
  supabaseUrl,
  viteSupabaseUrl,
  workerUrl,
  pagesUrl,
  corsAllowedOrigins,
} = {}) => {
  const errors = [];
  const normalizedProjectRef = String(projectRef ?? '').trim();
  const normalizedSupabaseUrl = String(supabaseUrl ?? '').trim().replace(/\/$/, '');
  const normalizedViteSupabaseUrl = String(viteSupabaseUrl ?? '').trim().replace(/\/$/, '');

  if (appEnv !== 'production') errors.push('app_environment_must_be_production');
  if (emailMode !== 'live') errors.push('notifications_email_must_be_live');
  if (!normalizedProjectRef) errors.push('supabase_project_ref_missing');
  if (normalizedProjectRef === HABITTA_DEV_PROJECT_REF)
    errors.push('production_cannot_use_habitta_dev_project');
  if (!normalizedSupabaseUrl) errors.push('supabase_url_missing');
  if (normalizedSupabaseUrl === HABITTA_DEV_SUPABASE_URL)
    errors.push('production_cannot_use_habitta_dev_url');
  if (
    normalizedProjectRef &&
    normalizedSupabaseUrl &&
    normalizedSupabaseUrl !== `https://${normalizedProjectRef}.supabase.co`
  )
    errors.push('supabase_url_project_ref_mismatch');
  if (normalizedViteSupabaseUrl !== normalizedSupabaseUrl)
    errors.push('vite_supabase_url_mismatch');
  if (!/^https:\/\/habitta-api-prod\./.test(String(workerUrl ?? '')))
    errors.push('invalid_production_worker_url');
  if (pagesUrl !== 'https://app.mihabitta.com') errors.push('invalid_production_pages_url');
  if (corsAllowedOrigins !== pagesUrl) errors.push('production_cors_mismatch');

  return errors;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = validateProductionRelease({
    appEnv: process.env.APP_ENV,
    emailMode: process.env.NOTIFICATIONS_EMAIL_MODE,
    projectRef: process.env.SUPABASE_PROJECT_REF,
    supabaseUrl: process.env.SUPABASE_URL,
    viteSupabaseUrl: process.env.VITE_SUPABASE_URL,
    workerUrl: process.env.CLOUDFLARE_WORKER_PROD_URL,
    pagesUrl: process.env.CLOUDFLARE_PAGES_PROD_URL,
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
  });

  if (errors.length) {
    console.error(`production_release_invalid:${errors.join(',')}`);
    process.exit(1);
  }
  console.log('production release environment is valid');
}
