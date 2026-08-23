import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const count = (value: string, needle: string) => value.split(needle).length - 1;

const governance = source('./pages/GovernancePage.tsx');
const rules = source('./features/governance/GovernanceVotingRulesPanel.tsx');
const assemblies = source('./features/governance/AssembliesWorkspace.tsx');
const actionItems = source('./features/governance/AssemblyActionItemsWorkspace.tsx');
const governanceCss = source('./governance.css');
const rulesCss = source('./features/governance/governance-voting-rules-panel.css');
const assembliesCss = source('./features/governance/assemblies-workspace.css');
const actionItemsCss = source('./features/governance/assembly-action-items-workspace.css');
const parityMatrix = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-275 Governance shared form layout', () => {
  it('moves only the audited Governance form layout ownership to shared primitives', () => {
    expect(count(governance, '<FormGrid')).toBe(2);
    expect(count(governance, '<FormGrid columns={3}>')).toBe(1);
    expect(count(governance, '<FormActions>')).toBe(1);
    expect(count(rules, '<FormGrid')).toBe(1);
    expect(count(assemblies, '<FormGrid')).toBe(2);
    expect(count(assemblies, '<FormActions>')).toBe(1);
    expect(count(actionItems, '<FormGrid')).toBe(1);
    expect(count(actionItems, '<FormActions>')).toBe(1);
    expect(governance).not.toContain('governance-form-grid');
    expect(governance).not.toContain('governance-form__actions');
    expect(rules).not.toContain('governance-voting-rule__fields');
    expect(assemblies).not.toContain('assemblies-form__grid');
    expect(actionItems).not.toContain('action-items-form__grid');
    expect(actionItems).not.toContain('action-items-form__actions');
  });

  it('preserves proposal financial, quorum and closing semantics', () => {
    expect(governance).toContain('budgetAmount: budgetAmount || undefined');
    expect(governance).toContain('currencyCode: budgetAmount ? currencyCode : undefined');
    expect(governance).toContain('quorumPercentage: Number(quorumPercentage)');
    expect(governance).toContain('closesAt: new Date(closesAt).toISOString()');
    expect(governance).toContain('governance-detail__actions');
  });

  it('preserves draft-only voting rules and optimistic concurrency', () => {
    expect(rules).toContain("editable = manage && proposal.status === 'draft'");
    expect(rules).toContain('approvalThresholdPercentage: Number(values.threshold)');
    expect(rules).toContain('expectedVersion: proposal.version');
  });

  it('preserves assembly lifecycle, eligibility freeze and publication contracts', () => {
    expect(assemblies).toContain(
      'body: JSON.stringify({ action, expectedVersion: selected.version })',
    );
    expect(assemblies).toContain('Iniciar y congelar elegibilidad');
    expect(assemblies).toContain('/minutes/publish');
    expect(assemblies).toContain('assemblies-actions');
  });

  it('preserves action-item IDs and versioned edit/transition payloads', () => {
    expect(actionItems).toContain('resolutionId: draft.resolutionId || null');
    expect(actionItems).toContain('assigneeUserId: draft.assigneeUserId || null');
    expect(actionItems).toContain('serviceRequestId: draft.serviceRequestId || null');
    expect(actionItems).toContain('maintenanceWorkOrderId: draft.maintenanceWorkOrderId || null');
    expect(actionItems).toContain('expectedVersion: editor.item.version');
    expect(actionItems).toContain('expectedVersion: item.version');
    expect(actionItems).toContain('action-item-card__actions');
  });

  it('removes only dead local form grid/action CSS', () => {
    expect(governanceCss).not.toContain('governance-form-grid');
    expect(governanceCss).not.toContain('governance-form__actions');
    expect(governanceCss).toContain('.governance-detail__actions {');
    expect(rulesCss).not.toContain('governance-voting-rule__fields');
    expect(assembliesCss).not.toContain('assemblies-form__grid');
    expect(assembliesCss).toContain('.assemblies-inline-form {');
    expect(actionItemsCss).not.toContain('action-items-form__grid');
    expect(actionItemsCss).not.toContain('action-items-form__actions');
    expect(actionItemsCss).toContain('.action-item-card__actions');
  });

  it('marks Governance compliant only after focused contracts exist', () => {
    expect(parityMatrix).toContain(
      '| Gobernanza | Propuestas, reglas de votación, asambleas y acuerdos | compliant | Sí | Sí | Sí | Sí |',
    );
  });
});
