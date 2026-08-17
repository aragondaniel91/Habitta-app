import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const wrapperSource = readFileSync(
  new URL('./pages/GovernanceWorkspacePage.tsx', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('./features/governance/AssemblyActionItemsWorkspace.tsx', import.meta.url),
  'utf8',
);
const assigneeSource = readFileSync(
  new URL('./features/governance/action-item-assignees.ts', import.meta.url),
  'utf8',
);

describe('HAB-196 assembly action items workspace contract', () => {
  it('keeps action-item tracking inside the existing governance module', () => {
    expect(wrapperSource).toContain('AssemblyActionItemsWorkspace');
    expect(wrapperSource).toContain("type View = 'proposals' | 'assemblies' | 'action-items'");
    expect(wrapperSource).toContain('Acuerdos y seguimiento');
  });

  it('uses the authenticated Worker API and optimistic versions for lifecycle changes', () => {
    expect(workspaceSource).toContain('/action-items`');
    expect(workspaceSource).toContain('/transition`');
    expect(workspaceSource).toContain('expectedVersion: editor.item.version');
    expect(workspaceSource).toContain('expectedVersion: item.version');
    expect(workspaceSource).not.toContain('/rest/v1/');
    expect(workspaceSource).not.toContain('supabase.from(');
    expect(assigneeSource).not.toContain('.from(');
  });

  it('uses real condominium-scoped selectors instead of manual UUID inputs', () => {
    expect(assigneeSource).toContain("client.rpc('list_assembly_action_assignees'");
    expect(assigneeSource).toContain("client.rpc('list_assembly_action_item_assignee_labels'");
    expect(workspaceSource).toContain('loadAssemblyActionAssigneeLabels');
    expect(workspaceSource).toContain('/requests`');
    expect(workspaceSource).toContain('/maintenance/work-orders`');
    expect(workspaceSource).toContain('/resolutions`');
    expect(workspaceSource).toContain('resolution.published_at');
    expect(workspaceSource).not.toContain('placeholder="UUID');
  });

  it('preserves governance management gating and finalized read-only behavior', () => {
    expect(workspaceSource).toContain('canManageGovernance');
    expect(workspaceSource).toContain("status === 'completed' || status === 'cancelled'");
    expect(workspaceSource).toContain("item.status === 'open'");
    expect(workspaceSource).toContain('assignedDisplayName');
    expect(workspaceSource).toContain('/app/requests');
    expect(workspaceSource).toContain('/app/maintenance');
  });
});
