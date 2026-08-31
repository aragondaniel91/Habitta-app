import { describe, expect, it } from 'vitest';
import type { Condominium, Organization } from '../components/AppShell';
import type { MembershipResponse } from './roles';
import { scopeWorkspaceToMemberships } from './workspace-scope';

const organizations: Organization[] = [
  { id: 'org-a', name: 'A' },
  { id: 'org-b', name: 'B' },
];
const condominiums: Condominium[] = [
  { id: 'condo-a', name: 'A1', organization_id: 'org-a' },
  { id: 'condo-b', name: 'B1', organization_id: 'org-b' },
];

const emptyMemberships: MembershipResponse = { organizations: [], condominiums: [] };

describe('scopeWorkspaceToMemberships', () => {
  it('detects a platform-only account when RLS returns a cross-tenant catalogue', () => {
    expect(scopeWorkspaceToMemberships(organizations, condominiums, emptyMemberships)).toEqual({
      organizations: [],
      condominiums: [],
      platformOnly: true,
    });
  });

  it('does not misclassify a brand-new tenant user with no visible catalogue', () => {
    expect(scopeWorkspaceToMemberships([], [], emptyMemberships)).toEqual({
      organizations: [],
      condominiums: [],
      platformOnly: false,
    });
  });

  it('keeps only the condominium membership scope even if global rows are visible', () => {
    const result = scopeWorkspaceToMemberships(organizations, condominiums, {
      organizations: [],
      condominiums: [{ condominium_id: 'condo-b', role: 'owner' }],
    });
    expect(result.platformOnly).toBe(false);
    expect(result.organizations).toEqual([{ id: 'org-b', name: 'B' }]);
    expect(result.condominiums).toEqual([{ id: 'condo-b', name: 'B1', organization_id: 'org-b' }]);
  });

  it('lets an organization owner see every condominium in their organization only', () => {
    const result = scopeWorkspaceToMemberships(organizations, condominiums, {
      organizations: [{ organization_id: 'org-a', role: 'organization_owner' }],
      condominiums: [],
    });
    expect(result.platformOnly).toBe(false);
    expect(result.organizations).toEqual([{ id: 'org-a', name: 'A' }]);
    expect(result.condominiums).toEqual([{ id: 'condo-a', name: 'A1', organization_id: 'org-a' }]);
  });
});
