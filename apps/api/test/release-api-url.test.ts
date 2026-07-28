import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflowUrl = new URL(
  '../../../.github/workflows/development-release-apply.yml',
  import.meta.url,
);

describe('development web API release configuration', () => {
  it('derives the public web API URL from the required Worker URL', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).toContain(
      'VITE_API_BASE_URL: ${{ vars.CLOUDFLARE_WORKER_DEV_URL }}',
    );
    expect(workflow).toContain('test -n "$VITE_API_BASE_URL"');
    expect(workflow).toContain(
      'test "$VITE_API_BASE_URL" = "$CLOUDFLARE_WORKER_DEV_URL"',
    );
    expect(workflow).not.toContain('VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}');
  });
});
