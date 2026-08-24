import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ReportsIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { apiRequest } from '../lib/api';
import '../audit-log.css';

type AuditModule =
  'payments' | 'expenses' | 'treasury' | 'maintenance' | 'governance' | 'assemblies';
type AuditSeverity = 'info' | 'warning';

type AuditEvent = {
  event_id: string;
  occurred_at: string;
  actor_user_id: string | null;
  module: AuditModule;
  entity_type: string;
  entity_id: string;
  action: string;
  severity: AuditSeverity;
  summary: string;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type AuditFilters = {
  module: AuditModule | '';
  severity: AuditSeverity | '';
  actor: string;
  entityType: string;
  from: string;
  to: string;
};

const PAGE_SIZE = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const initialFilters: AuditFilters = {
  module: '',
  severity: '',
  actor: '',
  entityType: '',
  from: '',
  to: '',
};

const moduleLabels: Record<AuditModule, string> = {
  payments: 'Pagos',
  expenses: 'Gastos',
  treasury: 'Tesorería',
  maintenance: 'Mantenimiento',
  governance: 'Gobernanza',
  assemblies: 'Asambleas',
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const shortId = (value: string | null) =>
  value ? `${value.slice(0, 8)}…${value.slice(-4)}` : 'Sistema';
const humanize = (value: string) => value.replaceAll('_', ' ');

function toIso(value: string) {
  return value ? new Date(value).toISOString() : '';
}

function buildPath(condominiumId: string, filters: AuditFilters, offset: number) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (filters.module) params.set('module', filters.module);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.actor.trim()) params.set('actor', filters.actor.trim());
  if (filters.entityType.trim()) params.set('entityType', filters.entityType.trim());
  if (filters.from) params.set('from', toIso(filters.from));
  if (filters.to) params.set('to', toIso(filters.to));
  return `/v1/condominiums/${condominiumId}/audit-events?${params.toString()}`;
}

