import type { Condominium, Organization } from '../components/AppShell';
import type { MembershipResponse } from './roles';

export type ScopedWorkspace = {
  organizations: Organization[];
  condominiums: Condominium[];
  platformOnly: boolean;
};

/**
 * `/v1/organizations` and `/v1/condominiums` intentionally honor RLS. A Platform Admin therefore
 * receives the global catalogue, while the tenant app must still show only organizations and
 * condominiums where that person holds a tenant membership. Memberships are the presentation
 * boundary here; Postgres remains the authorization boundary.
 */
export function scopeWorkspaceToMemberships(
  organizations: Organization[],
  condominiums: Condominium[],
  memberships: MembershipResponse,
): ScopedWorkspace {
  const organizationMembershipIds = new Set(
    memberships.organizations.map((membership) => membership.organization_id),
  );
  const condominiumMembershipIds = new Set(
    memberships.condominiums.map((membership) => membership.condominium_id),
  );

  const scopedCondominiums = condominiums.filter(
    (condominium) =>
      condominiumMembershipIds.has(condominium.id) ||
      organizationMembershipIds.has(condominium.organization_id),
  );
  const scopedOrganizationIds = new Set([
    ...organizationMembershipIds,
    ...scopedCondominiums.map((condominium) => condominium.organization_id),
  ]);
  const scopedOrganizations = organizations.filter((organization) =>
    scopedOrganizationIds.has(organization.id),
  );

  const hasNoTenantMemberships =
    memberships.organizations.length === 0 && memberships.condominiums.length === 0;
  const receivedCrossTenantCatalogue =
    organizations.length > scopedOrganizations.length ||
    condominiums.length > scopedCondominiums.length;

  return {
    organizations: scopedOrganizations,
    condominiums: scopedCondominiums,
    platformOnly: hasNoTenantMemberships && receivedCrossTenantCatalogue,
  };
}
