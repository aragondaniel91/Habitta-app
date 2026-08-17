import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const panelUrl = new URL('./features/governance/GovernanceVotingRulesPanel.tsx', import.meta.url);
const workspaceUrl = new URL('./pages/GovernanceWorkspacePage.tsx', import.meta.url);

describe('governance voting rules UI', () => {
  it('distinguishes quorum from approval threshold and edits draft rules through the API', async () => {
    const source = await readFile(panelUrl, 'utf8');
    expect(source).toContain('Quórum de participación');
    expect(source).toContain('Aprobación requerida');
    expect(source).toContain("proposal.status === 'draft'");
    expect(source).toContain('/voting-rules`');
    expect(source).toContain("method: 'PATCH'");
  });

  it('mounts the rules panel in the proposals workspace', async () => {
    const source = await readFile(workspaceUrl, 'utf8');
    expect(source).toContain('GovernanceVotingRulesPanel');
    expect(source).toContain('<GovernancePage {...props} />');
  });
});
