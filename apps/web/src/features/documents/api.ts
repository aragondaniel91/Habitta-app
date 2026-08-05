import type { Session } from '@supabase/supabase-js';
import { apiBaseUrl } from '../../lib/api';

export const PRIVATE_DOCUMENT_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
].join(',');

export const PRIVATE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

const extensionContentTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

export const normalizedPrivateDocumentType = (file: File) => {
  const supplied = file.type.trim().toLowerCase();
  if (PRIVATE_DOCUMENT_ACCEPT.split(',').includes(supplied)) return supplied;
  const extension = Object.keys(extensionContentTypes).find((value) =>
    file.name.toLowerCase().endsWith(value),
  );
  return extension ? extensionContentTypes[extension] : supplied;
};

export const privateDocumentError = (file: File) => {
  if (!PRIVATE_DOCUMENT_ACCEPT.split(',').includes(normalizedPrivateDocumentType(file)))
    return 'Formato no permitido. Usa PDF, imagen, Word, Excel o texto.';
  if (file.size < 1) return 'El archivo está vacío.';
  if (file.size > PRIVATE_DOCUMENT_MAX_BYTES) return 'El archivo supera el límite de 20 MB.';
  return '';
};

const responseError = async (response: Response, fallback: string) => {
  try {
    const value = (await response.json()) as { error?: string; message?: string };
    return value.error ?? value.message ?? fallback;
  } catch {
    return fallback;
  }
};

export async function uploadPrivateDocument(
  path: string,
  session: Session,
  file: File,
  metadata: {
    documentType?: string;
    visibility?: 'public' | 'internal';
    commentId?: string;
  } = {},
) {
  const validationError = privateDocumentError(file);
  if (validationError) throw new Error(validationError);

  const headers = new Headers({
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': normalizedPrivateDocumentType(file),
    'X-Filename': file.name,
  });
  if (metadata.documentType) headers.set('X-Document-Type', metadata.documentType);
  if (metadata.visibility) headers.set('X-Visibility', metadata.visibility);
  if (metadata.commentId) headers.set('X-Comment-Id', metadata.commentId);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: file,
  });
  if (!response.ok)
    throw new Error(await responseError(response, 'No se pudo guardar el documento.'));
  return response.json() as Promise<{ id: string }>;
}

export async function downloadPrivateDocument(path: string, session: Session, filename: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok)
    throw new Error(await responseError(response, 'No se pudo descargar el documento.'));

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
