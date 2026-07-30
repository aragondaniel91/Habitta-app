import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflowUrl = new URL(
  '../../../.github/workflows/development-release-apply.yml',
  import.meta.url,
);

describe('development Worker variable preservation', () => {
  it('keeps dashboard-managed variables while applying reviewed Wrangler configuration', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).toContain('--keep-vars');
    expect(workflow).not.toContain('--strict');
    expect(workflow).toContain('wrangler versions upload "${COMMON_ARGS[@]}"');
    expect(workflow).toContain('wrangler deploy "${COMMON_ARGS[@]}"');
  });
});
