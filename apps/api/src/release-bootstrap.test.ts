import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflowUrl = new URL(
  '../../../.github/workflows/development-release-apply.yml',
  import.meta.url,
);

describe('development Worker bootstrap', () => {
  it('uses deploy only for the first Worker and versions for later releases', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).toContain('if [ -z "$PREVIOUS_VERSION" ]; then');
    expect(workflow).toContain('wrangler deploy "${COMMON_ARGS[@]}"');
    expect(workflow).toContain('wrangler versions upload "${COMMON_ARGS[@]}"');
    expect(workflow).toContain('if [ "$WORKER_BOOTSTRAPPED" = false ]; then');
    expect(workflow).toContain('wrangler versions deploy "$ACTIVE_VERSION_ID@100%"');
  });

  it('keeps the release to one Worker deployment phase', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).not.toContain('Promote final Worker version with exact Pages CORS');
    expect(workflow.match(/wrangler versions upload/g)).toHaveLength(1);
    expect(workflow).toContain('--expected-web-origin "$CLOUDFLARE_PAGES_DEV_URL"');
    expect(workflow).toContain('--web-url "$EXACT_PAGES_URL"');
  });

  it('records whether the Worker was bootstrapped without exposing secrets', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).toContain('--argjson bootstrapped "$WORKER_BOOTSTRAPPED"');
    expect(workflow).toContain('bootstrapped:$bootstrapped');
    expect(workflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY:$SUPABASE_SERVICE_ROLE_KEY');
  });
});
