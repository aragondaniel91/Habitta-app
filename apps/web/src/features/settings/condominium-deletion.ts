import type { Session } from '@supabase/supabase-js';
import { ApiRequestError, apiBaseUrl, apiRequest } from '../../lib/api';
import type { MembershipResponse } from '../../lib/roles';

type CondominiumRow = {
  id: string;
  organization_id: string;
  name: string;
};

export type CondominiumDeletionCapability = {
  canDelete: boolean;
  organizationId: string | null;
  expectedConfirmation: string;
};

export type CondominiumDeletionResult = {
  deleted: true;
  condominiumId: string;
  condominiumName: string;
  databaseDeleted: true;
  storageCleanup: 'completed' | 'pending';
  deletedStorageObjects?: number;
  cleanupJobId?: string;
  message?: string;
};

export async function getCondominiumDeletionCapability(
  condominiumId: string,
  condominiumName: string,
  session: Session,
): Promise<CondominiumDeletionCapability> {
  const [condominiumRows, memberships] = await Promise.all([
    apiRequest<CondominiumRow[]>(`/v1/condominiums/${condominiumId}`, session),
    apiRequest<MembershipResponse>('/v1/memberships', session),
  ]);
  const organizationId = condominiumRows[0]?.organization_id ?? null;
  return {
    canDelete: Boolean(
      organizationId &&
        memberships.organizations.some(
          (membership) =>
            membership.organization_id === organizationId && membership.role === 'organization_owner',
        ),
    ),
    organizationId,
    expectedConfirmation: `ELIMINAR ${condominiumName}`,
  };
}

const parsePayload = async (response: Response) => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export async function deleteCondominium(
  condominiumId: string,
  confirmation: string,
  session: Session,
): Promise<CondominiumDeletionResult> {
  const path = `/v1/condominiums/${condominiumId}/danger-zone/delete`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ confirmation }),
  });
  const payload = await parsePayload(response);

  if (payload.deleted === true && payload.databaseDeleted === true) {
    return payload as CondominiumDeletionResult;
  }
  if (!response.ok) {
    const message =
      typeof payload.publicMessage === 'string'
        ? payload.publicMessage
        : typeof payload.error === 'string'
          ? payload.error
          : 'No se pudo eliminar la residencia.';
    throw new ApiRequestError(response.status, message, path);
  }
  return payload as CondominiumDeletionResult;
}

export async function retryCondominiumStorageCleanup(jobId: string, session: Session) {
  const path = `/v1/condominiums/deletion-jobs/${jobId}/retry-storage-cleanup`;
  return apiRequest<{ storageCleanup: 'completed'; deletedStorageObjects: number }>(path, session, {
    method: 'POST',
  });
}
