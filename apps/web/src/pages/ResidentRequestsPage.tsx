import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../components/Drawer';
import { FormActions, FormGrid } from '../components/FormLayout';
import { CheckCircleIcon, RequestsIcon, UnitsIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { PrivateDocumentUploader } from '../features/documents/PrivateDocumentUploader';
import { downloadPrivateDocument } from '../features/documents/api';
import { apiRequest } from '../lib/api';
import { canWriteResidentRequests, useCondominiumRoles } from '../lib/roles';
import {
  eventLabel,
  filterServiceRequests,
  formatRequestDate,
  getEventDetail,
  isOpenRequest,
  priorityLabels,
  statusLabels,
} from '../lib/service-requests';
import type {
  ServiceRequestAttachment,
  ServiceRequestCategory,
  ServiceRequestComment,
  ServiceRequestEvent,
  ServiceRequestFilters,
  ServiceRequestPriority,
  ServiceRequestRecord,
  ServiceRequestStatus,
  ServiceRequestUnit,
} from '../lib/service-requests';
import '../resident-requests.css';

const priorities: ServiceRequestPriority[] = ['low', 'normal', 'high', 'urgent'];
const statuses: ServiceRequestStatus[] = [
  'submitted',
  'acknowledged',
  'in_progress',
  'waiting_resident',
  'waiting_vendor',
  'resolved',
  'closed',
  'cancelled',
];

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type ResidentRequestData = {
  requests: ServiceRequestRecord[];
  categories: ServiceRequestCategory[];
  units: ServiceRequestUnit[];
};

type DetailData = {
  comments: ServiceRequestComment[];
  events: ServiceRequestEvent[];
  attachments: ServiceRequestAttachment[];
};

type ResidentFilters = Pick<ServiceRequestFilters, 'query' | 'status' | 'categoryId'>;
type ResidentDrawer = 'create' | 'detail' | null;

const emptyFilters: ResidentFilters = { query: '', status: '', categoryId: '' };

const statusTone = (status: ServiceRequestStatus) => {
  if (status === 'resolved' || status === 'closed') return 'success' as const;
  if (status === 'waiting_resident' || status === 'waiting_vendor') return 'warning' as const;
  if (status === 'cancelled') return 'neutral' as const;
  return 'info' as const;
};

const priorityTone = (priority: ServiceRequestPriority) => {
  if (priority === 'urgent' || priority === 'high') return 'warning' as const;
  if (priority === 'low') return 'neutral' as const;
  return 'info' as const;
};

function ResidentRequestsLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando solicitudes" className="resident-requests">
      <PageHeader eyebrow="Mi comunidad" title="Solicitudes" />
      <Skeleton className="skeleton--card" />
      <Skeleton className="skeleton--card" />
    </div>
  );
}

function ResidentDrawerShell({
  title,
  eyebrow,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Drawer
      description={description}
      eyebrow={eyebrow}
      onClose={onClose}
      prefix="resident-requests"
      presentation="workspace"
      title={title}
      wide={wide}
    >
      {children}
    </Drawer>
  );
}

