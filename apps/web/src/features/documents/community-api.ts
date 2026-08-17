import type { Session } from '@supabase/supabase-js';
import { apiBaseUrl, apiRequest } from '../../lib/api';

export type CommunityDocumentAudience = 'management' | 'owners' | 'residents';
export type CommunityDocumentStatus = 'active' | 'archived';
export type CommunityDocumentLinkType =
  | 'announcement'
  | 'service_request'
  | 'expense'
  | 'assembly'
  | 'proposal'
  | 'budget';

export type CommunityDocumentCategory = {
  id: string;
  condominium_id: string;
  name: string;
  description: string | null;
  default_audience: CommunityDocumentAudience;
  default_retention_days: number | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CommunityDocumentFolder = {
  id: string;
  condominium_id: string;
  parent_folder_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CommunityDocument = {
  id: string;
  condominium_id: string;
  folder_id: string | null;
  category_id: string | null;
  title: string;
  description: string | null;
  audience: CommunityDocumentAudience;
  status: CommunityDocumentStatus;
  retention_days: number | null;
  latest_version_number: number;
  created_by: string;
  archived_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityDocumentVersion = {
  id: string;
  document_id: string;
  condominium_id: string;
  version_number: number;
  storage_key: string;
  original_filename: string;
  content_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  size_bytes: number;
  sha256: string;
  change_note: string | null;
  uploaded_by: string;
  created_at: string;
};

export type CommunityDocumentDownloadEvent = {
  id: string;
  document_id: string;
  version_id: string;
  condominium_id: string;
  actor_user_id: string;
  occurred_at: string;
};

export type CommunityDocumentLink = {
  id: string;
  document_id: string;
  condominium_id: string;
  target_type: CommunityDocumentLinkType;
  target_id: string;
  created_by: string;
  created_at: string;
};

export type CreateCommunityDocumentInput = {
  title: string;
  description?: string | undefined;
  folderId?: string | undefined;
  categoryId?: string | undefined;
  audience: CommunityDocumentAudience;
  retentionDays?: number | undefined;
};

export const COMMUNITY_DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png';
export const COMMUNITY_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const communityContentTypes: Record<string, CommunityDocumentVersion['content_type']> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function normalizedCommunityDocumentType(file: File) {
  const supplied = file.type.trim().toLowerCase();
  if (COMMUNITY_DOCUMENT_ACCEPT.split(',').includes(supplied)) {
    return supplied as CommunityDocumentVersion['content_type'];
  }
  const filename = file.name.toLowerCase();
  const extension = Object.keys(communityContentTypes).find((value) => filename.endsWith(value));
  return extension ? communityContentTypes[extension] : undefined;
}

export function communityDocumentFileError(file: File) {
  if (!normalizedCommunityDocumentType(file)) return 'Formato no permitido. Usa PDF, JPG o PNG.';
  if (file.size < 1) return 'El archivo está vacío.';
  if (file.size > COMMUNITY_DOCUMENT_MAX_BYTES) return 'El archivo supera el límite de 10 MB.';
  return '';
}

const basePath = (condominiumId: string) => `/v1/condominiums/${condominiumId}/community-documents`;

const responseError = async (response: Response, fallback: string) => {
  try {
    const value = (await response.json()) as {
      error?: unknown;
      message?: unknown;
      publicMessage?: unknown;
    };
    for (const candidate of [value.publicMessage, value.error, value.message]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return fallback;
  } catch {
    return fallback;
  }
};

function unwrapCreated<T>(value: T | T[]) {
  if (Array.isArray(value)) {
    if (!value[0]) throw new Error('Habitta no devolvió el registro creado.');
    return value[0];
  }
  return value;
}

export const listCommunityDocumentCategories = (condominiumId: string, session: Session) =>
  apiRequest<CommunityDocumentCategory[]>(`${basePath(condominiumId)}/categories`, session);

export const listCommunityDocumentFolders = (condominiumId: string, session: Session) =>
  apiRequest<CommunityDocumentFolder[]>(`${basePath(condominiumId)}/folders`, session);

export const listCommunityDocuments = (condominiumId: string, session: Session) =>
  apiRequest<CommunityDocument[]>(basePath(condominiumId), session);

export const listCommunityDocumentVersions = (
  condominiumId: string,
  documentId: string,
  session: Session,
) =>
  apiRequest<CommunityDocumentVersion[]>(
    `${basePath(condominiumId)}/${documentId}/versions`,
    session,
  );

export const listCommunityDocumentLinks = (
  condominiumId: string,
  documentId: string,
  session: Session,
) => apiRequest<CommunityDocumentLink[]>(`${basePath(condominiumId)}/${documentId}/links`, session);

export const listCommunityDocumentDownloadEvents = (
  condominiumId: string,
  session: Session,
  documentId?: string,
) => {
  const params = new URLSearchParams();
  if (documentId) params.set('documentId', documentId);
  const query = params.size ? `?${params.toString()}` : '';
  return apiRequest<CommunityDocumentDownloadEvent[]>(
    `${basePath(condominiumId)}/download-events${query}`,
    session,
  );
};

export async function createCommunityDocumentCategory(
  condominiumId: string,
  session: Session,
  input: {
    name: string;
    description?: string | undefined;
    defaultAudience: CommunityDocumentAudience;
    defaultRetentionDays?: number | undefined;
  },
) {
  const created = await apiRequest<CommunityDocumentCategory | CommunityDocumentCategory[]>(
    `${basePath(condominiumId)}/categories`,
    session,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return unwrapCreated(created);
}

export async function createCommunityDocumentFolder(
  condominiumId: string,
  session: Session,
  input: {
    name: string;
    description?: string | undefined;
    parentFolderId?: string | undefined;
  },
) {
  const created = await apiRequest<CommunityDocumentFolder | CommunityDocumentFolder[]>(
    `${basePath(condominiumId)}/folders`,
    session,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return unwrapCreated(created);
}

export async function createCommunityDocument(
  condominiumId: string,
  session: Session,
  input: CreateCommunityDocumentInput,
) {
  const created = await apiRequest<CommunityDocument | CommunityDocument[]>(
    basePath(condominiumId),
    session,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return unwrapCreated(created);
}

export async function uploadCommunityDocumentVersion(
  condominiumId: string,
  documentId: string,
  session: Session,
  file: File,
  changeNote = '',
) {
  const validationError = communityDocumentFileError(file);
  if (validationError) throw new Error(validationError);
  const contentType = normalizedCommunityDocumentType(file);
  if (!contentType) throw new Error('Formato no permitido. Usa PDF, JPG o PNG.');

  const headers = new Headers({
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': contentType,
    'X-Filename': file.name,
  });
  if (changeNote.trim()) headers.set('X-Change-Note', changeNote.trim().slice(0, 1000));

  const response = await fetch(`${apiBaseUrl}${basePath(condominiumId)}/${documentId}/versions`, {
    method: 'PUT',
    headers,
    body: file,
  });
  if (!response.ok) {
    throw new Error(await responseError(response, 'No se pudo guardar la nueva versión.'));
  }
  return response.json() as Promise<CommunityDocumentVersion | CommunityDocumentVersion[]>;
}

export async function downloadCommunityDocumentVersion(
  condominiumId: string,
  documentId: string,
  version: CommunityDocumentVersion,
  session: Session,
) {
  const response = await fetch(
    `${apiBaseUrl}${basePath(condominiumId)}/${documentId}/versions/${version.id}/file`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  if (!response.ok) {
    throw new Error(await responseError(response, 'No se pudo descargar el documento.'));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = version.original_filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const archiveCommunityDocument = (
  condominiumId: string,
  documentId: string,
  session: Session,
) =>
  apiRequest<CommunityDocument | CommunityDocument[]>(
    `${basePath(condominiumId)}/${documentId}/archive`,
    session,
    { method: 'POST' },
  );

export const linkCommunityDocument = (
  condominiumId: string,
  documentId: string,
  session: Session,
  input: { targetType: CommunityDocumentLinkType; targetId: string },
) =>
  input.targetType === 'budget'
    ? apiRequest<CommunityDocumentLink | CommunityDocumentLink[]>(
        `/v1/condominiums/${condominiumId}/budgets/${input.targetId}/community-document-link`,
        session,
        { method: 'POST', body: JSON.stringify({ documentId }) },
      )
    : apiRequest<CommunityDocumentLink | CommunityDocumentLink[]>(
        `${basePath(condominiumId)}/${documentId}/links`,
        session,
        { method: 'POST', body: JSON.stringify(input) },
      );