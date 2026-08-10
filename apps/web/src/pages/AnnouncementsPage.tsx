import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AnnouncementsIcon,
  BellIcon,
  CheckCircleIcon,
  PeopleIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { PrivateDocumentUploader } from '../features/documents/PrivateDocumentUploader';
import { downloadPrivateDocument } from '../features/documents/api';
import {
  audienceLabels,
  eventLabels,
  filterAnnouncements,
  formatAnnouncementDate,
  getAnnouncementStats,
  getAudienceDetail,
  getRecipientStats,
  priorityLabels,
  statusLabels,
} from '../lib/announcements';
import type {
  AnnouncementAttachment,
  AnnouncementAudience,
  AnnouncementBuilding,
  AnnouncementEvent,
  AnnouncementFilters,
  AnnouncementPriority,
  AnnouncementRecipient,
  AnnouncementRecord,
  AnnouncementStatus,
  AnnouncementUnit,
} from '../lib/announcements';

const priorities: AnnouncementPriority[] = ['normal', 'important', 'urgent'];
const audiences: AnnouncementAudience[] = [
  'everyone',
  'owners',
  'tenants',
  'board',
  'building',
  'unit',
];
const statuses: AnnouncementStatus[] = ['draft', 'scheduled', 'published', 'archived'];
const initialFilters: AnnouncementFilters = { query: '', status: '', priority: '', audience: '' };

type Props = { condominiumId: string; condominiumName: string; session: Session };
type WorkspaceData = {
  announcements: AnnouncementRecord[];
  buildings: AnnouncementBuilding[];
  units: AnnouncementUnit[];
};
type DetailData = {
  recipients: AnnouncementRecipient[];
  events: AnnouncementEvent[];
  attachments: AnnouncementAttachment[];
};
type Drawer = 'create' | 'detail' | null;

const statusTone = (status: AnnouncementStatus) => {
  if (status === 'published') return 'success' as const;
  if (status === 'scheduled') return 'info' as const;
  if (status === 'archived') return 'neutral' as const;
  return 'warning' as const;
};

const priorityTone = (priority: AnnouncementPriority) => {
  if (priority === 'urgent') return 'warning' as const;
  if (priority === 'important') return 'info' as const;
  return 'neutral' as const;
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
  tone: 'blue' | 'green' | 'navy' | 'amber';
}) {
  return (
    <Surface className="announcements-metric" data-tone={tone}>
      <div className="announcements-metric__top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
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
    <div className="announcements-drawer-layer" role="presentation">
      <button
        aria-label="Cerrar panel"
        className="announcements-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside aria-label={title} className="announcements-drawer" data-wide={wide || undefined}>
        <header className="announcements-drawer__header">
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <Button aria-label="Cerrar" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </header>
        <div className="announcements-drawer__body">{children}</div>
      </aside>
    </div>
  );
}

function AnnouncementCard({
  announcement,
  buildings,
  units,
  onOpen,
}: {
  announcement: AnnouncementRecord;
  buildings: AnnouncementBuilding[];
  units: AnnouncementUnit[];
  onOpen: () => void;
}) {
  const target = getAudienceDetail(announcement, buildings, units);
  const primaryDate =
    announcement.status === 'scheduled'
      ? announcement.publish_at
      : (announcement.published_at ?? announcement.updated_at);
  return (
    <button className="announcement-card" onClick={onOpen} type="button">
      <div className="announcement-card__accent" data-priority={announcement.priority} />
      <div className="announcement-card__heading">
        <div>
          <Badge tone={statusTone(announcement.status)}>{statusLabels[announcement.status]}</Badge>
          <Badge tone={priorityTone(announcement.priority)}>
            {priorityLabels[announcement.priority]}
          </Badge>
        </div>
        {announcement.requires_acknowledgement ? (
          <span className="announcement-card__ack">
            <CheckCircleIcon size={14} /> Confirmación
          </span>
        ) : null}
      </div>
      <div className="announcement-card__body">
        <strong>{announcement.title}</strong>
        <p>{announcement.summary}</p>
      </div>
      <div className="announcement-card__audience">
        {announcement.audience === 'unit' ? <UnitsIcon size={15} /> : <PeopleIcon size={15} />}
        <span>{target}</span>
      </div>
      <footer>
        <small>{announcement.status === 'scheduled' ? 'Publicación' : 'Última actividad'}</small>
        <strong>
          {formatAnnouncementDate(primaryDate, { hour: '2-digit', minute: '2-digit' })}
        </strong>
      </footer>
    </button>
  );
}