function CreateResidentRequestDrawer({
  condominiumId,
  session,
  categories,
  units,
  onClose,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  categories: ServiceRequestCategory[];
  units: ServiceRequestUnit[];
  onClose: () => void;
  onCreated: (request: ServiceRequestRecord) => void;
}) {
  const activeCategories = categories.filter((category) => category.is_active);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id ?? '');
  const [priority, setPriority] = useState<ServiceRequestPriority>('normal');
  const [unitId, setUnitId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: {
        categoryId: string;
        title: string;
        description: string;
        priority: ServiceRequestPriority;
        unitId?: string;
      } = {
        categoryId,
        title: title.trim(),
        description: description.trim(),
        priority,
      };
      if (unitId) payload.unitId = unitId;
      const created = await apiRequest<ServiceRequestRecord>(
        `/v1/condominiums/${condominiumId}/requests`,
        session,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      onCreated(created);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la solicitud.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResidentDrawerShell
      description="Describe el problema con claridad. La administración podrá darle seguimiento desde su espacio operativo."
      eyebrow="Nueva solicitud"
      onClose={onClose}
      title="¿Qué necesitas reportar?"
    >
      <form className="resident-request-form ux-form" onSubmit={(event) => void submit(event)}>
        <Field label="Título">
          <input
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ej. Filtración en la cocina"
            required
            value={title}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Cuéntanos dónde ocurre, desde cuándo y cualquier detalle útil."
            required
            rows={6}
            value={description}
          />
        </Field>
        <FormGrid>
          <Field label="Categoría">
            <Select
              disabled={!activeCategories.length}
              onChange={(event) => setCategoryId(event.target.value)}
              required
              value={categoryId}
            >
              {!activeCategories.length ? (
                <option value="">Sin categorías disponibles</option>
              ) : null}
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridad" hint="Usa Urgente solo ante riesgo o daño activo.">
            <Select
              onChange={(event) => setPriority(event.target.value as ServiceRequestPriority)}
              value={priority}
            >
              {priorities.map((item) => (
                <option key={item} value={item}>
                  {priorityLabels[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unidad o ubicación">
            <Select onChange={(event) => setUnitId(event.target.value)} value={unitId}>
              <option value="">Área común / sin unidad</option>
              {units
                .filter((unit) => unit.status === 'active')
                .map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unidad {unit.code}
                  </option>
                ))}
            </Select>
          </Field>
        </FormGrid>
        {error ? (
          <div className="resident-requests__message" data-tone="error" role="alert">
            {error}
          </div>
        ) : null}
        <FormActions>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancelar
          </Button>
          <Button disabled={saving || !categoryId} type="submit">
            {saving ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </FormActions>
      </form>
    </ResidentDrawerShell>
  );
}

function ResidentRequestTimeline({ detail }: { detail: DetailData }) {
  const items = [
    ...detail.events
      .filter((event) => event.visibility === 'public')
      .map((event) => ({
        id: `event-${event.id}`,
        date: event.created_at,
        title: eventLabel(event.event_type),
        body: getEventDetail(event),
      })),
    ...detail.comments
      .filter((comment) => comment.visibility === 'public')
      .map((comment) => ({
        id: `comment-${comment.id}`,
        date: comment.created_at,
        title: 'Comentario',
        body: comment.body,
      })),
  ].sort((left, right) => right.date.localeCompare(left.date));

  if (!items.length) {
    return <div className="resident-request-detail__empty">Todavía no hay actualizaciones.</div>;
  }

  return (
    <div className="resident-request-timeline">
      {items.map((item) => (
        <article key={item.id}>
          <span className="resident-request-timeline__dot" />
          <div>
            <header>
              <strong>{item.title}</strong>
              <time>{formatRequestDate(item.date, { hour: '2-digit', minute: '2-digit' })}</time>
            </header>
            {item.body ? <p>{item.body}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function ResidentRequestDetailDrawer({
  request,
  condominiumId,
  session,
  categories,
  units,
  canWrite,
  onClose,
  onChanged,
}: {
  request: ServiceRequestRecord;
  condominiumId: string;
  session: Session;
  categories: ServiceRequestCategory[];
  units: ServiceRequestUnit[];
  canWrite: boolean;
  onClose: () => void;
  onChanged: (request?: ServiceRequestRecord) => Promise<void>;
}) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const base = `/v1/condominiums/${condominiumId}/requests/${request.id}`;
    const [comments, events, attachments] = await Promise.allSettled([
      apiRequest<ServiceRequestComment[]>(`${base}/comments`, session),
      apiRequest<ServiceRequestEvent[]>(`${base}/events`, session),
      apiRequest<ServiceRequestAttachment[]>(`${base}/attachments`, session),
    ]);
    setDetail({
      comments: comments.status === 'fulfilled' ? comments.value : [],
      events: events.status === 'fulfilled' ? events.value : [],
      attachments: attachments.status === 'fulfilled' ? attachments.value : [],
    });
    setLoading(false);
  }, [condominiumId, request.id, session]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite || !comment.trim()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/requests/${request.id}/comments`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ body: comment.trim(), visibility: 'public' }),
        },
      );
      setComment('');
      setMessage('Comentario publicado.');
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo publicar el comentario.',
      );
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!canWrite || cancelReason.trim().length < 3) {
      setError('Indica el motivo de la cancelación.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await apiRequest<ServiceRequestRecord>(
        `/v1/condominiums/${condominiumId}/requests/${request.id}/cancel`,
        session,
        { method: 'POST', body: JSON.stringify({ reason: cancelReason.trim() }) },
      );
      setCancelReason('');
      setMessage('Solicitud cancelada.');
      await onChanged(updated);
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cancelar la solicitud.',
      );
    } finally {
      setSaving(false);
    }
  };

  const category = categories.find((item) => item.id === request.category_id);
  const unit = units.find((item) => item.id === request.unit_id);
  const terminal = request.status === 'closed' || request.status === 'cancelled';
  const canCancel =
    canWrite && request.submitted_by_user_id === session.user.id && isOpenRequest(request.status);
  const publicAttachments =
    detail?.attachments.filter((item) => item.visibility === 'public') ?? [];

  return (
    <ResidentDrawerShell
      eyebrow={request.request_number}
      onClose={onClose}
      title={request.title}
      wide
    >
      <div className="resident-request-detail__summary">
        <div className="resident-request-detail__badges">
          <Badge tone={statusTone(request.status)}>{statusLabels[request.status]}</Badge>
          <Badge tone={priorityTone(request.priority)}>{priorityLabels[request.priority]}</Badge>
        </div>
        <p>{request.description}</p>
        <dl>
          <div>
            <dt>Categoría</dt>
            <dd>{category?.name ?? 'Sin categoría'}</dd>
          </div>
          <div>
            <dt>Ubicación</dt>
            <dd>{unit ? `Unidad ${unit.code}` : 'Área común'}</dd>
          </div>
          <div>
            <dt>Actualizada</dt>
            <dd>{formatRequestDate(request.updated_at)}</dd>
          </div>
          {request.due_at ? (
            <div>
              <dt>Fecha objetivo</dt>
              <dd>{formatRequestDate(request.due_at)}</dd>
            </div>
          ) : null}
        </dl>
        {request.resolution_summary ? (
          <div className="resident-request-detail__resolution">
            <CheckCircleIcon size={18} />
            <div>
              <strong>Resolución</strong>
              <span>{request.resolution_summary}</span>
            </div>
          </div>
        ) : null}
      </div>

      {message ? (
        <div className="resident-requests__message" data-tone="success" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="resident-requests__message" data-tone="error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="resident-request-detail__grid">
        <section>
          <div className="resident-request-section-heading">
            <span className="hq-kicker">Seguimiento</span>
            <h3>Actividad de la solicitud</h3>
            <p>Solo se muestran actualizaciones compartidas con residentes.</p>
          </div>
          {loading || !detail ? (
            <Skeleton className="skeleton--card" />
          ) : (
            <ResidentRequestTimeline detail={detail} />
          )}
        </section>

        <aside>
          {canWrite && !terminal ? (
            <form
              className="resident-request-comment ux-form"
              onSubmit={(event) => void addComment(event)}
            >
              <div className="resident-request-section-heading">
                <span className="hq-kicker">Conversación</span>
                <h3>Agregar comentario</h3>
                <p>
                  Tu comentario será visible para la administración y para residentes autorizados.
                </p>
              </div>
              <textarea
                maxLength={3000}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Escribe una actualización…"
                required
                rows={4}
                value={comment}
              />
              <Button disabled={saving || !comment.trim()} size="sm" type="submit">
                {saving ? 'Publicando…' : 'Publicar comentario'}
              </Button>
            </form>
          ) : null}

          <Surface className="resident-request-attachments">
            <div className="resident-request-section-heading">
              <span className="hq-kicker">Archivos</span>
              <h3>Documentos y fotografías</h3>
            </div>
            {publicAttachments.length ? (
              <div className="resident-request-attachments__list">
                {publicAttachments.map((attachment) => (
                  <div key={attachment.id}>
                    <span>
                      <RequestsIcon size={17} />
                    </span>
                    <div>
                      <strong>{attachment.original_filename}</strong>
                      <small>{Math.max(1, Math.ceil(attachment.size_bytes / 1024))} KB</small>
                    </div>
                    <Button
                      onClick={() =>
                        void downloadPrivateDocument(
                          `/v1/condominiums/${condominiumId}/requests/${request.id}/attachments/${attachment.id}/file`,
                          session,
                          attachment.original_filename,
                        ).catch((downloadError: Error) => setError(downloadError.message))
                      }
                      size="sm"
                      variant="secondary"
                    >
                      Descargar
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="resident-request-detail__empty">No hay archivos compartidos.</div>
            )}
            {canWrite && !terminal ? (
              <PrivateDocumentUploader
                description="PDF, imágenes u otros soportes permitidos. El archivo será visible para residentes autorizados."
                onUploaded={loadDetail}
                path={`/v1/condominiums/${condominiumId}/requests/${request.id}/attachments`}
                session={session}
                title="Adjuntar soporte"
                visibility="public"
              />
            ) : null}
          </Surface>

          {canCancel ? (
            <Surface className="resident-request-cancel">
              <div className="resident-request-section-heading">
                <span className="hq-kicker">Cancelar</span>
                <h3>¿Ya no necesitas esta solicitud?</h3>
                <p>El historial se conserva aunque la canceles.</p>
              </div>
              <textarea
                maxLength={1000}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Indica el motivo"
                rows={3}
                value={cancelReason}
              />
              <Button
                disabled={saving || cancelReason.trim().length < 3}
                onClick={() => void cancel()}
                size="sm"
                variant="danger"
              >
                Cancelar solicitud
              </Button>
            </Surface>
          ) : null}
        </aside>
      </div>
    </ResidentDrawerShell>
  );
}

export function ResidentRequestsPage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const canWrite = canWriteResidentRequests(roles);
  const [data, setData] = useState<ResidentRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [filters, setFilters] = useState<ResidentFilters>(emptyFilters);
  const [drawer, setDrawer] = useState<ResidentDrawer>(null);
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarning('');
    const base = `/v1/condominiums/${condominiumId}`;
    const [requests, categories, units] = await Promise.allSettled([
      apiRequest<ServiceRequestRecord[]>(`${base}/requests`, session),
      apiRequest<ServiceRequestCategory[]>(`${base}/request-categories`, session),
      apiRequest<ServiceRequestUnit[]>(`${base}/units`, session),
    ]);

    if (requests.status === 'rejected') {
      setError(
        requests.reason instanceof Error
          ? requests.reason.message
          : 'No se pudieron cargar tus solicitudes.',
      );
      setLoading(false);
      return;
    }

    const degraded = [
      categories.status === 'rejected' ? 'categorías' : '',
      units.status === 'rejected' ? 'unidades' : '',
    ].filter(Boolean);
    setData({
      requests: requests.value,
      categories: categories.status === 'fulfilled' ? categories.value : [],
      units: units.status === 'fulfilled' ? units.value : [],
    });
    if (degraded.length) setWarning(`No se pudieron actualizar: ${degraded.join(' y ')}.`);
    setLoading(false);
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setFilters(emptyFilters);
    setSelectedId('');
    setDrawer(null);
  }, [condominiumId]);

  const filtered = useMemo(
    () =>
      data
        ? filterServiceRequests(data.requests, data.categories, data.units, [], {
            query: filters.query,
            status: filters.status,
            priority: '',
            categoryId: filters.categoryId,
            unitId: '',
            assignment: '',
          })
        : [],
    [data, filters],
  );
  const openCount = data?.requests.filter((request) => isOpenRequest(request.status)).length ?? 0;
  const waitingCount =
    data?.requests.filter((request) => request.status === 'waiting_resident').length ?? 0;
  const completedCount =
    data?.requests.filter((request) => request.status === 'resolved' || request.status === 'closed')
      .length ?? 0;
  const selected = data?.requests.find((request) => request.id === selectedId) ?? null;
  const activeCategories = data?.categories.filter((category) => category.is_active) ?? [];
  const canCreate = canWrite && activeCategories.length > 0;

  const openDetail = (requestId: string) => {
    setSelectedId(requestId);
    setDrawer('detail');
  };

  const handleChanged = async (updated?: ServiceRequestRecord) => {
    if (updated) {
      setData((current) =>
        current
          ? {
              ...current,
              requests: current.requests.some((request) => request.id === updated.id)
                ? current.requests.map((request) => (request.id === updated.id ? updated : request))
                : [updated, ...current.requests],
            }
          : current,
      );
      setSelectedId(updated.id);
      return;
    }
    await load();
  };

  if (loading && !data) return <ResidentRequestsLoading />;

  if (!data) {
    return (
      <Surface className="resident-requests__load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir el módulo de solicitudes.'}
          icon={<RequestsIcon size={28} />}
          onAction={() => void load()}
          title="Solicitudes no disponibles"
        />
      </Surface>
    );
  }

  return (
    <div className="resident-requests">
      <PageHeader
        actions={
          canWrite ? (
            <Button disabled={!canCreate} onClick={() => setDrawer('create')} size="sm">
              <RequestsIcon size={17} />
              Nueva solicitud
            </Button>
          ) : undefined
        }
        description={`${condominiumName} · reporta incidencias y sigue las actualizaciones compartidas contigo.`}
        eyebrow="Mi comunidad"
        title="Solicitudes"
      />

      {!canWrite ? (
        <Surface className="resident-requests__read-only">
          <span>
            <RequestsIcon size={19} />
          </span>
          <div>
            <strong>Consulta de solo lectura</strong>
            <p>
              Puedes revisar el estado y el historial compartido de tus solicitudes. Tu perfil
              residencial actual no permite crear, comentar, adjuntar ni cancelar casos.
            </p>
          </div>
        </Surface>
      ) : null}

      {warning ? (
        <div className="resident-requests__message" data-tone="warning" role="status">
          {warning}
        </div>
      ) : null}
      {canWrite && !activeCategories.length ? (
        <div className="resident-requests__message" data-tone="warning" role="status">
          No hay categorías activas disponibles para crear una solicitud en este momento.
        </div>
      ) : null}

      <Surface className="resident-requests__summary" aria-label="Resumen de solicitudes">
        <div>
          <span>Abiertas</span>
          <strong>{openCount}</strong>
        </div>
        <div data-attention={waitingCount > 0 || undefined}>
          <span>Esperan tu respuesta</span>
          <strong>{waitingCount}</strong>
        </div>
        <div>
          <span>Resueltas</span>
          <strong>{completedCount}</strong>
        </div>
      </Surface>

      <Surface className="resident-requests__workspace">
        <div className="resident-requests__toolbar">
          <label className="resident-requests__search">
            <RequestsIcon size={18} />
            <input
              aria-label="Buscar solicitudes"
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Buscar número, título o ubicación"
              type="search"
              value={filters.query}
            />
          </label>
          <Select
            aria-label="Estado"
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
            value={filters.status}
          >
            <option value="">Todos los estados</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Categoría"
            onChange={(event) =>
              setFilters((current) => ({ ...current, categoryId: event.target.value }))
            }
            value={filters.categoryId}
          >
            <option value="">Todas las categorías</option>
            {data.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        {!filtered.length ? (
          <div className="resident-requests__empty">
            <EmptyState
              actionLabel={canCreate ? 'Nueva solicitud' : undefined}
              description={
                data.requests.length
                  ? 'Ajusta la búsqueda o los filtros para encontrar otra solicitud.'
                  : canWrite
                    ? 'Cuando reportes algo, podrás seguir su progreso desde aquí.'
                    : 'Cuando exista una solicitud visible para tu perfil, aparecerá aquí.'
              }
              icon={<RequestsIcon size={26} />}
              onAction={canCreate ? () => setDrawer('create') : undefined}
              title={data.requests.length ? 'No hay resultados' : 'Aún no hay solicitudes'}
            />
          </div>
        ) : (
          <div className="resident-requests__list">
            {filtered.map((request) => {
              const category = data.categories.find((item) => item.id === request.category_id);
              const unit = data.units.find((item) => item.id === request.unit_id);
              return (
                <button key={request.id} onClick={() => openDetail(request.id)} type="button">
                  <span className="resident-requests__list-icon">
                    <RequestsIcon size={18} />
                  </span>
                  <span className="resident-requests__list-copy">
                    <small>{request.request_number}</small>
                    <strong>{request.title}</strong>
                    <em>
                      {[category?.name, unit ? `Unidad ${unit.code}` : 'Área común']
                        .filter(Boolean)
                        .join(' · ')}
                    </em>
                  </span>
                  <span className="resident-requests__list-state">
                    <Badge tone={statusTone(request.status)}>{statusLabels[request.status]}</Badge>
                    <small>{formatRequestDate(request.updated_at)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Surface>

      {drawer === 'create' && canCreate ? (
        <CreateResidentRequestDrawer
          categories={data.categories}
          condominiumId={condominiumId}
          onClose={() => setDrawer(null)}
          onCreated={(created) => {
            void handleChanged(created);
            setDrawer('detail');
          }}
          session={session}
          units={data.units}
        />
      ) : null}

      {drawer === 'detail' && selected ? (
        <ResidentRequestDetailDrawer
          canWrite={canWrite}
          categories={data.categories}
          condominiumId={condominiumId}
          onChanged={handleChanged}
          onClose={() => setDrawer(null)}
          request={selected}
          session={session}
          units={data.units}
        />
      ) : null}
    </div>
  );
}
