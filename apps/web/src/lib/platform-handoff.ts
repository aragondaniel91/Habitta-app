// HAB-432: where a Platform Admin identity continues its work, decided per origin.
//
// The mapping is the one already declared in config/environments.json, restated here because the
// browser bundle cannot read it. Production is the named exception rather than the default: an
// origin nobody recognises -- a local dev server, a preview deployment nobody registered -- is not
// production, and handing it the production console is the one direction of this mistake that has
// consequences.

const PRODUCTION_ADMIN_URL = 'https://admin.mihabitta.com';
const PREVIEW_ADMIN_URL = 'https://admin-preview.mihabitta.com';

/** The only origin that serves the production app. */
const PRODUCTION_APP_HOSTS = new Set(['app.mihabitta.com']);

/**
 * The Platform Admin destination for the origin the app is being served from.
 *
 * This is navigation, never authorization: the console decides for itself what the visitor may do
 * once they arrive.
 */
export function platformAdminUrlForHost(hostname: string): string {
  return PRODUCTION_APP_HOSTS.has(hostname) ? PRODUCTION_ADMIN_URL : PREVIEW_ADMIN_URL;
}
