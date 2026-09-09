import type { Session } from '@supabase/supabase-js';
import { apiRequest } from '../../lib/api';
import type { MembershipResponse } from '../../lib/roles';

type CondominiumRow = {
  id: string;
  organization_id: string;
};

export type BillingManagementCapability = {
  canManageBilling: boolean;
  organizationId: string | null;
};

export async function getBillingManagementCapability(
  condominiumId: string,
  session: Session,
): Promise<BillingManagementCapability> {
  const [condominiumRows, memberships] = await Promise.all([
    apiRequest<CondominiumRow[]>(`/v1/condominiums/${condominiumId}`, session),
    apiRequest<MembershipResponse>('/v1/memberships', session),
  ]);
  const organizationId = condominiumRows[0]?.organization_id ?? null;
  return {
    canManageBilling: Boolean(
      organizationId &&
      memberships.organizations.some(
        (membership) =>
          membership.organization_id === organizationId && membership.role === 'organization_owner',
      ),
    ),
    organizationId,
  };
}