function AnnouncementsLoading() {
  return (
    <div aria-label="Cargando anuncios" className="announcements-page">
      <PageHeader eyebrow="Comunicación comunitaria" title="Anuncios" />
      <div className="announcements-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="announcements-workspace-skeleton" />
    </div>
  );
}

function AudienceFields({
  audience,
  setAudience,
  buildingId,
  setBuildingId,
  unitId,
  setUnitId,
  buildings,
  units,
}: {
  audience: AnnouncementAudience;
  setAudience: (value: AnnouncementAudience) => void;
  buildingId: string;
  setBuildingId: (value: string) => void;
  unitId: string;
  setUnitId: (value: string) => void;
  buildings: AnnouncementBuilding[];
  units: AnnouncementUnit[];
}) {
  return (
    <>
      <Field label="Audiencia">
        <Select
          onChange={(event) => {
            const next = event.target.value as AnnouncementAudience;
            setAudience(next);
            if (next !== 'building') setBuildingId('');
            if (next !== 'unit') setUnitId('');
          }}
          value={audience}
        >
          {audiences.map((item) => (
            <option key={item} value={item}>
              {audienceLabels[item]}
            </option>
          ))}
        </Select>
      </Field>
      {audience === 'building' ? (
        <Field label="Edificio o torre">
          <Select
            onChange={(event) => setBuildingId(event.target.value)}
            required
            value={buildingId}
          >
            <option value="">Selecciona un edificio</option>
            {buildings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {audience === 'unit' ? (
        <Field label="Unidad">
          <Select onChange={(event) => setUnitId(event.target.value)} required value={unitId}>
            <option value="">Selecciona una unidad</option>
            {units
              .filter((item) => item.status === 'active')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  Unidad {item.code}
                </option>
              ))}
          </Select>
        </Field>
      ) : null}
    </>
  );
}

function CreateAnnouncementDrawer({
  condominiumId,
  session,
  buildings,
  units,
  onClose,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  buildings: AnnouncementBuilding[];
  units: AnnouncementUnit[];
  onClose: () => void;
  onCreated: (announcement: AnnouncementRecord) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [audience, setAudience] = useState<AnnouncementAudience>('everyone');
  const [buildingId, setBuildingId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        summary: summary.trim(),
        body: body.trim(),
        priority,
        audience,
        requiresAcknowledgement,
      };
      if (audience === 'building') payload.buildingId = buildingId;
      if (audience === 'unit') payload.unitId = unitId;
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
      const created = await apiRequest<AnnouncementRecord>(
        `/v1/condominiums/${condominiumId}/announcements`,
        session,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      onCreated(created);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear el anuncio.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell eyebrow="Nuevo comunicado" onClose={onClose} title="Crear anuncio">
      <form className="announcements-form" onSubmit={(event) => void submit(event)}>
        <div className="announcements-form__intro">
          <AnnouncementsIcon size={25} />
          <div>
            <strong>Comunicación clara y con trazabilidad</strong>
            <p>Prepara el mensaje, define la audiencia y publícalo ahora o prográmalo después.</p>
          </div>
        </div>
        <Field label="Título">
          <input
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ej. Mantenimiento de ascensores"
            required
            value={title}
          />
        </Field>
        <Field label="Resumen" hint="Se mostrará en las tarjetas y notificaciones.">
          <textarea
            maxLength={280}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Explica lo esencial en una o dos líneas."
            required
            rows={3}
            value={summary}
          />
        </Field>
        <Field label="Contenido">
          <textarea
            maxLength={12000}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Incluye fechas, horarios, instrucciones y contactos relevantes."
            required
            rows={8}
            value={body}
          />
        </Field>
        <div className="announcements-form__grid">
          <Field label="Prioridad">
            <Select
              onChange={(event) => setPriority(event.target.value as AnnouncementPriority)}
              value={priority}
            >
              {priorities.map((item) => (
                <option key={item} value={item}>
                  {priorityLabels[item]}
                </option>
              ))}
            </Select>
          </Field>
          <AudienceFields
            audience={audience}
            buildingId={buildingId}
            buildings={buildings}
            setAudience={setAudience}
            setBuildingId={setBuildingId}
            setUnitId={setUnitId}
            unitId={unitId}
            units={units}
          />
          <Field label="Vence el" hint="Opcional. Debe ser posterior a la publicación.">
            <input
              onChange={(event) => setExpiresAt(event.target.value)}
              type="datetime-local"
              value={expiresAt}
            />
          </Field>
        </div>
        <label className="announcements-check">
          <input
            checked={requiresAcknowledgement}
            onChange={(event) => setRequiresAcknowledgement(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Solicitar confirmación de lectura</strong>
            <small>Habitta registrará quién confirmó el comunicado.</small>
          </span>
        </label>
        {error ? (
          <div className="announcements-inline-message" data-tone="error">
            {error}
          </div>
        ) : null}
        <div className="announcements-form__actions">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Creando…' : 'Guardar borrador'}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function EventTimeline({ events }: { events: AnnouncementEvent[] }) {
  if (!events.length)
    return <div className="announcement-detail-empty">Todavía no hay actividad adicional.</div>;
  return (
    <div className="announcement-timeline">
      {[...events]
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .map((event) => (
          <article key={event.id}>
            <span className="announcement-timeline__dot" />
            <div>
              <strong>{eventLabels[event.event_type]}</strong>
              <time>
                {formatAnnouncementDate(event.created_at, { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
          </article>
        ))}
    </div>
  );
}

function AnnouncementDetailDrawer({
  announcement,
  condominiumId,
  session,
  buildings,
  units,
  onClose,
  onChanged,
}: {
  announcement: AnnouncementRecord;
  condominiumId: string;
  session: Session;
  buildings: AnnouncementBuilding[];
  units: AnnouncementUnit[];
  onClose: () => void;
  onChanged: (announcement?: AnnouncementRecord) => Promise<void>;
}) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [title, setTitle] = useState(announcement.title);
  const [summary, setSummary] = useState(announcement.summary);
  const [body, setBody] = useState(announcement.body);
  const [priority, setPriority] = useState<AnnouncementPriority>(announcement.priority);
  const [audience, setAudience] = useState<AnnouncementAudience>(announcement.audience);
  const [buildingId, setBuildingId] = useState(announcement.building_id ?? '');
  const [unitId, setUnitId] = useState(announcement.unit_id ?? '');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(
    announcement.requires_acknowledgement,
  );
  const [expiresAt, setExpiresAt] = useState(
    announcement.expires_at ? announcement.expires_at.slice(0, 16) : '',
  );
  const [publishAt, setPublishAt] = useState(
    announcement.publish_at ? announcement.publish_at.slice(0, 16) : '',
  );

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const base = `/v1/condominiums/${condominiumId}/announcements/${announcement.id}`;
    const [recipients, events, attachments] = await Promise.allSettled([
      apiRequest<AnnouncementRecipient[]>(`${base}/recipients`, session),
      apiRequest<AnnouncementEvent[]>(`${base}/events`, session),
      apiRequest<AnnouncementAttachment[]>(`${base}/attachments`, session),
    ]);
    setDetail({
      recipients: recipients.status === 'fulfilled' ? recipients.value : [],
      events: events.status === 'fulfilled' ? events.value : [],
      attachments: attachments.status === 'fulfilled' ? attachments.value : [],
    });
    setLoading(false);
  }, [announcement.id, condominiumId, session]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);
  useEffect(() => {
    setTitle(announcement.title);
    setSummary(announcement.summary);
    setBody(announcement.body);
    setPriority(announcement.priority);
    setAudience(announcement.audience);
    setBuildingId(announcement.building_id ?? '');
    setUnitId(announcement.unit_id ?? '');
    setRequiresAcknowledgement(announcement.requires_acknowledgement);
    setExpiresAt(announcement.expires_at ? announcement.expires_at.slice(0, 16) : '');
    setPublishAt(announcement.publish_at ? announcement.publish_at.slice(0, 16) : '');
  }, [announcement]);

  const requestAction = async (
    action: 'publish' | 'archive' | 'unschedule' | 'read' | 'acknowledge',
  ) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const bodyValue = ['read', 'acknowledge'].includes(action)
        ? undefined
        : JSON.stringify({ expectedVersion: announcement.version });
      const updated = await apiRequest<AnnouncementRecord | AnnouncementRecipient>(
        `/v1/condominiums/${condominiumId}/announcements/${announcement.id}/${action}`,
        session,
        { method: 'POST', ...(bodyValue ? { body: bodyValue } : {}) },
      );
      if ('title' in updated) await onChanged(updated);
      else await loadDetail();
      setMessage(
        action === 'publish'
          ? 'Anuncio publicado.'
          : action === 'archive'
            ? 'Anuncio archivado.'
            : action === 'unschedule'
              ? 'Programación retirada.'
              : action === 'acknowledge'
                ? 'Lectura confirmada.'
                : 'Marcado como leído.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo completar la acción.',
      );
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    const payload: Record<string, unknown> = { expectedVersion: announcement.version };
    if (title.trim() !== announcement.title) payload.title = title.trim();
    if (summary.trim() !== announcement.summary) payload.summary = summary.trim();
    if (body.trim() !== announcement.body) payload.body = body.trim();
    if (priority !== announcement.priority) payload.priority = priority;
    if (audience !== announcement.audience) payload.audience = audience;
    if (audience === 'building' && buildingId !== (announcement.building_id ?? ''))
      payload.buildingId = buildingId;
    if (audience === 'unit' && unitId !== (announcement.unit_id ?? '')) payload.unitId = unitId;
    if (requiresAcknowledgement !== announcement.requires_acknowledgement)
      payload.requiresAcknowledgement = requiresAcknowledgement;
    const currentExpires = announcement.expires_at ? announcement.expires_at.slice(0, 16) : '';
    if (expiresAt !== currentExpires) {
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
      else payload.clearExpires = true;
    }
    if (Object.keys(payload).length === 1) {
      setError('No hay cambios pendientes.');
      setSaving(false);
      return;
    }
    try {
      const updated = await apiRequest<AnnouncementRecord>(
        `/v1/condominiums/${condominiumId}/announcements/${announcement.id}`,
        session,
        { method: 'PATCH', body: JSON.stringify(payload) },
      );
      await onChanged(updated);
      setMessage('Borrador actualizado.');
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo actualizar el anuncio.',
      );
    } finally {
      setSaving(false);
    }
  };

  const schedule = async () => {
    if (!publishAt) {
      setError('Selecciona la fecha y hora de publicación.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await apiRequest<AnnouncementRecord>(
        `/v1/condominiums/${condominiumId}/announcements/${announcement.id}/schedule`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            publishAt: new Date(publishAt).toISOString(),
            expectedVersion: announcement.version,
          }),
        },
      );
      await onChanged(updated);
      setMessage('Publicación programada.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo programar el anuncio.',
      );
    } finally {
      setSaving(false);
    }
  };

  const editable = announcement.status === 'draft' || announcement.status === 'scheduled';
  const published = announcement.status === 'published';
  const recipientStats = getRecipientStats(detail?.recipients ?? []);

  return (
    <DrawerShell
      eyebrow={statusLabels[announcement.status]}
      onClose={onClose}
      title={announcement.title}
      wide
    >
      <div className="announcement-detail-summary">
        <div className="announcement-detail-summary__badges">
          <Badge tone={statusTone(announcement.status)}>{statusLabels[announcement.status]}</Badge>
          <Badge tone={priorityTone(announcement.priority)}>
            {priorityLabels[announcement.priority]}
          </Badge>
          {announcement.requires_acknowledgement ? (
            <Badge tone="info">Requiere confirmación</Badge>
          ) : null}
        </div>
        <p>{announcement.summary}</p>
        <div className="announcement-detail-summary__meta">
          <span>
            <PeopleIcon size={16} /> {getAudienceDetail(announcement, buildings, units)}
          </span>
          <span>
            <BellIcon size={16} /> Actualizado {formatAnnouncementDate(announcement.updated_at)}
          </span>
        </div>
      </div>

      {editable ? (
        <Surface className="announcement-editor">
          <div className="announcements-section-heading">
            <span>Contenido y audiencia</span>
            <p>Los anuncios publicados quedan inmutables para conservar la trazabilidad.</p>
          </div>
          <div className="announcements-form">
            <Field label="Título">
              <input onChange={(event) => setTitle(event.target.value)} value={title} />
            </Field>
            <Field label="Resumen">
              <textarea
                onChange={(event) => setSummary(event.target.value)}
                rows={3}
                value={summary}
              />
            </Field>
            <Field label="Contenido">
              <textarea onChange={(event) => setBody(event.target.value)} rows={7} value={body} />
            </Field>
            <div className="announcements-form__grid">
              <Field label="Prioridad">
                <Select
                  onChange={(event) => setPriority(event.target.value as AnnouncementPriority)}
                  value={priority}
                >
                  {priorities.map((item) => (
                    <option key={item} value={item}>
                      {priorityLabels[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <AudienceFields
                audience={audience}
                buildingId={buildingId}
                buildings={buildings}
                setAudience={setAudience}
                setBuildingId={setBuildingId}
                setUnitId={setUnitId}
                unitId={unitId}
                units={units}
              />
              <Field label="Vence el">
                <input
                  onChange={(event) => setExpiresAt(event.target.value)}
                  type="datetime-local"
                  value={expiresAt}
                />
              </Field>
            </div>
            <label className="announcements-check">
              <input
                checked={requiresAcknowledgement}
                onChange={(event) => setRequiresAcknowledgement(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>Solicitar confirmación de lectura</strong>
                <small>Registra quién confirmó el mensaje.</small>
              </span>
            </label>
            <div className="announcement-editor__actions">
              <Button disabled={saving} onClick={() => void save()} size="sm" variant="secondary">
                Guardar cambios
              </Button>
              <Button disabled={saving} onClick={() => void requestAction('publish')} size="sm">
                Publicar ahora
              </Button>
            </div>
          </div>
        </Surface>
      ) : (
        <Surface className="announcement-published-body">
          <div className="announcements-section-heading">
            <span>Comunicado</span>
            <p>Versión publicada y preservada en el historial.</p>
          </div>
          <div className="announcement-rich-copy">{announcement.body}</div>
        </Surface>
      )}

      {editable ? (
        <Surface className="announcement-scheduler">
          <div className="announcements-section-heading">
            <span>Programación</span>
            <p>Define cuándo debe salir el comunicado.</p>
          </div>
          <div>
            <input
              onChange={(event) => setPublishAt(event.target.value)}
              type="datetime-local"
              value={publishAt}
            />
            <Button disabled={saving} onClick={() => void schedule()} size="sm">
              Programar
            </Button>
            {announcement.status === 'scheduled' ? (
              <Button
                disabled={saving}
                onClick={() => void requestAction('unschedule')}
                size="sm"
                variant="ghost"
              >
                Retirar programación
              </Button>
            ) : null}
          </div>
        </Surface>
      ) : null}

      {message ? (
        <div className="announcements-inline-message" data-tone="success">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="announcements-inline-message" data-tone="error">
          {error}
        </div>
      ) : null}

      <div className="announcement-detail-grid">
        <section>
          <div className="announcements-section-heading">
            <span>Actividad</span>
            <p>Historial inmutable del comunicado.</p>
          </div>
          {loading || !detail ? (
            <Skeleton className="announcements-detail-skeleton" />
          ) : (
            <EventTimeline events={detail.events} />
          )}
        </section>
        <aside>
          <Surface className="announcement-reach-panel">
            <div className="announcements-section-heading">
              <span>Alcance</span>
              <p>Lectura y confirmación de destinatarios.</p>
            </div>
            <div className="announcement-reach-grid">
              <div>
                <strong>{recipientStats.total}</strong>
                <small>Destinatarios</small>
              </div>
              <div>
                <strong>{recipientStats.read}</strong>
                <small>Leídos</small>
              </div>
              <div>
                <strong>{recipientStats.acknowledged}</strong>
                <small>Confirmados</small>
              </div>
            </div>
            {published || announcement.status === 'archived' ? (
              <div className="announcement-reach-panel__actions">
                <Button
                  disabled={saving}
                  onClick={() => void requestAction('read')}
                  size="sm"
                  variant="ghost"
                >
                  Marcar leído
                </Button>
                {announcement.requires_acknowledgement ? (
                  <Button
                    disabled={saving}
                    onClick={() => void requestAction('acknowledge')}
                    size="sm"
                  >
                    Confirmar lectura
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Surface>
          <Surface className="announcement-attachments-panel">
            <div className="announcements-section-heading">
              <span>Archivos</span>
              <p>Documentos vinculados al comunicado.</p>
            </div>
            {detail?.attachments.length ? (
              detail.attachments.map((attachment) => (
                <div className="announcement-attachment private-document-row" key={attachment.id}>
                  <div>
                    <AnnouncementsIcon size={17} />
                    <span>
                      <strong>{attachment.original_filename}</strong>
                      <small>{Math.max(1, Math.ceil(attachment.size_bytes / 1024))} KB</small>
                    </span>
                  </div>
                  <Button
                    onClick={() =>
                      void downloadPrivateDocument(
                        `/v1/condominiums/${condominiumId}/announcements/${announcement.id}/attachments/${attachment.id}/file`,
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
              <div className="announcement-detail-empty">No hay archivos adjuntos.</div>
            )}
            <PrivateDocumentUploader
              disabled={announcement.status === 'published' || announcement.status === 'archived'}
              onUploaded={loadDetail}
              path={`/v1/condominiums/${condominiumId}/announcements/${announcement.id}/attachments`}
              session={session}
              title="Adjuntar documento privado"
            />
          </Surface>
          {published ? (
            <Surface className="announcement-archive-panel">
              <div className="announcements-section-heading">
                <span>Finalizar vigencia</span>
                <p>Archiva el comunicado sin eliminar su historial.</p>
              </div>
              <Button
                disabled={saving}
                onClick={() => void requestAction('archive')}
                size="sm"
                variant="danger"
              >
                Archivar anuncio
              </Button>
            </Surface>
          ) : null}
        </aside>
      </div>
    </DrawerShell>
  );
}

export function AnnouncementsPage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [filters, setFilters] = useState<AnnouncementFilters>(initialFilters);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarning('');
    const base = `/v1/condominiums/${condominiumId}`;
    const [announcements, buildings, units] = await Promise.allSettled([
      apiRequest<AnnouncementRecord[]>(`${base}/announcements`, session),
      apiRequest<AnnouncementBuilding[]>(`${base}/buildings`, session),
      apiRequest<AnnouncementUnit[]>(`${base}/units`, session),
    ]);
    if (announcements.status === 'rejected') {
      setError(
        announcements.reason instanceof Error
          ? announcements.reason.message
          : 'No se pudo cargar el espacio de anuncios.',
      );
      setLoading(false);
      return;
    }
    const degraded = [
      buildings.status === 'rejected' ? 'edificios' : '',
      units.status === 'rejected' ? 'unidades' : '',
    ].filter(Boolean);
    setData({
      announcements: announcements.value,
      buildings: buildings.status === 'fulfilled' ? buildings.value : [],
      units: units.status === 'fulfilled' ? units.value : [],
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
      data ? filterAnnouncements(data.announcements, data.buildings, data.units, filters) : [],
    [data, filters],
  );
  const stats = useMemo(() => getAnnouncementStats(data?.announcements ?? []), [data]);
  const selected = data?.announcements.find((item) => item.id === selectedId);

  const handleChanged = async (updated?: AnnouncementRecord) => {
    if (!updated) {
      await load();
      return;
    }
    setData((current) =>
      current
        ? {
            ...current,
            announcements: current.announcements.some((item) => item.id === updated.id)
              ? current.announcements.map((item) => (item.id === updated.id ? updated : item))
              : [updated, ...current.announcements],
          }
        : current,
    );
    setSelectedId(updated.id);
  };

  if (loading && !data) return <AnnouncementsLoading />;
  if (!data) {
    return (
      <Surface className="announcements-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir este módulo.'}
          icon={<AnnouncementsIcon size={28} />}
          onAction={() => void load()}
          title="Anuncios no disponibles"
        />
      </Surface>
    );
  }

  return (
    <div className="announcements-page">
      <PageHeader
        actions={
          <Button onClick={() => setDrawer('create')} size="sm">
            <AnnouncementsIcon size={17} /> Nuevo anuncio
          </Button>
        }
        description={`${condominiumName} · mensajes claros, segmentados y con trazabilidad.`}
        eyebrow="Comunicación comunitaria"
        title="Anuncios"
      />

      {warning ? (
        <div className="announcements-inline-message" data-tone="warning">
          {warning}
        </div>
      ) : null}

      <div className="announcements-metrics-grid">
        <MetricCard
          detail="En preparación"
          icon={<AnnouncementsIcon size={20} />}
          label="Borradores"
          tone="blue"
          value={stats.drafts}
        />
        <MetricCard
          detail="Pendientes de publicación"
          icon={<BellIcon size={20} />}
          label="Programados"
          tone="navy"
          value={stats.scheduled}
        />
        <MetricCard
          detail="Visibles para la comunidad"
          icon={<CheckCircleIcon size={20} />}
          label="Publicados"
          tone="green"
          value={stats.published}
        />
        <MetricCard
          detail="Solicitan confirmación"
          icon={<PeopleIcon size={20} />}
          label="Con lectura"
          tone="amber"
          value={stats.acknowledgement}
        />
      </div>

      <Surface className="announcements-workspace">
        <div className="announcements-status-tabs">
          <button
            data-active={!filters.status || undefined}
            onClick={() => setFilters((current) => ({ ...current, status: '' }))}
            type="button"
          >
            Todos <strong>{data.announcements.length}</strong>
          </button>
          {statuses.map((status) => (
            <button
              data-active={filters.status === status || undefined}
              key={status}
              onClick={() => setFilters((current) => ({ ...current, status }))}
              type="button"
            >
              {statusLabels[status]}
              <strong>{data.announcements.filter((item) => item.status === status).length}</strong>
            </button>
          ))}
        </div>
        <div className="announcements-toolbar">
          <label className="announcements-search">
            <AnnouncementsIcon size={18} />
            <input
              aria-label="Buscar anuncios"
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Buscar título, contenido, edificio o unidad"
              value={filters.query}
            />
          </label>
          <Select
            aria-label="Prioridad"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                priority: event.target.value as AnnouncementPriority | '',
              }))
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
            aria-label="Audiencia"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                audience: event.target.value as AnnouncementAudience | '',
              }))
            }
            value={filters.audience}
          >
            <option value="">Todas las audiencias</option>
            {audiences.map((audience) => (
              <option key={audience} value={audience}>
                {audienceLabels[audience]}
              </option>
            ))}
          </Select>
        </div>

        {!filtered.length ? (
          <EmptyState
            actionLabel="Nuevo anuncio"
            description="Ajusta los filtros o prepara un nuevo comunicado."
            icon={<AnnouncementsIcon size={26} />}
            onAction={() => setDrawer('create')}
            title="No encontramos anuncios"
          />
        ) : (
          <div className="announcements-grid">
            {filtered.map((announcement) => (
              <AnnouncementCard
                announcement={announcement}
                buildings={data.buildings}
                key={announcement.id}
                onOpen={() => {
                  setSelectedId(announcement.id);
                  setDrawer('detail');
                }}
                units={data.units}
              />
            ))}
          </div>
        )}
      </Surface>

      {drawer === 'create' ? (
        <CreateAnnouncementDrawer
          buildings={data.buildings}
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
        <AnnouncementDetailDrawer
          announcement={selected}
          buildings={data.buildings}
          condominiumId={condominiumId}
          onChanged={handleChanged}
          onClose={() => setDrawer(null)}
          session={session}
          units={data.units}
        />
      ) : null}
    </div>
  );
}
