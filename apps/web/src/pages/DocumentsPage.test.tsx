// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../lib/roles';
import type { CondominiumRole } from '../lib/roles';
import type {
  CommunityDocument,
  CommunityDocumentDownloadEvent,
  CommunityDocumentLink,
  CommunityDocumentVersion,
} from '../features/documents/community-api';

const {
  listCategories,
  listFolders,
  listDocuments,
  listVersions,
  listLinks,
  listDownloadEvents,
  downloadVersionMock,
  archiveDocumentMock,
} = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listFolders: vi.fn(),
  listDocuments: vi.fn(),
  listVersions: vi.fn(),
  listLinks: vi.fn(),
  listDownloadEvents: vi.fn(),
  downloadVersionMock: vi.fn(),
  archiveDocumentMock: vi.fn(),
}));

vi.mock('../features/documents/community-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/documents/community-api')>()),
  listCommunityDocumentCategories: listCategories,
  listCommunityDocumentFolders: listFolders,
  listCommunityDocuments: listDocuments,
  listCommunityDocumentVersions: listVersions,
  listCommunityDocumentLinks: listLinks,
  listCommunityDocumentDownloadEvents: listDownloadEvents,
  downloadCommunityDocumentVersion: downloadVersionMock,
  archiveCommunityDocument: archiveDocumentMock,
}));

import { DocumentsPage } from './DocumentsPage';

const session = (token: string) => ({ access_token: token }) as never;

function doc(id: string, overrides: Partial<CommunityDocument> = {}): CommunityDocument {
  return {
    id,
    condominium_id: 'c1',
    folder_id: null,
    category_id: null,
    title: id,
    description: null,
    audience: 'management',
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

const emptyLinks = (): CommunityDocumentLink[] => [];
const emptyDownloads = (): CommunityDocumentDownloadEvent[] => [];

describe('DocumentsPage request ownership', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    listCategories.mockResolvedValue([]);
    listFolders.mockResolvedValue([]);
    listVersions.mockResolvedValue([]);
    listLinks.mockImplementation(() => Promise.resolve(emptyLinks()));
    listDownloadEvents.mockImplementation(() => Promise.resolve(emptyDownloads()));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (condominiumId: string, token = 'token-1', roles: CondominiumRole[] = []) =>
    act(async () => {
      root.render(
        createElement(
          RolesProvider,
          { value: roles },
          createElement(DocumentsPage, {
            condominiumId,
            condominiumName: condominiumId,
            session: session(token),
          }),
        ),
      );
    });

  it('drops a stale library response after the condominium changes', async () => {
    const c1Library = deferred<CommunityDocument[]>();
    listDocuments.mockImplementation((condominiumId: string) => {
      if (condominiumId === 'c1') return c1Library.promise;
      if (condominiumId === 'c2')
        return Promise.resolve([doc('c2-doc', { condominium_id: 'c2', title: 'C2 Document' })]);
      return Promise.resolve([]);
    });

    await render('c1');
    await render('c2');
    await flush();
    expect(host.textContent).toContain('C2 Document');

    await act(async () => c1Library.resolve([doc('c1-doc', { title: 'C1 Document' })]));
    await flush();

    expect(host.textContent).toContain('C2 Document');
    expect(host.textContent).not.toContain('C1 Document');
  });

  it('drops a stale detail response after selecting another document', async () => {
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
    // The initial library load auto-selects Document A, which starts its (still pending) detail
    // fetch before Document B is ever clicked.
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

  it('does not let a stale download refresh clobber a newly selected document', async () => {
    const documents = [
      doc('doc-a', { title: 'Document A' }),
      doc('doc-b', { title: 'Document B' }),
    ];
    listDocuments.mockResolvedValue(documents);
    listVersions.mockImplementation((_condo: string, documentId: string) =>
      Promise.resolve([
        version(`v-${documentId}`, documentId, {
          original_filename: documentId === 'doc-a' ? 'A.pdf' : 'B.pdf',
        }),
      ]),
    );
    const download = deferred<void>();
    downloadVersionMock.mockReturnValue(download.promise);

    await render('c1');
    await flush();
    expect(listVersions).toHaveBeenCalledTimes(1);

    click('Descargar');
    click('Document B');
    await flush();
    expect(host.textContent).toContain('Document B');
    expect(host.textContent).toContain('B.pdf');
    expect(listVersions).toHaveBeenCalledTimes(2);

    await act(async () => download.resolve());
    await flush();

    expect(host.textContent).toContain('Descarga autorizada');
    expect(host.textContent).toContain('Document B');
    expect(host.textContent).toContain('B.pdf');
    expect(host.textContent).not.toContain('A.pdf');
    // The download's trailing detail refresh targeted Document A. Because the selection moved
    // to Document B before it resolved, it must not have re-fetched Document A's detail.
    expect(listVersions).toHaveBeenCalledTimes(2);
  });

  it('does not apply a stale archive notice or reload after the condominium changes', async () => {
    listDocuments.mockImplementation((condominiumId: string) =>
      condominiumId === 'c1'
        ? Promise.resolve([doc('doc-a', { title: 'Document A' })])
        : Promise.resolve([doc('c2-doc', { condominium_id: 'c2', title: 'C2 Document' })]),
    );
    listVersions.mockResolvedValue([]);
    const archive = deferred<CommunityDocument>();
    archiveDocumentMock.mockReturnValue(archive.promise);

    await render('c1', 'token-1', ['condominium_admin']);
    await flush();
    expect(host.textContent).toContain('Document A');

    click('Archivar');
    await flush();
    click('Archivar documento');

    await render('c2', 'token-1', ['condominium_admin']);
    await flush();
    expect(host.textContent).toContain('C2 Document');

    await act(async () =>
      archive.resolve(doc('doc-a', { title: 'Document A', status: 'archived' })),
    );
    await flush();

    expect(host.textContent).toContain('C2 Document');
    expect(host.textContent).not.toContain('Documento archivado');
    expect(host.textContent).not.toContain('Document A');
  });
});
