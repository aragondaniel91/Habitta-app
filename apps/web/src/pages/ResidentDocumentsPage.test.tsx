// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CommunityDocument,
  CommunityDocumentVersion,
} from '../features/documents/community-api';

const { listCategories, listFolders, listDocuments, listVersions } = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listFolders: vi.fn(),
  listDocuments: vi.fn(),
  listVersions: vi.fn(),
}));

vi.mock('../features/documents/community-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/documents/community-api')>()),
  listCommunityDocumentCategories: listCategories,
  listCommunityDocumentFolders: listFolders,
  listCommunityDocuments: listDocuments,
  listCommunityDocumentVersions: listVersions,
}));

import { ResidentDocumentsPage } from './ResidentDocumentsPage';

const session = (token: string) => ({ access_token: token }) as never;

function doc(id: string, overrides: Partial<CommunityDocument> = {}): CommunityDocument {
  return {
    id,
    condominium_id: 'c1',
    folder_id: null,
    category_id: null,
    title: id,
    description: null,
    audience: 'residents',
    status: 'active',
    retention_days: null,
    latest_version_number: 1,
    created_by: 'user-1',
    archived_by: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function version(
  id: string,
  documentId: string,
  overrides: Partial<CommunityDocumentVersion> = {},
): CommunityDocumentVersion {
  return {
    id,
    document_id: documentId,
    condominium_id: 'c1',
    version_number: 1,
    storage_key: `key-${id}`,
    original_filename: `${id}.pdf`,
    content_type: 'application/pdf',
    size_bytes: 1024,
    sha256: 'abc',
    change_note: null,
    uploaded_by: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function click(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}; visible: ${document.body.textContent}`);
  act(() => button.click());
}

describe('ResidentDocumentsPage request ownership', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    listCategories.mockResolvedValue([]);
    listFolders.mockResolvedValue([]);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (condominiumId: string, token = 'token-1') =>
    act(async () => {
      root.render(
        createElement(ResidentDocumentsPage, {
          condominiumId,
          condominiumName: condominiumId,
          session: session(token),
        }),
      );
    });

  it('drops a stale library response after the condominium changes', async () => {
    const c1Library = deferred<CommunityDocument[]>();
    listDocuments.mockImplementation((condominiumId: string) => {
      if (condominiumId === 'c1') return c1Library.promise;
      if (condominiumId === 'c2') {
        return Promise.resolve([doc('c2-doc', { condominium_id: 'c2', title: 'C2 Document' })]);
      }
      return Promise.resolve([]);
    });
    listVersions.mockResolvedValue([]);

    await render('c1');
    await render('c2');
    await flush();
    expect(host.textContent).toContain('C2 Document');

    await act(async () => c1Library.resolve([doc('c1-doc', { title: 'C1 Document' })]));
    await flush();

    expect(host.textContent).toContain('C2 Document');
    expect(host.textContent).not.toContain('C1 Document');
  });

  it('drops a stale versions response after selecting another document', async () => {
    const documents = [
      doc('doc-a', { title: 'Document A' }),
      doc('doc-b', { title: 'Document B' }),
    ];
    listDocuments.mockResolvedValue(documents);
    const aVersions = deferred<CommunityDocumentVersion[]>();
    listVersions.mockImplementation((_condo: string, documentId: string) =>
      documentId === 'doc-a'
        ? aVersions.promise
        : Promise.resolve([version('v-b', 'doc-b', { original_filename: 'B.pdf' })]),
    );

    await render('c1');
    await flush();
    // Document A auto-selects first and starts its (still pending) versions fetch.
    click('Document B');
    await flush();
    expect(host.textContent).toContain('Document B');
    expect(host.textContent).toContain('B.pdf');

    await act(async () =>
      aVersions.resolve([version('v-a', 'doc-a', { original_filename: 'A.pdf' })]),
    );
    await flush();

    expect(host.textContent).toContain('Document B');
    expect(host.textContent).toContain('B.pdf');
    expect(host.textContent).not.toContain('A.pdf');
  });
});
