import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);

describe('production release workflow hardening', () => {
  it('fails closed around production database identity and canonical reachability', async () => {
    const workflow = await readFile(
      new URL('.github/workflows/production-release.yml', root),
      'utf8',
    );

    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('HABITTA_PROD_PROJECT_REF: kgsfaahixbcwcmykmhat');
    expect(workflow).toContain('node scripts/release/validate-production-release.mjs');
    expect(workflow).toContain('bash scripts/release/pre-migration-production-backup.sh');
    expect(workflow).toContain('habitta-integrations-prod');
    expect(workflow).toContain('habitta-integrations-dlq-prod');
    expect(workflow).toContain('habitta-database-backups-prod');
    expect(workflow).toContain('if ! grep -R -F "$SUPABASE_URL" apps/web/dist >/dev/null; then');
    expect(workflow).toContain('Smoke production Pages deployment and API wiring');
    expect(workflow).toContain(
      'node scripts/release/verify-production-pages-control-plane.mjs',
    );
    expect(workflow).toContain('/deployments/$PREVIOUS_PAGES_DEPLOYMENT/rollback');
    expect(workflow).toContain(
      'wrangler versions deploy "$PREVIOUS_WORKER_VERSION@100%" --env prod',
    );
    expect(workflow).not.toContain('canonical_domain_runner_403');
    expect(workflow).not.toContain('browser verification required');
    expect(workflow).not.toContain('fetch(`${canonicalUrl}/app/dashboard`');
    expect(workflow).not.toContain('HABITTA_DEV_PROJECT_REF');
  });

  it('keeps Supabase identity out of the static production Wrangler vars', async () => {
    const wrangler = await readFile(new URL('apps/api/wrangler.jsonc', root), 'utf8');
    const prodSection = wrangler.slice(wrangler.indexOf('"prod": {'));

    expect(prodSection).not.toContain('kgsfaahixbcwcmykmhat');
    expect(prodSection).not.toContain('habitta-web-prod.pages.dev');
    expect(prodSection).toContain('"APP_BASE_URL": "https://app.mihabitta.com"');
    expect(prodSection).toContain('"CORS_ALLOWED_ORIGINS": "https://app.mihabitta.com"');
  });

  it('pins scheduled production backups to the canonical project', async () => {
    const workflow = await readFile(new URL('.github/workflows/database-backup.yml', root), 'utf8');

    expect(workflow).toContain('SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}');
    expect(workflow).toContain('HABITTA_PROD_PROJECT_REF: kgsfaahixbcwcmykmhat');
    expect(workflow).toContain(
      'Refusing production backup: SUPABASE_PROJECT_REF does not match Habitta Production.',
    );
    expect(workflow).not.toContain('HABITTA_DEV_PROJECT_REF');
  });
});
