import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRightIcon, CheckCircleIcon, CommunityIcon, ReportsIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { useCondominiumRoles } from '../lib/roles';
import type { CondominiumRole } from '../lib/roles';
import {
  archiveCommunityDocument,
  COMMUNITY_DOCUMENT_ACCEPT,
  communityDocumentFileError,
  createCommunityDocument,
  createCommunityDocumentCategory,
  createCommunityDocumentFolder,
  downloadCommunityDocumentVersion,
  linkCommunityDocument,
  listCommunityDocumentCategories,
  listCommunityDocumentDownloadEvents,
  listCommunityDocumentFolders,
  listCommunityDocumentLinks,
  listCommunityDocuments,
  listCommunityDocumentVersions,
  uploadCommunityDocumentVersion,
} from '../features/documents/community-api';
import type {
  CommunityDocument,
  CommunityDocumentAudience,
  CommunityDocumentCategory,
  CommunityDocumentDownloadEvent,
  CommunityDocumentFolder,
  CommunityDocumentLink,
  CommunityDocumentLinkType,
  CommunityDocumentStatus,
  CommunityDocumentVersion,
} from '../features/documents/community-api';
import '../features/documents/community-documents.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type Composer = 'document' | 'folder' | 'category' | null;
type AudienceFilter = CommunityDocumentAudience | '';
type StatusFilter = CommunityDocumentStatus | '';

const DOCUMENT_MANAGER_ROLES: readonly CondominiumRole[] = [
  'condominium_admin',
  'accountant',
  'assistant',
  'board_member',
];

const audienceLabels: Record<CommunityDocumentAudience, string> = {
  management: 'Administración y junta',
  owners: 'Propietarios',
  residents: 'Residentes',
};

const linkLabels: Record<CommunityDocumentLinkType, string> = {
  announcement: 'Anuncio',
  service_request: 'Solicitud',
  expense: 'Gasto',
  assembly: 'Asamblea',
  proposal: 'Propuesta',
  budget: 'Presupuesto',
};

const linkRoutes: Record<CommunityDocumentLinkType, string> = {
  announcement: '/app/announcements',
  service_request: '/app/requests',
  expense: '/app/expenses',
  assembly: '/app/governance',
  proposal: '/app/governance',
  budget: '/app/budgets',
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const shortId = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;

function folderDepthRows(folders: CommunityDocumentFolder[]) {
  const children = new Map<string | null, CommunityDocumentFolder[]>();
  for (const folder of folders.filter((item) => item.is_active)) {
    const group = children.get(folder.parent_folder_id) ?? [];
    group.push(folder);
    children.set(folder.parent_folder_id, group);
  }
  for (const group of children.values()) group.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const rows: Array<{ folder: CommunityDocumentFolder; depth: number }> = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) ?? []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      rows.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const folder of folders.filter((item) => item.is_active)) {
    if (!visited.has(folder.id)) rows.push({ folder, depth: 0 });
  }
  return rows;
}

function DocumentsLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando documentos" className="documents-page">
      <PageHeader eyebrow="Biblioteca comunitaria" title="Documentos" />
      <div className="documents-layout">
        <Skeleton className="documents-skeleton documents-skeleton--nav" />
        <Skeleton className="documents-skeleton documents-skeleton--library" />
        <Skeleton className="documents-skeleton documents-skeleton--detail" />
      </div>
    </div>
  );
}