export function AuditLogPage({ condominiumId, condominiumName, session }: Props) {
  const [filters, setFilters] = useState<AuditFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(initialFilters);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await apiRequest<AuditEvent[]>(
        buildPath(condominiumId, appliedFilters, offset),
        session,
      );
      setEvents(rows);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el registro de auditoría.',
      );
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, condominiumId, offset, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setOffset(0);
  }, [condominiumId]);

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((value) => Boolean(value)).length,
    [appliedFilters],
  );

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const actor = filters.actor.trim();
    if (actor && !uuidPattern.test(actor)) {
      setError('El Actor ID debe ser un UUID válido.');
      return;
    }
    if (filters.from && filters.to && Date.parse(filters.to) < Date.parse(filters.from)) {
      setError('La fecha final no puede ser anterior a la fecha inicial.');
      return;
    }
    setError('');
    setOffset(0);
    setAppliedFilters({ ...filters, actor });
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setOffset(0);
    setError('');
  };

  const useActorAsFilter = (actorUserId: string) => {
    setFilters((current) => ({ ...current, actor: actorUserId }));
  };

  return (
    <div className="audit-page">
      <PageHeader
        description={`${condominiumName} · historial administrativo consolidado, read-only y limitado por autorización del servidor.`}
        eyebrow="Sistema y seguridad"
        title="Registro de auditoría"
      />

      {error ? <div className="audit-inline-alert">{error}</div> : null}

      <Surface className="audit-filter-panel">
        <form className="audit-filters ux-form" onSubmit={applyFilters}>
          <Field label="Módulo">
            <Select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  module: event.target.value as AuditModule | '',
                }))
              }
              value={filters.module}
            >
              <option value="">Todos</option>
              {Object.entries(moduleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Severidad">
            <Select
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  severity: event.target.value as AuditSeverity | '',
                }))
              }
              value={filters.severity}
            >
              <option value="">Todas</option>
              <option value="info">Informativa</option>
              <option value="warning">Advertencia</option>
            </Select>
          </Field>
          <Field hint="Ej. payment, expense, assembly." label="Tipo de entidad">
            <input
              className="input"
              onChange={(event) =>
                setFilters((current) => ({ ...current, entityType: event.target.value }))
              }
              placeholder="payment"
              value={filters.entityType}
            />
          </Field>
          <Field hint="UUID del usuario; puedes copiarlo desde una fila." label="Actor ID">
            <input
              className="input"
              onChange={(event) =>
                setFilters((current) => ({ ...current, actor: event.target.value }))
              }
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={filters.actor}
            />
          </Field>
          <Field label="Desde">
            <input
              className="input"
              onChange={(event) =>
                setFilters((current) => ({ ...current, from: event.target.value }))
              }
              type="datetime-local"
              value={filters.from}
            />
          </Field>
          <Field label="Hasta">
            <input
              className="input"
              onChange={(event) =>
                setFilters((current) => ({ ...current, to: event.target.value }))
              }
              type="datetime-local"
              value={filters.to}
            />
          </Field>
          <div className="audit-filter-actions">
            <Button size="sm" type="submit">
              Aplicar filtros
            </Button>
            <Button onClick={clearFilters} size="sm" type="button" variant="secondary">
              Limpiar
            </Button>
          </div>
        </form>
      </Surface>

      <div className="audit-result-bar">
        <div>
          <strong>Actividad administrativa</strong>
          <span>
            {activeFilterCount
              ? `${activeFilterCount} filtros activos · página ${Math.floor(offset / PAGE_SIZE) + 1}`
              : `Todos los eventos · página ${Math.floor(offset / PAGE_SIZE) + 1}`}
          </span>
        </div>
        <Button disabled={loading} onClick={() => void load()} size="sm" variant="secondary">
          Actualizar
        </Button>
      </div>

      <Surface className="audit-table-surface">
        {loading ? (
          <div aria-label="Cargando auditoría" className="audit-loading">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="skeleton--card" key={index} />
            ))}
          </div>
        ) : events.length ? (
          <>
            <div className="audit-table-scroll">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Módulo</th>
                    <th>Evento</th>
                    <th>Entidad</th>
                    <th>Actor</th>
                    <th>Severidad</th>
                    <th>Metadata segura</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((auditEvent) => (
                    <tr key={auditEvent.event_id}>
                      <td>
                        <time dateTime={auditEvent.occurred_at}>
                          {formatDate(auditEvent.occurred_at)}
                        </time>
                      </td>
                      <td>{moduleLabels[auditEvent.module]}</td>
                      <td>
                        <strong>{auditEvent.summary}</strong>
                        <small>{humanize(auditEvent.action)}</small>
                      </td>
                      <td>
                        <strong>{humanize(auditEvent.entity_type)}</strong>
                        <code title={auditEvent.entity_id}>{shortId(auditEvent.entity_id)}</code>
                      </td>
                      <td>
                        {auditEvent.actor_user_id ? (
                          <button
                            className="audit-id-button"
                            onClick={() => useActorAsFilter(auditEvent.actor_user_id ?? '')}
                            title="Usar este actor como filtro"
                            type="button"
                          >
                            {shortId(auditEvent.actor_user_id)}
                          </button>
                        ) : (
                          <span>Sistema</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={auditEvent.severity === 'warning' ? 'warning' : 'info'}>
                          {auditEvent.severity === 'warning' ? 'Advertencia' : 'Info'}
                        </Badge>
                      </td>
                      <td>
                        {Object.keys(auditEvent.metadata).length ? (
                          <details className="audit-metadata">
                            <summary>Ver</summary>
                            <pre>{JSON.stringify(auditEvent.metadata, null, 2)}</pre>
                          </details>
                        ) : (
                          <span className="audit-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div aria-label="Eventos de auditoría" className="audit-mobile-list">
              {events.map((auditEvent) => (
                <article className="audit-mobile-card" key={auditEvent.event_id}>
                  <header>
                    <div>
                      <span>{moduleLabels[auditEvent.module]}</span>
                      <time dateTime={auditEvent.occurred_at}>
                        {formatDate(auditEvent.occurred_at)}
                      </time>
                    </div>
                    <Badge tone={auditEvent.severity === 'warning' ? 'warning' : 'info'}>
                      {auditEvent.severity === 'warning' ? 'Advertencia' : 'Info'}
                    </Badge>
                  </header>

                  <div className="audit-mobile-card__event">
                    <strong>{auditEvent.summary}</strong>
                    <span>{humanize(auditEvent.action)}</span>
                  </div>

                  <dl>
                    <div>
                      <dt>Entidad</dt>
                      <dd>
                        <strong>{humanize(auditEvent.entity_type)}</strong>
                        <code title={auditEvent.entity_id}>{shortId(auditEvent.entity_id)}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Actor</dt>
                      <dd>
                        {auditEvent.actor_user_id ? (
                          <button
                            className="audit-id-button audit-id-button--mobile"
                            onClick={() => useActorAsFilter(auditEvent.actor_user_id ?? '')}
                            title="Usar este actor como filtro"
                            type="button"
                          >
                            {shortId(auditEvent.actor_user_id)}
                          </button>
                        ) : (
                          <span>Sistema</span>
                        )}
                      </dd>
                    </div>
                    {auditEvent.correlation_id ? (
                      <div>
                        <dt>Correlación</dt>
                        <dd>
                          <code title={auditEvent.correlation_id}>
                            {shortId(auditEvent.correlation_id)}
                          </code>
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {Object.keys(auditEvent.metadata).length ? (
                    <details className="audit-metadata audit-metadata--mobile">
                      <summary>Ver Metadata segura</summary>
                      <pre>{JSON.stringify(auditEvent.metadata, null, 2)}</pre>
                    </details>
                  ) : (
                    <span className="audit-muted">Sin metadata adicional.</span>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            description="No hay eventos que coincidan con los filtros aplicados."
            icon={<ReportsIcon size={28} />}
            title="Sin actividad para mostrar"
          />
        )}
      </Surface>

      <nav aria-label="Paginación del registro de auditoría" className="audit-pagination">
        <Button
          disabled={loading || offset === 0}
          onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          size="sm"
          variant="secondary"
        >
          Anterior
        </Button>
        <span>
          Filas {events.length ? offset + 1 : 0}–{offset + events.length}
        </span>
        <Button
          disabled={loading || events.length < PAGE_SIZE}
          onClick={() => setOffset((current) => current + PAGE_SIZE)}
          size="sm"
          variant="secondary"
        >
          Siguiente
        </Button>
      </nav>
    </div>
  );
}
