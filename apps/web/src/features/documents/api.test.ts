import { describe, expect, it } from 'vitest';
import { PRIVATE_DOCUMENT_ACCEPT, PRIVATE_DOCUMENT_MAX_BYTES, privateDocumentError } from './api';

const file = (type: string, size: number, name = 'document.pdf') => ({ type, size, name }) as File;

describe('private documents', () => {
  it('accepts the supported operational document formats', () => {
    expect(PRIVATE_DOCUMENT_ACCEPT).toContain('application/pdf');
    expect(PRIVATE_DOCUMENT_ACCEPT).toContain('image/jpeg');
    expect(PRIVATE_DOCUMENT_ACCEPT).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('rejects empty, oversized and unsupported files', () => {
    expect(privateDocumentError(file('application/pdf', 0))).toBe('El archivo está vacío.');
    expect(privateDocumentError(file('application/pdf', PRIVATE_DOCUMENT_MAX_BYTES + 1))).toBe(
      'El archivo supera el límite de 20 MB.',
    );
    expect(privateDocumentError(file('application/x-msdownload', 1, 'script.exe'))).toBe(
      'Formato no permitido. Usa PDF, imagen, Word, Excel o texto.',
    );
  });
});
