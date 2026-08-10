import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CheckCircleIcon,
  PeopleIcon,
  RequestsIcon,
  SettingsIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { Drawer } from '../components/Drawer';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { canManage, useCondominiumRoles } from '../lib/roles';
import { PrivateDocumentUploader } from '../features/documents/PrivateDocumentUploader';
import { downloadPrivateDocument } from '../features/documents/api';
import {
  eventLabel,
  filterServiceRequests,
  formatRequestDate,
  getEventDetail,
  getRequestStats,
  isOverdueRequest,
  nextRequestStatuses,
  personName,
  priorityLabels,
  statusGroups,
  statusLabels,
} from '../lib/service-requests';
import type {
  ServiceRequestAttachment,
  ServiceRequestCategory,
  ServiceRequestComment,
  ServiceRequestEvent,
  ServiceRequestFilters,
  ServiceRequestPerson,
  ServiceRequestPriority,
  ServiceRequestRecord,
  ServiceRequestStatus,
  ServiceRequestUnit,
  ServiceRequestVisibility,
} from '../lib/service-requests';
import '../requests.css';

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

const initialFilters: ServiceRequestFilters = {
  query: '',
  status: '',
  priority: '',
  categoryId: '',
  unitId: '',
  assignment: '',
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type WorkspaceData = {
  requests: ServiceRequestRecord[];
  categories: ServiceRequestCategory[];
  units: ServiceRequestUnit[];
  people: ServiceRequestPerson[];
};

type DetailData = {
  comments: ServiceRequestComment[];
  events: ServiceRequestEvent[];
  attachments: ServiceRequestAttachment[];
};

type Drawer = 'create' | 'detail' | 'categories' | null;

const statusTone = (status: ServiceRequestStatus) => {
  if (['resolved', 'closed'].includes(status)) return 'success' as const;
  if (['waiting_resident', 'waiting_vendor'].includes(status)) return 'warning' as const;
  if (status === 'cancelled') return 'neutral' as const;
  return 'info' as const;
};

const priorityTone = (priority: ServiceRequestPriority) => {
  if (priority === 'urgent' || priority === 'high') return 'warning' as const;
  if (priority === 'low') return 'neutral' as const;
  return 'info' as const;
};

const initials = (person: ServiceRequestPerson | undefined) => {
  if (!person) return '—';
  return `${person.first_name.charAt(0)}${person.last_name.charAt(0)}`.toLocaleUpperCase('es');
};

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
}) {
  return (
    <Surface className="requests-metric" data-tone={tone}>
      <div className="requests-metric__top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function RequestCard({
  request,
  categories,
  units,
  people,
  onOpen,
}: {
  request: ServiceRequestRecord;
  categories: ServiceRequestCategory[];
  units: ServiceRequestUnit[];
  people: ServiceRequestPerson[];
  onOpen: () => void;
}) {
  const category = categories.find((item) => item.id === request.category_id);
  const unit = units.find((item) => item.id === request.unit_id);
  const requester = people.find((item) => item.id === request.requester_person_id);
  const assignee = people.find((item) => item.auth_user_id === request.assigned_to_user_id);
  const overdue = isOverdueRequest(request);

  return (
    <button className="request-card" onClick={onOpen} type="button">
      <div className="request-card__heading">
        <span className="request-card__number">{request.request_number}</span>
        <Badge tone={priorityTone(request.priority)}>{priorityLabels[request.priority]}</Badge>
      </div>
      <div className="request-card__body">
        <strong>{request.title}</strong>
        <p>{request.description}</p>
      </div>
      <div className="request-card__meta">
        <span>{category?.name ?? 'Sin categoría'}</span>
        <span>{unit ? `Unidad ${unit.code}` : 'Área común'}</span>
      </div>
      <div className="request-card__footer">
        <div className="request-card__person">
          <span>{initials(assignee ?? requester)}</span>
          <div>
            <small>{assignee ? 'Responsable' : 'Solicitante'}</small>
            <strong>{personName(assignee ?? requester)}</strong>
          </div>
        </div>
        <div className="request-card__date" data-overdue={overdue || undefined}>
          <small>{request.due_at ? (overdue ? 'Vencida' : 'Fecha objetivo') : 'Actualizada'}</small>
          <strong>{formatRequestDate(request.due_at ?? request.updated_at)}</strong>
        </div>
      </div>
    </button>
  );
}

