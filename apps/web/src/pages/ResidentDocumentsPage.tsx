import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, CommunityIcon, ReportsIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Skeleton, Surface } from '../components/ui';
import {
  downloadCommunityDocumentVersion,
  listCommunityDocumentCategories,
  listCommunityDocumentFolders,
  listCommunityDocuments,
  listCommunityDocumentVersions,
} from '../features/documents/community-api';
import type {
  CommunityDocument,
  CommunityDocumentAudience,
  CommunityDocumentCategory,
  CommunityDocumentFolder,
  CommunityDocumentVersion,
} from '../features/documents/community-api';
import '../resident-community.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const audienceLabels: Record<CommunityDocumentAudience, string> = {
  management: 'Administración y junta',
  owners: 'Propietarios',
  residents: 'Residentes',
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value));

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

function ResidentDocumentsLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando documentos" className="resident-documents">
      <PageHeader eyebrow="Mi comunidad" title="Documentos" />
      <Skeleton className="skeleton--card" />
      <div className="resident-documents__layout">
        <Skeleton className="skeleton--card" />
        <Skeleton className="skeleton--card" />
      </div>
    </div>
  );
}

export function ResidentDocumentsPage({ condominiumId, condominiumName, session }: Props) {
  const [categories, setCategories] = useState<CommunityDocumentCategory[]>([]);
  const [folders, setFolders] = useState<CommunityDocumentFolder[]>([]);
  const [documents, setDocuments] = useState<CommunityDocument[]>([]);
  const [versions, setVersions] = useState<CommunityDocumentVersion[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
        documentRows.some((document) => document.id === current)
          ? current
          : (documentRows[0]?.id ?? ''),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar los documentos compartidos contigo.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  const loadVersions = useCallback(
    async (documentId: string) => {
      if (!documentId) {
        setVersions([]);
        return;
      }
      setDetailLoading(true);
      setError('');
      try {
        setVersions(await listCommunityDocumentVersions(condominiumId, documentId, session));
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudieron cargar las versiones del documento.',
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [condominiumId, session],
  );

  useEffect(() => {
    setSearch('');
    setSelectedCategoryId('');
    setSelectedFolderId('');
    setSelectedDocumentId('');
    setNotice('');
    void loadLibrary();
  }, [condominiumId, loadLibrary]);

  useEffect(() => {
    void loadVersions(selectedDocumentId);
  }, [loadVersions, selectedDocumentId]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return documents.filter((document) => {
      if (selectedCategoryId && document.category_id !== selectedCategoryId) return false;
      if (selectedFolderId && document.folder_id !== selectedFolderId) return false;
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
    categoryById,
    documents,
    folderById,
    search,
    selectedCategoryId,
    selectedFolderId,
  ]);

  useEffect(() => {
    if (filteredDocuments.some((document) => document.id === selectedDocumentId)) return;
    setSelectedDocumentId(filteredDocuments[0]?.id ?? '');
  }, [filteredDocuments, selectedDocumentId]);

  const selectedDocument =
    filteredDocuments.find((document) => document.id === selectedDocumentId) ?? null;
  const sortedVersions = useMemo(
    () => [...versions].sort((left, right) => right.version_number - left.version_number),
    [versions],
  );
  const latestVersion = sortedVersions[0] ?? null;

  const downloadVersion = async (version: CommunityDocumentVersion) => {
    if (!selectedDocument) return;
    setError('');
    setNotice('');
    try {
      await downloadCommunityDocumentVersion(
        condominiumId,
        selectedDocument.id,
        version,
        session,
      );
      setNotice('Descarga iniciada.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo descargar el documento.',
      );
    }
  };

  if (loading && !documents.length) return <ResidentDocumentsLoading />;

  return (
    <div className="resident-documents">
      <PageHeader
        description={`${condominiumName} · consulta únicamente los archivos compartidos con tu rol.`}
        eyebrow="Mi comunidad"
        title="Documentos"
      />

      {error ? (
        <div className="resident-documents__alert" data-tone="error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="resident-documents__alert" data-tone="success" role="status">
          <CheckCircleIcon size={17} /> {notice}
        </div>
      ) : null}

      <Surface className="resident-documents__filters">
        <label>
          <span>Buscar</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Título, categoría o carpeta"
            type="search"
            value={search}
          />
        </label>
        {categories.length ? (
          <label>
            <span>Categoría</span>
            <select
              onChange={(event) => setSelectedCategoryId(event.target.value)}
              value={selectedCategoryId}
            >
              <option value="">Todas</option>
              {categories
                .filter((category) => category.is_active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        {folders.length ? (
          <label>
            <span>Carpeta</span>
            <select
              onChange={(event) => setSelectedFolderId(event.target.value)}
              value={selectedFolderId}
            >
              <option value="">Todas</option>
              {folders
                .filter((folder) => folder.is_active)
                .map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </Surface>

      {!filteredDocuments.length ? (
        <Surface className="resident-documents__empty">
          <EmptyState
            description="Cuando la administración comparta un archivo con tu rol aparecerá aquí."
            icon={<CommunityIcon size={26} />}
            title={documents.length ? 'No hay resultados con estos filtros' : 'Aún no hay documentos'}
          />
        </Surface>
      ) : (
        <section className="resident-documents__layout">
          <Surface className="resident-documents__library">
            <div className="resident-documents__heading">
              <div>
                <span className="hq-kicker">Biblioteca</span>
                <h2>Archivos disponibles</h2>
              </div>
              <span>{filteredDocuments.length}</span>
            </div>
            <div className="resident-documents__list">
              {filteredDocuments.map((document) => {
                const category = document.category_id
                  ? categoryById.get(document.category_id)?.name
                  : undefined;
                const folder = document.folder_id ? folderById.get(document.folder_id)?.name : undefined;
                return (
                  <button
                    aria-current={selectedDocumentId === document.id ? 'true' : undefined}
                    key={document.id}
                    onClick={() => setSelectedDocumentId(document.id)}
                    type="button"
                  >
                    <span className="resident-documents__file-icon">
                      <ReportsIcon size={18} />
                    </span>
                    <span className="resident-documents__file-copy">
                      <strong>{document.title}</strong>
                      <small>{[category, folder].filter(Boolean).join(' · ') || 'Documento comunitario'}</small>
                    </span>
                    <Badge tone={document.status === 'active' ? 'info' : 'neutral'}>
                      {document.status === 'active' ? 'Disponible' : 'Archivado'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </Surface>

          <Surface className="resident-documents__detail">
            {selectedDocument ? (
              <>
                <div className="resident-documents__detail-heading">
                  <span className="hq-kicker">Documento</span>
                  <h2>{selectedDocument.title}</h2>
                  <p>{selectedDocument.description || 'Sin descripción adicional.'}</p>
                </div>
                <div className="resident-documents__meta">
                  <span>
                    <small>Compartido con</small>
                    <strong>{audienceLabels[selectedDocument.audience]}</strong>
                  </span>
                  <span>
                    <small>Actualizado</small>
                    <strong>{formatDate(selectedDocument.updated_at)}</strong>
                  </span>
                </div>

                {detailLoading ? (
                  <Skeleton className="skeleton--card" />
                ) : latestVersion ? (
                  <>
                    <Button onClick={() => void downloadVersion(latestVersion)}>
                      Descargar versión actual
                    </Button>
                    <div className="resident-documents__versions">
                      <div className="resident-documents__heading">
                        <div>
                          <span className="hq-kicker">Historial</span>
                          <h3>Versiones disponibles</h3>
                        </div>
                      </div>
                      {sortedVersions.map((version) => (
                        <article key={version.id}>
                          <div>
                            <strong>Versión {version.version_number}</strong>
                            <small>
                              {version.original_filename} · {formatBytes(version.size_bytes)} ·{' '}
                              {formatDate(version.created_at)}
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
                  </>
                ) : (
                  <div className="resident-documents__no-file">
                    Este documento todavía no tiene un archivo disponible para descargar.
                  </div>
                )}
              </>
            ) : null}
          </Surface>
        </section>
      )}
    </div>
  );
}
