import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflowUrl = new URL(
  '../../../.github/workflows/development-release-apply.yml',
  import.meta.url,
);

describe('development release workflow', () => {
  it('never concatenates fallback JSON onto failed Wrangler output', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).not.toContain("|| printf '{}'");
    expect(workflow).not.toMatch(/--json\s*\|\s*jq/);
    expect(workflow).toContain('PREVIOUS_STATUS_FILE="$RUNNER_TEMP/previous-worker-status.json"');
    expect(workflow).toContain('printf \'{}\' >"$PREVIOUS_STATUS_FILE"');
    expect(workflow).toContain('jq -e \'type == "object"\' "$PREVIOUS_STATUS_FILE"');
  });

  it('validates structured Wrangler output before extracting release metadata', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow.match(/jq -e 'type == \"array\"'/g)).toHaveLength(4);
    expect(workflow.match(/jq -e 'type == \"object\"'/g)).toHaveLength(3);
    expect(workflow).toContain('$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT');
    expect(workflow).toContain('versions list --env dev --json >\"$VERSION_LIST_FILE\"');
    expect(workflow).toContain('deployments status --env dev --json >\"$ACTIVE_STATUS_FILE\"');
  });

  it('deploys Pages from the absolute workspace path', async () => {
    const workflow = await readFile(workflowUrl, 'utf8');

    expect(workflow).toContain('pages deploy \"$GITHUB_WORKSPACE/apps/web/dist\"');
    expect(workflow).not.toContain('pages deploy apps/web/dist');
    expect(workflow).toContain('--project-name \"$CLOUDFLARE_PAGES_PROJECT_NAME\"');
  });
});