function RequestsLoading() {
  return (
    <div aria-label="Cargando solicitudes" className="requests-page">
      <PageHeader eyebrow="Operación y atención" title="Solicitudes" />
      <div className="requests-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="requests-board-skeleton" />
    </div>
  );
}

function DrawerShell({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Drawer eyebrow={eyebrow} onClose={onClose} prefix="requests" title={title} wide={wide}>
      {children}
    </Drawer>
  );
}

function CreateRequestDrawer({
  condominiumId,
  session,
  categories,
  units,
  people,
  onClose,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  categories: ServiceRequestCategory[];
  units: ServiceRequestUnit[];
  people: ServiceRequestPerson[];
  onClose: () => void;
  onCreated: (request: ServiceRequestRecord) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories.find((item) => item.is_active)?.id ?? '');
  const [priority, setPriority] = useState<ServiceRequestPriority>('normal');
  const [unitId, setUnitId] = useState('');
  const [requesterPersonId, setRequesterPersonId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, string> = {
        categoryId,
        title: title.trim(),
        description: description.trim(),
        priority,
      };
      if (unitId) payload.unitId = unitId;
      if (requesterPersonId) payload.requesterPersonId = requesterPersonId;
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
    <DrawerShell eyebrow="Nueva solicitud" onClose={onClose} title="Cuéntanos qué está pasando">
      <form className="requests-form" onSubmit={(event) => void submit(event)}>
        <div className="requests-form__intro">
          <RequestsIcon size={24} />
          <div>
            <strong>Información clara, respuesta más rápida</strong>
            <p>
              Describe el problema con suficiente detalle para que la administración pueda asignarlo
              correctamente.
            </p>
          </div>
        </div>
        <Field label="Título">
          <input
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ej. Filtración en el techo"
            required
            value={title}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Indica dónde ocurre, desde cuándo y cualquier detalle importante."
            required
            rows={6}
            value={description}
          />
        </Field>
        <div className="requests-form__grid">
          <Field label="Categoría">
            <Select
              onChange={(event) => setCategoryId(event.target.value)}
              required
              value={categoryId}
            >
              <option value="">Selecciona una categoría</option>
              {categories
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Prioridad" hint="Urgente solo para riesgos de seguridad o daños activos.">
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
                .filter((item) => item.status === 'active')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    Unidad {item.code}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Solicitante" hint="Déjalo vacío para registrar la solicitud a tu nombre.">
            <Select
              onChange={(event) => setRequesterPersonId(event.target.value)}
              value={requesterPersonId}
            >
              <option value="">Usuario actual</option>
              {people
                .filter((item) => item.status !== 'inactive')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {personName(item)}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        {error ? (
          <div className="requests-inline-message" data-tone="error">
            {error}
          </div>
        ) : null}
        <div className="requests-form__actions">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancelar
          </Button>
          <Button disabled={saving || !categoryId} type="submit">
            {saving ? 'Creando…' : 'Crear solicitud'}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function CategoriesDrawer({
  condominiumId,
  session,
  categories,
  onClose,
  onChanged,
}: {
  condominiumId: string;
  session: Session;
  categories: ServiceRequestCategory[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/request-categories`, session, {
        method: 'POST',
        body: JSON.stringify({
          code: code
            .trim()
            .toLocaleLowerCase('es')
            .replace(/[^a-z0-9_-]+/g, '_'),
          name: name.trim(),
          description: description.trim() || undefined,
          sortOrder: categories.length * 10 + 10,
          isActive: true,
        }),
      });
      setName('');
      setCode('');
      setDescription('');
      await onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la categoría.',
      );
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (category: ServiceRequestCategory) => {
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/request-categories/${category.id}`,
        session,
        { method: 'PATCH', body: JSON.stringify({ isActive: !category.is_active }) },
      );
      await onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar la categoría.',
      );
    }
  };

  return (
    <DrawerShell eyebrow="Organización" onClose={onClose} title="Categorías de solicitudes">
      <div className="request-categories-list">
        {categories.map((category) => (
          <article key={category.id}>
            <div className="request-category-icon">
              <SettingsIcon size={18} />
            </div>
            <div>
              <strong>{category.name}</strong>
              <p>{category.description || 'Sin descripción'}</p>
            </div>
            <button
              data-active={category.is_active || undefined}
              onClick={() => void toggle(category)}
              type="button"
            >
              {category.is_active ? 'Activa' : 'Inactiva'}
            </button>
          </article>
        ))}
      </div>
      <form
        className="requests-form requests-form--category"
        onSubmit={(event) => void create(event)}
      >
        <div className="requests-section-heading">
          <span>Agregar categoría</span>
          <p>Crea una clasificación propia del condominio.</p>
        </div>
        <div className="requests-form__grid">
          <Field label="Nombre">
            <input onChange={(event) => setName(event.target.value)} required value={name} />
          </Field>
          <Field label="Código">
            <input
              onChange={(event) => setCode(event.target.value)}
              placeholder="ej. jardineria"
              required
              value={code}
            />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
        </Field>
        {error ? (
          <div className="requests-inline-message" data-tone="error">
            {error}
          </div>
        ) : null}
        <Button disabled={saving} type="submit">
          {saving ? 'Creando…' : 'Agregar categoría'}
        </Button>
      </form>
    </DrawerShell>
  );
}

function DetailTimeline({ detail }: { detail: DetailData }) {
  const items = [
    ...detail.events.map((event) => ({
      id: `event-${event.id}`,
      kind: 'event' as const,
      date: event.created_at,
      title: eventLabel(event.event_type),
      body: getEventDetail(event),
      internal: event.visibility === 'internal',
    })),
    ...detail.comments.map((comment) => ({
      id: `comment-${comment.id}`,
      kind: 'comment' as const,
      date: comment.created_at,
      title: comment.visibility === 'internal' ? 'Nota interna' : 'Comentario',
      body: comment.body,
      internal: comment.visibility === 'internal',
    })),
  ].sort((left, right) => right.date.localeCompare(left.date));

  if (!items.length)
    return <div className="request-detail-empty">Todavía no hay actividad adicional.</div>;
  return (
    <div className="request-timeline">
      {items.map((item) => (
        <article key={item.id} data-kind={item.kind}>
          <span className="request-timeline__dot" />
          <div className="request-timeline__content">
            <div>
              <strong>{item.title}</strong>
              {item.internal ? <Badge tone="warning">Interno</Badge> : null}
              <time>{formatRequestDate(item.date, { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
            {item.body ? <p>{item.body}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function RequestDetailDrawer({
  request,
  condominiumId,
  session,
  categories,
  units,
  people,
  onClose,
  onChanged,
}: {
  request: ServiceRequestRecord;
  condominiumId: string;
  session: Session;
  categories: ServiceRequestCategory[];
  units: ServiceRequestUnit[];
  people: ServiceRequestPerson[];
  onClose: () => void;
  onChanged: (request?: ServiceRequestRecord) => Promise<void>;
}) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<ServiceRequestStatus>(request.status);
  const [priority, setPriority] = useState<ServiceRequestPriority>(request.priority);
  const [categoryId, setCategoryId] = useState(request.category_id);
  const [assignee, setAssignee] = useState(request.assigned_to_user_id ?? '');
  const [dueAt, setDueAt] = useState(request.due_at ? request.due_at.slice(0, 16) : '');
  const [resolution, setResolution] = useState(request.resolution_summary ?? '');
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState<ServiceRequestVisibility>('public');
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);

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
  useEffect(() => {
    setStatus(request.status);
    setPriority(request.priority);
    setCategoryId(request.category_id);
    setAssignee(request.assigned_to_user_id ?? '');
    setDueAt(request.due_at ? request.due_at.slice(0, 16) : '');
    setResolution(request.resolution_summary ?? '');
  }, [request]);

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    const payload: Record<string, unknown> = { expectedVersion: request.version };
    if (status !== request.status) payload.status = status;
    if (priority !== request.priority) payload.priority = priority;
    if (categoryId !== request.category_id) payload.categoryId = categoryId;
    if (assignee !== (request.assigned_to_user_id ?? '')) {
      if (assignee) payload.assignedToUserId = assignee;
      else payload.clearAssignee = true;
    }
    const currentDue = request.due_at ? request.due_at.slice(0, 16) : '';
    if (dueAt !== currentDue) {
      if (dueAt) payload.dueAt = new Date(dueAt).toISOString();
      else payload.clearDue = true;
    }
    if (resolution.trim() !== (request.resolution_summary ?? ''))
      payload.resolution = resolution.trim();
    if (Object.keys(payload).length === 1) {
      setError('No hay cambios pendientes.');
      setSaving(false);
      return;
    }
    try {
      const updated = await apiRequest<ServiceRequestRecord>(
        `/v1/condominiums/${condominiumId}/requests/${request.id}`,
        session,
        { method: 'PATCH', body: JSON.stringify(payload) },
      );
      setMessage('Solicitud actualizada.');
      await onChanged(updated);
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar la solicitud.',
      );
    } finally {
      setSaving(false);
    }
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/requests/${request.id}/comments`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ body: comment.trim(), visibility }),
        },
      );
      setComment('');
      setMessage(visibility === 'internal' ? 'Nota interna agregada.' : 'Comentario publicado.');
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo agregar el comentario.',
      );
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (cancelReason.trim().length < 3) {
      setError('Indica el motivo de la cancelación.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await apiRequest<ServiceRequestRecord>(
        `/v1/condominiums/${condominiumId}/requests/${request.id}/cancel`,
        session,
        { method: 'POST', body: JSON.stringify({ reason: cancelReason.trim() }) },
      );
      await onChanged(updated);
      setMessage('Solicitud cancelada.');
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
  const requester = people.find((item) => item.id === request.requester_person_id);
  const assigneePeople = people.filter((item) => item.auth_user_id && item.status !== 'inactive');
  const allowedStatuses = nextRequestStatuses(request.status);
  const terminal = ['closed', 'cancelled'].includes(request.status);

  return (
    <DrawerShell eyebrow={request.request_number} onClose={onClose} title={request.title} wide>
      <div className="request-detail-summary">
        <div className="request-detail-summary__badges">
          <Badge tone={statusTone(request.status)}>{statusLabels[request.status]}</Badge>
          <Badge tone={priorityTone(request.priority)}>{priorityLabels[request.priority]}</Badge>
          {isOverdueRequest(request) ? <Badge tone="warning">Vencida</Badge> : null}
        </div>
        <p>{request.description}</p>
        <div className="request-detail-summary__meta">
          <span>
            <SettingsIcon size={16} />
            {category?.name ?? 'Sin categoría'}
          </span>
          <span>
            <UnitsIcon size={16} />
            {unit ? `Unidad ${unit.code}` : 'Área común'}
          </span>
          <span>
            <PeopleIcon size={16} />
            {personName(requester)}
          </span>
          <span>
            <CheckCircleIcon size={16} />
            Actualizada {formatRequestDate(request.updated_at)}
          </span>
        </div>
      </div>

      {!terminal ? (
        <Surface className="request-management-panel">
          <div className="requests-section-heading">
            <span>Gestión operativa</span>
            <p>Actualiza el flujo, responsable y fecha objetivo.</p>
          </div>
          <div className="requests-form__grid">
            <Field label="Estado">
              <Select
                onChange={(event) => setStatus(event.target.value as ServiceRequestStatus)}
                value={status}
              >
                <option value={request.status}>{statusLabels[request.status]}</option>
                {allowedStatuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabels[item]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prioridad">
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
            <Field label="Categoría">
              <Select onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
                {categories
                  .filter((item) => item.is_active || item.id === request.category_id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              label="Responsable"
              hint="Solo aparecen personas vinculadas a una cuenta de Habitta."
            >
              <Select onChange={(event) => setAssignee(event.target.value)} value={assignee}>
                <option value="">Sin responsable</option>
                {assigneePeople.map((item) => (
                  <option key={item.id} value={item.auth_user_id ?? ''}>
                    {personName(item)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha objetivo">
              <input
                onChange={(event) => setDueAt(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </Field>
            <Field label="Resolución" hint="Obligatoria al marcar como resuelta.">
              <input
                onChange={(event) => setResolution(event.target.value)}
                placeholder="Trabajo realizado"
                value={resolution}
              />
            </Field>
          </div>
          <div className="request-management-panel__actions">
            <Button disabled={saving} onClick={() => void save()} size="sm">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </Surface>
      ) : null}

      {message ? (
        <div className="requests-inline-message" data-tone="success">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="requests-inline-message" data-tone="error">
          {error}
        </div>
      ) : null}

      <div className="request-detail-grid">
        <section>
          <div className="requests-section-heading">
            <span>Actividad</span>
            <p>Historial inmutable de cambios y conversaciones.</p>
          </div>
          {loading || !detail ? (
            <Skeleton className="requests-detail-skeleton" />
          ) : (
            <DetailTimeline detail={detail} />
          )}
        </section>
        <aside>
          <form className="request-comment-form" onSubmit={(event) => void addComment(event)}>
            <div className="requests-section-heading">
              <span>Agregar comentario</span>
              <p>Comparte una actualización con el residente o el equipo.</p>
            </div>
            <textarea
              onChange={(event) => setComment(event.target.value)}
              placeholder="Escribe una actualización…"
              required
              rows={4}
              value={comment}
            />
            <div>
              <Select
                onChange={(event) => setVisibility(event.target.value as ServiceRequestVisibility)}
                value={visibility}
              >
                <option value="public">Visible para el residente</option>
                <option value="internal">Nota interna</option>
              </Select>
              <Button disabled={saving || !comment.trim()} size="sm" type="submit">
                Publicar
              </Button>
            </div>
          </form>
          <Surface className="request-attachments-panel">
            <div className="requests-section-heading">
              <span>Archivos</span>
              <p>Documentos y fotografías vinculados.</p>
            </div>
            {detail?.attachments.length ? (
              detail.attachments.map((attachment) => (
                <div className="request-attachment private-document-row" key={attachment.id}>
                  <div>
                    <RequestsIcon size={17} />
                    <span>
                      <strong>{attachment.original_filename}</strong>
                      <small>
                        {Math.max(1, Math.ceil(attachment.size_bytes / 1024))} KB ·{' '}
                        {attachment.visibility === 'internal' ? 'Interno' : 'Público'}
                      </small>
                    </span>
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
              ))
            ) : (
              <div className="request-detail-empty">No hay archivos adjuntos.</div>
            )}
            <PrivateDocumentUploader
              description="La visibilidad seguirá la selección usada para comentarios y notas."
              onUploaded={loadDetail}
              path={`/v1/condominiums/${condominiumId}/requests/${request.id}/attachments`}
              session={session}
              title="Adjuntar documento o fotografía"
              visibility={visibility}
            />
          </Surface>
          {!terminal ? (
            <Surface className="request-cancel-panel">
              <div className="requests-section-heading">
                <span>Cancelar solicitud</span>
                <p>Conserva todo el historial y registra el motivo.</p>
              </div>
              <textarea
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Motivo de cancelación"
                rows={3}
                value={cancelReason}
              />
              <Button disabled={saving} onClick={() => void cancel()} size="sm" variant="danger">
                Cancelar solicitud
              </Button>
            </Surface>
          ) : null}
        </aside>
      </div>
    </DrawerShell>
  );
}

export function RequestsPage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [filters, setFilters] = useState<ServiceRequestFilters>(initialFilters);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarning('');
    const base = `/v1/condominiums/${condominiumId}`;
    const [requests, categories, units, people] = await Promise.allSettled([
      apiRequest<ServiceRequestRecord[]>(`${base}/requests`, session),
      apiRequest<ServiceRequestCategory[]>(`${base}/request-categories`, session),
      apiRequest<ServiceRequestUnit[]>(`${base}/units`, session),
      apiRequest<ServiceRequestPerson[]>(`${base}/people`, session),
    ]);
    if (requests.status === 'rejected' || categories.status === 'rejected') {
      const reason = requests.status === 'rejected' ? requests.reason : categories.reason;
      setError(
        reason instanceof Error ? reason.message : 'No se pudo cargar el espacio de solicitudes.',
      );
      setLoading(false);
      return;
    }
    const degraded = [
      units.status === 'rejected' ? 'unidades' : '',
      people.status === 'rejected' ? 'personas' : '',
    ].filter(Boolean);
    setData({
      requests: requests.value,
      categories: categories.value,
      units: units.status === 'fulfilled' ? units.value : [],
      people: people.status === 'fulfilled' ? people.value : [],
    });
    if (degraded.length) setWarning(`No se pudieron actualizar: ${degraded.join(' y ')}.`);
    setLoading(false);
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setFilters(initialFilters);
    setSelectedId('');
    setDrawer(null);
  }, [condominiumId]);

  const filtered = useMemo(
    () =>
      data
        ? filterServiceRequests(data.requests, data.categories, data.units, data.people, filters)
        : [],
    [data, filters],
  );
  const stats = useMemo(() => getRequestStats(data?.requests ?? []), [data?.requests]);
  const selected = data?.requests.find((request) => request.id === selectedId);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDrawer('detail');
  };

  const handleChanged = async (updated?: ServiceRequestRecord) => {
    if (updated) {
      setData((current) =>
        current
          ? {
              ...current,
              requests: current.requests.some((item) => item.id === updated.id)
                ? current.requests.map((item) => (item.id === updated.id ? updated : item))
                : [updated, ...current.requests],
            }
          : current,
      );
      setSelectedId(updated.id);
    } else {
      await load();
    }
  };

  if (loading && !data) return <RequestsLoading />;
  if (!data) {
    return (
      <Surface className="requests-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir este módulo.'}
          icon={<RequestsIcon size={28} />}
          onAction={() => void load()}
          title="Solicitudes no disponibles"
        />
      </Surface>
    );
  }

  return (
    <div className="requests-page">
      <PageHeader
        actions={
          <>
            {manage ? (
              <Button onClick={() => setDrawer('categories')} size="sm" variant="secondary">
                <SettingsIcon size={17} />
                Categorías
              </Button>
            ) : null}
            <Button onClick={() => setDrawer('create')} size="sm">
              <RequestsIcon size={17} />
              Nueva solicitud
            </Button>
          </>
        }
        description={`${condominiumName} · seguimiento claro desde el reporte hasta la resolución.`}
        eyebrow="Operación y atención"
        title="Solicitudes"
      />

      {warning ? (
        <div className="requests-inline-message" data-tone="warning">
          {warning}
        </div>
      ) : null}
      <div className="requests-metrics-grid">
        <MetricCard
          detail="Requieren seguimiento"
          icon={<RequestsIcon size={20} />}
          label="Abiertas"
          tone="blue"
          value={stats.open}
        />
        <MetricCard
          detail="Atención prioritaria"
          icon={<RequestsIcon size={20} />}
          label="Urgentes"
          tone="red"
          value={stats.urgent}
        />
        <MetricCard
          detail="Superaron la fecha objetivo"
          icon={<CheckCircleIcon size={20} />}
          label="Vencidas"
          tone="navy"
          value={stats.overdue}
        />
        <MetricCard
          detail="Disponibles para asignar"
          icon={<PeopleIcon size={20} />}
          label="Sin responsable"
          tone="green"
          value={stats.unassigned}
        />
      </div>

      <Surface className="requests-workspace">
        <div className="requests-toolbar">
          <label className="requests-search">
            <RequestsIcon size={18} />
            <input
              aria-label="Buscar solicitudes"
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Buscar número, título, unidad o persona"
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
            aria-label="Prioridad"
            onChange={(event) =>
              setFilters((current) => ({ ...current, priority: event.target.value }))
            }
            value={filters.priority}
          >
            <option value="">Todas las prioridades</option>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
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
          <Select
            aria-label="Asignación"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                assignment: event.target.value as ServiceRequestFilters['assignment'],
              }))
            }
            value={filters.assignment}
          >
            <option value="">Cualquier asignación</option>
            <option value="assigned">Con responsable</option>
            <option value="unassigned">Sin responsable</option>
          </Select>
          <div className="requests-view-toggle">
            <button
              data-active={view === 'board' || undefined}
              onClick={() => setView('board')}
              type="button"
            >
              Flujo
            </button>
            <button
              data-active={view === 'list' || undefined}
              onClick={() => setView('list')}
              type="button"
            >
              Lista
            </button>
          </div>
        </div>

        {!filtered.length ? (
          <EmptyState
            actionLabel="Nueva solicitud"
            description="Ajusta los filtros o registra una nueva solicitud."
            icon={<RequestsIcon size={26} />}
            onAction={() => setDrawer('create')}
            title="No encontramos solicitudes"
          />
        ) : view === 'board' ? (
          <div className="requests-board">
            {statusGroups.map((group) => {
              const rows = filtered.filter((request) => group.statuses.includes(request.status));
              return (
                <section className="requests-board-column" key={group.key}>
                  <header>
                    <span>{group.label}</span>
                    <strong>{rows.length}</strong>
                  </header>
                  <div>
                    {rows.length ? (
                      rows.map((request) => (
                        <RequestCard
                          categories={data.categories}
                          key={request.id}
                          onOpen={() => openDetail(request.id)}
                          people={data.people}
                          request={request}
                          units={data.units}
                        />
                      ))
                    ) : (
                      <div className="requests-column-empty">Sin solicitudes</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="requests-list">
            <div className="requests-list__head">
              <span>Solicitud</span>
              <span>Estado</span>
              <span>Ubicación</span>
              <span>Actualización</span>
            </div>
            {filtered.map((request) => {
              const unit = data.units.find((item) => item.id === request.unit_id);
              return (
                <button key={request.id} onClick={() => openDetail(request.id)} type="button">
                  <span>
                    <small>{request.request_number}</small>
                    <strong>{request.title}</strong>
                    <em>{priorityLabels[request.priority]}</em>
                  </span>
                  <span>
                    <Badge tone={statusTone(request.status)}>{statusLabels[request.status]}</Badge>
                  </span>
                  <span>{unit ? `Unidad ${unit.code}` : 'Área común'}</span>
                  <span>{formatRequestDate(request.updated_at)}</span>
                </button>
              );
            })}
          </div>
        )}
      </Surface>

      {drawer === 'create' ? (
        <CreateRequestDrawer
          categories={data.categories}
          condominiumId={condominiumId}
          onClose={() => setDrawer(null)}
          onCreated={(created) => {
            void handleChanged(created);
            setDrawer('detail');
          }}
          people={data.people}
          session={session}
          units={data.units}
        />
      ) : null}
      {drawer === 'categories' ? (
        <CategoriesDrawer
          categories={data.categories}
          condominiumId={condominiumId}
          onChanged={load}
          onClose={() => setDrawer(null)}
          session={session}
        />
      ) : null}
      {drawer === 'detail' && selected ? (
        <RequestDetailDrawer
          categories={data.categories}
          condominiumId={condominiumId}
          onChanged={handleChanged}
          onClose={() => setDrawer(null)}
          people={data.people}
          request={selected}
          session={session}
          units={data.units}
        />
      ) : null}
    </div>
  );
}
