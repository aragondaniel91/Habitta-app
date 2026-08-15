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
    expect(workflow).toContain('node scripts/release/validate-production-release.mjs');
    expect(workflow).toContain('bash scripts/release/pre-migration-production-backup.sh');
    expect(workflow).toContain('habitta-integrations-prod');
    expect(workflow).toContain('habitta-integrations-dlq-prod');
    expect(workflow).toContain('habitta-database-backups-prod');
    expect(workflow).toContain('/deployments/$PREVIOUS_PAGES_DEPLOYMENT/rollback');
    expect(workflow).toContain('wrangler versions deploy "$PREVIOUS_WORKER_VERSION@100%" --env prod');
    expect(workflow).not.toContain('canonical_domain_runner_403');
    expect(workflow).not.toContain('browser verification required');
  });

  it('keeps Habitta-dev out of the production Wrangler vars', async () => {
    const wrangler = await readFile(new URL('apps/api/wrangler.jsonc', root), 'utf8');
    const prodSection = wrangler.slice(wrangler.indexOf('"prod": {'));

    expect(prodSection).not.toContain('kgsfaahixbcwcmykmhat');
    expect(prodSection).not.toContain('habitta-web-prod.pages.dev');
    expect(prodSection).toContain('"APP_BASE_URL": "https://app.mihabitta.com"');
    expect(prodSection).toContain('"CORS_ALLOWED_ORIGINS": "https://app.mihabitta.com"');
  });

  it('makes scheduled production backups use configuration instead of the development ref', async () => {
    const workflow = await readFile(
      new URL('.github/workflows/database-backup.yml', root),
      'utf8',
    );

    expect(workflow).toContain('SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}');
    expect(workflow).toContain('Refusing production backup: SUPABASE_PROJECT_REF points to Habitta-dev.');
    expect(workflow).not.toContain('SUPABASE_PROJECT_REF: kgsfaahixbcwcmykmhat');
  });
});