export function DocumentsPage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const canManageDocuments = roles.some((role) => DOCUMENT_MANAGER_ROLES.includes(role));
  const [categories, setCategories] = useState<CommunityDocumentCategory[]>([]);
  const [folders, setFolders] = useState<CommunityDocumentFolder[]>([]);
  const [documents, setDocuments] = useState<CommunityDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [versions, setVersions] = useState<CommunityDocumentVersion[]>([]);
  const [links, setLinks] = useState<CommunityDocumentLink[]>([]);
  const [downloadEvents, setDownloadEvents] = useState<CommunityDocumentDownloadEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [composer, setComposer] = useState<Composer>(null);

  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [documentFolderId, setDocumentFolderId] = useState('');
  const [documentCategoryId, setDocumentCategoryId] = useState('');
  const [documentAudience, setDocumentAudience] = useState<CommunityDocumentAudience>('management');
  const [documentRetention, setDocumentRetention] = useState('');
  const [initialFile, setInitialFile] = useState<File | null>(null);

  const [folderName, setFolderName] = useState('');
  const [folderDescription, setFolderDescription] = useState('');
  const [folderParentId, setFolderParentId] = useState('');

  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryAudience, setCategoryAudience] = useState<CommunityDocumentAudience>('management');
  const [categoryRetention, setCategoryRetention] = useState('');

  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState('');
  const [linkType, setLinkType] = useState<CommunityDocumentLinkType>('announcement');
  const [linkTargetId, setLinkTargetId] = useState('');

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [categoryRows, folderRows, documentRows] = await Promise.all([
        listCommunityDocumentCategories(condominiumId, session),
        listCommunityDocumentFolders(condominiumId, session),
        listCommunityDocuments(condominiumId, session),
      ]);
      setCategories(categoryRows);
      setFolders(folderRows);
      setDocuments(documentRows);
      setSelectedDocumentId((current) =>
        documentRows.some((item) => item.id === current) ? current : (documentRows[0]?.id ?? ''),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar la biblioteca de documentos.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  const loadDetail = useCallback(
    async (documentId: string) => {
      if (!documentId) {
        setVersions([]);
        setLinks([]);
        setDownloadEvents([]);
        return;
      }
      setDetailLoading(true);
      try {
        const [versionRows, linkRows, eventRows] = await Promise.all([
          listCommunityDocumentVersions(condominiumId, documentId, session),
          listCommunityDocumentLinks(condominiumId, documentId, session),
          listCommunityDocumentDownloadEvents(condominiumId, session, documentId),
        ]);
        setVersions(versionRows);
        setLinks(linkRows);
        setDownloadEvents(eventRows);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo cargar el detalle del documento.',
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [condominiumId, session],
  );

  useEffect(() => {
    setSelectedDocumentId('');
    setSelectedFolderId('');
    setSelectedCategoryId('');
    setAudienceFilter('');
    setStatusFilter('');
    setSearch('');
    setComposer(null);
    setNotice('');
    void loadLibrary();
  }, [condominiumId, loadLibrary]);

  useEffect(() => {
    void loadDetail(selectedDocumentId);
  }, [loadDetail, selectedDocumentId]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const folderRows = useMemo(() => folderDepthRows(folders), [folders]);

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return documents.filter((document) => {
      if (selectedFolderId && document.folder_id !== selectedFolderId) return false;
      if (selectedCategoryId && document.category_id !== selectedCategoryId) return false;
      if (audienceFilter && document.audience !== audienceFilter) return false;
      if (statusFilter && document.status !== statusFilter) return false;
      if (!term) return true;
      const category = document.category_id
        ? (categoryById.get(document.category_id)?.name ?? '')
        : '';
      const folder = document.folder_id ? (folderById.get(document.folder_id)?.name ?? '') : '';
      return [document.title, document.description ?? '', category, folder]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(term);
    });
  }, [
    audienceFilter,
    categoryById,
    documents,
    folderById,
    search,
    selectedCategoryId,
    selectedFolderId,
    statusFilter,
  ]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;
  const activeCategories = categories.filter((category) => category.is_active);

  const resetDocumentComposer = () => {
    setDocumentTitle('');
    setDocumentDescription('');
    setDocumentFolderId(selectedFolderId);
    setDocumentCategoryId(selectedCategoryId);
    setDocumentAudience('management');
    setDocumentRetention('');
    setInitialFile(null);
  };

  const openComposer = (next: Exclude<Composer, null>) => {
    setNotice('');
    setError('');
    if (next === 'document') resetDocumentComposer();
    if (next === 'folder') {
      setFolderName('');
      setFolderDescription('');
      setFolderParentId(selectedFolderId);
    }
    if (next === 'category') {
      setCategoryName('');
      setCategoryDescription('');
      setCategoryAudience('management');
      setCategoryRetention('');
    }
    setComposer(next);
  };

  const saveDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!documentTitle.trim()) return;
    if (initialFile) {
      const fileError = communityDocumentFileError(initialFile);
      if (fileError) {
        setError(fileError);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const created = await createCommunityDocument(condominiumId, session, {
        title: documentTitle.trim(),
        description: documentDescription.trim() || undefined,
        folderId: documentFolderId || undefined,
        categoryId: documentCategoryId || undefined,
        audience: documentAudience,
        retentionDays: documentRetention ? Number(documentRetention) : undefined,
      });
      if (initialFile) {
        await uploadCommunityDocumentVersion(
          condominiumId,
          created.id,
          session,
          initialFile,
          'Versión inicial',
        );
      }
      setComposer(null);
      setNotice(initialFile ? 'Documento y versión inicial guardados.' : 'Documento creado.');
      await loadLibrary();
      setSelectedDocumentId(created.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear el documento.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createCommunityDocumentFolder(condominiumId, session, {
        name: folderName.trim(),
        description: folderDescription.trim() || undefined,
        parentFolderId: folderParentId || undefined,
      });
      setComposer(null);
      setNotice('Carpeta creada.');
      await loadLibrary();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la carpeta.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createCommunityDocumentCategory(condominiumId, session, {
        name: categoryName.trim(),
        description: categoryDescription.trim() || undefined,
        defaultAudience: categoryAudience,
        defaultRetentionDays: categoryRetention ? Number(categoryRetention) : undefined,
      });
      setComposer(null);
      setNotice('Categoría creada.');
      await loadLibrary();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la categoría.',
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadVersion = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDocument || !versionFile) return;
    const fileError = communityDocumentFileError(versionFile);
    if (fileError) {
      setError(fileError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await uploadCommunityDocumentVersion(
        condominiumId,
        selectedDocument.id,
        session,
        versionFile,
        versionNote,
      );
      setVersionFile(null);
      setVersionNote('');
      setNotice('Nueva versión guardada sin alterar el historial anterior.');
      await Promise.all([loadLibrary(), loadDetail(selectedDocument.id)]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo guardar la nueva versión.',
      );
    } finally {
      setSaving(false);
    }
  };

  const downloadVersion = async (version: CommunityDocumentVersion) => {
    if (!selectedDocument) return;
    setError('');
    try {
      await downloadCommunityDocumentVersion(condominiumId, selectedDocument.id, version, session);
      setNotice('Descarga autorizada y registrada en la auditoría.');
      await loadDetail(selectedDocument.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo descargar el archivo.',
      );
    }
  };

  const archiveSelectedDocument = async () => {
    if (!selectedDocument || selectedDocument.status !== 'active') return;
    if (!window.confirm('¿Archivar este documento? El historial y los archivos se conservarán.'))
      return;
    setSaving(true);
    setError('');
    try {
      await archiveCommunityDocument(condominiumId, selectedDocument.id, session);
      setNotice('Documento archivado. El historial permanece intacto.');
      await loadLibrary();
      await loadDetail(selectedDocument.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo archivar el documento.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDocument || !uuidPattern.test(linkTargetId.trim())) {
      setError('Ingresa un UUID válido del registro relacionado.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await linkCommunityDocument(condominiumId, selectedDocument.id, session, {
        targetType: linkType,
        targetId: linkTargetId.trim(),
      });
      setLinkTargetId('');
      setNotice('Registro relacionado vinculado al documento.');
      await loadDetail(selectedDocument.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo vincular el registro.',
      );
    } finally {
      setSaving(false);
    }
  };

  const onInitialFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setInitialFile(file);
    if (file) {
      const fileError = communityDocumentFileError(file);
      if (fileError) setError(fileError);
    }
  };

  const onVersionFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setVersionFile(file);
    if (file) {
      const fileError = communityDocumentFileError(file);
      if (fileError) setError(fileError);
    }
  };

  if (loading && !documents.length && !categories.length && !folders.length) {
    return <DocumentsLoading />;
  }

  return (
    <div className="documents-page">
      <PageHeader
        actions={
          canManageDocuments ? (
            <div className="documents-header-actions">
              <Button onClick={() => openComposer('folder')} size="sm" variant="secondary">
                Nueva carpeta
              </Button>
              <Button onClick={() => openComposer('category')} size="sm" variant="secondary">
                Nueva categoría
              </Button>
              <Button onClick={() => openComposer('document')} size="sm">
                Nuevo documento
              </Button>
            </div>
          ) : undefined
        }
        description={`${condominiumName} · archivos privados con permisos, versiones y descargas auditadas.`}
        eyebrow="Biblioteca comunitaria"
        title="Documentos"
      />

      {error ? (
        <div className="documents-alert documents-alert--error" role="alert">
          <span>{error}</span>
          <Button onClick={() => setError('')} size="sm" variant="ghost">
            Cerrar
          </Button>
        </div>
      ) : null}
      {notice ? (
        <div className="documents-alert documents-alert--success" role="status">
          <CheckCircleIcon size={18} />
          <span>{notice}</span>
          <Button onClick={() => setNotice('')} size="sm" variant="ghost">
            Cerrar
          </Button>
        </div>
      ) : null}

      {composer ? (
        <Surface className="documents-composer">
          <div className="documents-section-heading">
            <div>
              <span className="documents-kicker">Administración de biblioteca</span>
              <h2>
                {composer === 'document'
                  ? 'Nuevo documento'
                  : composer === 'folder'
                    ? 'Nueva carpeta'
                    : 'Nueva categoría'}
              </h2>
            </div>
            <Button disabled={saving} onClick={() => setComposer(null)} size="sm" variant="ghost">
              Cancelar
            </Button>
          </div>

          {composer === 'document' ? (
            <form className="documents-form-grid" onSubmit={saveDocument}>
              <Field label="Título">
                <input
                  maxLength={200}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  required
                  value={documentTitle}
                />
              </Field>
              <Field label="Carpeta">
                <Select
                  onChange={(event) => setDocumentFolderId(event.target.value)}
                  value={documentFolderId}
                >
                  <option value="">Sin carpeta</option>
                  {folderRows.map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                      {`${'— '.repeat(depth)}${folder.name}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Categoría">
                <Select
                  onChange={(event) => {
                    const categoryId = event.target.value;
                    setDocumentCategoryId(categoryId);
                    const category = categoryById.get(categoryId);
                    if (category) {
                      setDocumentAudience(category.default_audience);
                      setDocumentRetention(
                        category.default_retention_days
                          ? String(category.default_retention_days)
                          : '',
                      );
                    }
                  }}
                  value={documentCategoryId}
                >
                  <option value="">Sin categoría</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Visibilidad">
                <Select
                  onChange={(event) =>
                    setDocumentAudience(event.target.value as CommunityDocumentAudience)
                  }
                  value={documentAudience}
                >
                  {Object.entries(audienceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                hint="Déjalo vacío si no aplica una retención específica."
                label="Retención (días)"
              >
                <input
                  min={1}
                  onChange={(event) => setDocumentRetention(event.target.value)}
                  type="number"
                  value={documentRetention}
                />
              </Field>
              <Field hint="PDF, JPG o PNG · máximo 10 MB." label="Archivo inicial (opcional)">
                <input accept={COMMUNITY_DOCUMENT_ACCEPT} onChange={onInitialFile} type="file" />
              </Field>
              <Field label="Descripción">
                <textarea
                  maxLength={4000}
                  onChange={(event) => setDocumentDescription(event.target.value)}
                  rows={3}
                  value={documentDescription}
                />
              </Field>
              <div className="documents-form-actions">
                <Button disabled={saving || !documentTitle.trim()} type="submit">
                  {saving ? 'Guardando…' : 'Crear documento'}
                </Button>
              </div>
            </form>
          ) : null}

          {composer === 'folder' ? (
            <form className="documents-form-grid" onSubmit={saveFolder}>
              <Field label="Nombre">
                <input
                  maxLength={120}
                  onChange={(event) => setFolderName(event.target.value)}
                  required
                  value={folderName}
                />
              </Field>
              <Field label="Carpeta superior">
                <Select
                  onChange={(event) => setFolderParentId(event.target.value)}
                  value={folderParentId}
                >
                  <option value="">Raíz de la biblioteca</option>
                  {folderRows.map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                      {`${'— '.repeat(depth)}${folder.name}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Descripción">
                <textarea
                  maxLength={1000}
                  onChange={(event) => setFolderDescription(event.target.value)}
                  rows={3}
                  value={folderDescription}
                />
              </Field>
              <div className="documents-form-actions">
                <Button disabled={saving || !folderName.trim()} type="submit">
                  {saving ? 'Guardando…' : 'Crear carpeta'}
                </Button>
              </div>
            </form>
          ) : null}

          {composer === 'category' ? (
            <form className="documents-form-grid" onSubmit={saveCategory}>
              <Field label="Nombre">
                <input
                  maxLength={120}
                  onChange={(event) => setCategoryName(event.target.value)}
                  required
                  value={categoryName}
                />
              </Field>
              <Field label="Visibilidad predeterminada">
                <Select
                  onChange={(event) =>
                    setCategoryAudience(event.target.value as CommunityDocumentAudience)
                  }
                  value={categoryAudience}
                >
                  {Object.entries(audienceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Retención predeterminada (días)">
                <input
                  min={1}
                  onChange={(event) => setCategoryRetention(event.target.value)}
                  type="number"
                  value={categoryRetention}
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  maxLength={1000}
                  onChange={(event) => setCategoryDescription(event.target.value)}
                  rows={3}
                  value={categoryDescription}
                />
              </Field>
              <div className="documents-form-actions">
                <Button disabled={saving || !categoryName.trim()} type="submit">
                  {saving ? 'Guardando…' : 'Crear categoría'}
                </Button>
              </div>
            </form>
          ) : null}
        </Surface>
      ) : null}

      <div className="documents-layout">
        <Surface className="documents-nav-panel">
          <div className="documents-section-heading documents-section-heading--compact">
            <div>
              <span className="documents-kicker">Organización</span>
              <h2>Biblioteca</h2>
            </div>
          </div>
          <nav aria-label="Carpetas de documentos" className="documents-folder-nav">
            <button
              className={!selectedFolderId ? 'is-active' : ''}
              onClick={() => setSelectedFolderId('')}
              type="button"
            >
              <span>Toda la biblioteca</span>
              <b>{documents.length}</b>
            </button>
            {folderRows.map(({ folder, depth }) => {
              const count = documents.filter((document) => document.folder_id === folder.id).length;
              return (
                <button
                  className={selectedFolderId === folder.id ? 'is-active' : ''}
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  style={{ paddingInlineStart: `${16 + depth * 14}px` }}
                  type="button"
                >
                  <span>{folder.name}</span>
                  <b>{count}</b>
                </button>
              );
            })}
          </nav>

          <div className="documents-category-nav">
            <span className="documents-kicker">Categorías</span>
            <button
              className={!selectedCategoryId ? 'is-active' : ''}
              onClick={() => setSelectedCategoryId('')}
              type="button"
            >
              Todas
            </button>
            {activeCategories.map((category) => (
              <button
                className={selectedCategoryId === category.id ? 'is-active' : ''}
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>
        </Surface>

        <Surface className="documents-library-panel">
          <div className="documents-section-heading">
            <div>
              <span className="documents-kicker">Archivos autorizados</span>
              <h2>
                {selectedFolderId
                  ? (folderById.get(selectedFolderId)?.name ?? 'Carpeta')
                  : 'Documentos'}
              </h2>
              <p>{filteredDocuments.length} visibles con los filtros actuales.</p>
            </div>
            <Button onClick={() => void loadLibrary()} size="sm" variant="ghost">
              Actualizar
            </Button>
          </div>

          <div className="documents-filters">
            <label className="documents-search">
              <span className="sr-only">Buscar documentos</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por título, carpeta o categoría…"
                type="search"
                value={search}
              />
            </label>
            <Select
              aria-label="Filtrar por visibilidad"
              onChange={(event) => setAudienceFilter(event.target.value as AudienceFilter)}
              value={audienceFilter}
            >
              <option value="">Toda visibilidad</option>
              {Object.entries(audienceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {canManageDocuments ? (
              <Select
                aria-label="Filtrar por estado"
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                value={statusFilter}
              >
                <option value="">Activos y archivados</option>
                <option value="active">Activos</option>
                <option value="archived">Archivados</option>
              </Select>
            ) : null}
          </div>

          {filteredDocuments.length ? (
            <div className="documents-list">
              {filteredDocuments.map((document) => {
                const selected = selectedDocumentId === document.id;
                const category = document.category_id
                  ? categoryById.get(document.category_id)
                  : undefined;
                const folder = document.folder_id ? folderById.get(document.folder_id) : undefined;
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? 'documents-row is-selected' : 'documents-row'}
                    key={document.id}
                    onClick={() => setSelectedDocumentId(document.id)}
                    type="button"
                  >
                    <span className="documents-file-mark" aria-hidden="true">
                      <ReportsIcon size={19} />
                    </span>
                    <span className="documents-row__copy">
                      <strong>{document.title}</strong>
                      <small>
                        {[folder?.name, category?.name].filter(Boolean).join(' · ') ||
                          'Sin clasificación'}
                      </small>
                    </span>
                    <span className="documents-row__meta">
                      <Badge tone={document.status === 'active' ? 'success' : 'neutral'}>
                        {document.status === 'active' ? 'Activo' : 'Archivado'}
                      </Badge>
                      <Badge tone="info">{audienceLabels[document.audience]}</Badge>
                      <small>v{document.latest_version_number}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              actionLabel={canManageDocuments ? 'Crear documento' : undefined}
              description="Ajusta los filtros o agrega el primer archivo de esta sección."
              icon={<CommunityIcon size={28} />}
              onAction={canManageDocuments ? () => openComposer('document') : undefined}
              title="No hay documentos para mostrar"
            />
          )}
        </Surface>

        <Surface className="documents-detail-panel">
          {!selectedDocument ? (
            <EmptyState
              description="Selecciona un documento para consultar versiones, descargas y registros relacionados."
              icon={<ReportsIcon size={28} />}
              title="Selecciona un documento"
            />
          ) : detailLoading ? (
            <div aria-label="Cargando detalle" className="documents-detail-loading">
              <Skeleton className="skeleton--title" />
              <Skeleton className="skeleton--card" />
              <Skeleton className="skeleton--card" />
            </div>
          ) : (
            <>
              <div className="documents-detail-heading">
                <div>
                  <span className="documents-kicker">Detalle del documento</span>
                  <h2>{selectedDocument.title}</h2>
                  <p>{selectedDocument.description || 'Sin descripción.'}</p>
                </div>
                {canManageDocuments && selectedDocument.status === 'active' ? (
                  <Button
                    disabled={saving}
                    onClick={() => void archiveSelectedDocument()}
                    size="sm"
                    variant="danger"
                  >
                    Archivar
                  </Button>
                ) : null}
              </div>

              <dl className="documents-metadata">
                <div>
                  <dt>Visibilidad</dt>
                  <dd>{audienceLabels[selectedDocument.audience]}</dd>
                </div>
                <div>
                  <dt>Retención</dt>
                  <dd>
                    {selectedDocument.retention_days
                      ? `${selectedDocument.retention_days} días`
                      : 'Sin política específica'}
                  </dd>
                </div>
                <div>
                  <dt>Última versión</dt>
                  <dd>v{selectedDocument.latest_version_number}</dd>
                </div>
                <div>
                  <dt>Actualizado</dt>
                  <dd>{formatDate(selectedDocument.updated_at)}</dd>
                </div>
              </dl>

              <section className="documents-detail-section">
                <div className="documents-subheading">
                  <div>
                    <h3>Versiones</h3>
                    <p>El historial es inmutable; una corrección crea una versión nueva.</p>
                  </div>
                  <Badge tone="neutral">{versions.length}</Badge>
                </div>

                {canManageDocuments && selectedDocument.status === 'active' ? (
                  <form className="documents-version-form" onSubmit={uploadVersion}>
                    <Field hint="PDF, JPG o PNG · máximo 10 MB." label="Nueva versión">
                      <input
                        accept={COMMUNITY_DOCUMENT_ACCEPT}
                        onChange={onVersionFile}
                        type="file"
                      />
                    </Field>
                    <Field label="Nota del cambio">
                      <input
                        maxLength={1000}
                        onChange={(event) => setVersionNote(event.target.value)}
                        placeholder="Ej. Acta corregida y aprobada"
                        value={versionNote}
                      />
                    </Field>
                    <Button disabled={saving || !versionFile} size="sm" type="submit">
                      {saving ? 'Subiendo…' : 'Guardar versión'}
                    </Button>
                  </form>
                ) : null}

                {versions.length ? (
                  <div className="documents-history-list">
                    {versions.map((version) => (
                      <article key={version.id}>
                        <div>
                          <strong>Versión {version.version_number}</strong>
                          <span>{version.original_filename}</span>
                          <small>
                            {formatBytes(version.size_bytes)} · {formatDate(version.created_at)}
                          </small>
                          {version.change_note ? <p>{version.change_note}</p> : null}
                        </div>
                        <Button
                          onClick={() => void downloadVersion(version)}
                          size="sm"
                          variant="secondary"
                        >
                          Descargar
                        </Button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="documents-muted">
                    Este documento todavía no tiene un archivo cargado.
                  </p>
                )}
              </section>

              <section className="documents-detail-section">
                <div className="documents-subheading">
                  <div>
                    <h3>Registros relacionados</h3>
                    <p>Conecta el archivo con el contexto operativo que lo originó.</p>
                  </div>
                  <Badge tone="neutral">{links.length}</Badge>
                </div>

                {canManageDocuments ? (
                  <form className="documents-link-form" onSubmit={saveLink}>
                    <Select
                      aria-label="Tipo de registro relacionado"
                      onChange={(event) =>
                        setLinkType(event.target.value as CommunityDocumentLinkType)
                      }
                      value={linkType}
                    >
                      {Object.entries(linkLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <input
                      aria-label="UUID del registro relacionado"
                      onChange={(event) => setLinkTargetId(event.target.value)}
                      placeholder="UUID del registro"
                      value={linkTargetId}
                    />
                    <Button disabled={saving || !linkTargetId.trim()} size="sm" type="submit">
                      Vincular
                    </Button>
                  </form>
                ) : null}

                {links.length ? (
                  <div className="documents-links-list">
                    {links.map((link) => (
                      <a
                        href={`${linkRoutes[link.target_type]}?focus=${encodeURIComponent(link.target_id)}`}
                        key={link.id}
                      >
                        <span>
                          <strong>{linkLabels[link.target_type]}</strong>
                          <small>{shortId(link.target_id)}</small>
                        </span>
                        <ArrowRightIcon size={16} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="documents-muted">No hay registros relacionados todavía.</p>
                )}
              </section>

              <section className="documents-detail-section">
                <div className="documents-subheading">
                  <div>
                    <h3>Historial de descargas</h3>
                    <p>
                      {canManageDocuments
                        ? 'Actividad visible para administración y junta.'
                        : 'Tu actividad de descarga para este documento.'}
                    </p>
                  </div>
                  <Badge tone="neutral">{downloadEvents.length}</Badge>
                </div>
                {downloadEvents.length ? (
                  <div className="documents-download-list">
                    {downloadEvents.map((downloadEvent) => {
                      const version = versions.find((item) => item.id === downloadEvent.version_id);
                      return (
                        <article key={downloadEvent.id}>
                          <div>
                            <strong>
                              {version ? `Versión ${version.version_number}` : 'Versión histórica'}
                            </strong>
                            <span>{formatDate(downloadEvent.occurred_at)}</span>
                          </div>
                          <small>Usuario {shortId(downloadEvent.actor_user_id)}</small>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="documents-muted">Aún no hay descargas registradas.</p>
                )}
              </section>
            </>
          )}
        </Surface>
      </div>
    </div>
  );
}
