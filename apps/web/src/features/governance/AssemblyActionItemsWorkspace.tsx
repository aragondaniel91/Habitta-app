import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { PageHeader } from '../../components/PageHeader';
import { CheckCircleIcon, MaintenanceIcon, RequestsIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import type { MaintenanceWorkOrder } from '../../lib/maintenance';
import type { ServiceRequestRecord } from '../../lib/service-requests';
import { canManageGovernance, useCondominiumRoles } from '../../lib/roles';
import {
  loadAssemblyActionAssigneeLabels,
  loadAssemblyActionAssignees,
} from './action-item-assignees';
import type {
  AssemblyActionAssignee as Assignee,
  AssemblyActionAssigneeLabel,
} from './action-item-assignees';
import './assembly-action-items-workspace.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type ActionItemStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
type StatusFilter = 'all' | ActionItemStatus;
type DueFilter = 'all' | 'overdue' | 'upcoming' | 'completed';

type AssemblySummary = {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
};

type AssemblyResolution = {
  id: string;
  assembly_id: string;
  title: string;
  resolution_text: string;
  published_at: string | null;
};

type ActionItem = {
  id: string;
  condominium_id: string;
  assembly_id: string;
  resolution_id: string | null;
  service_request_id: string | null;
  maintenance_work_order_id: string | null;
  title: string;
  description: string | null;
  assigned_to_user_id: string | null;
  due_on: string | null;
  status: ActionItemStatus;
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type Draft = {
  assemblyId: string;
  title: string;
  description: string;
  resolutionId: string;
  assigneeUserId: string;
  dueOn: string;
  serviceRequestId: string;
  maintenanceWorkOrderId: string;
};

type EditorState = { mode: 'create'; item: null } | { mode: 'edit'; item: ActionItem } | null;

const statusLabels: Record<ActionItemStatus, string> = {
  open: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const roleLabels: Record<string, string> = {
  organization_owner: 'Propietario de la organización',
  condominium_admin: 'Administrador',
  accountant: 'Contador',
  assistant: 'Asistente',
  board_member: 'Junta de condominio',
};

const isFinalized = (status: ActionItemStatus) => status === 'completed' || status === 'cancelled';

const statusTone = (status: ActionItemStatus) => {
  if (status === 'completed') return 'success' as const;
  if (status === 'in_progress') return 'warning' as const;
  if (status === 'cancelled') return 'neutral' as const;
  return 'info' as const;
};

const dateLabel = (value: string | null) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const assemblyDateLabel = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const localDateKey = (value: Date) => {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
};

const today = () => localDateKey(new Date());

const upcomingLimit = () => {
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);
  return localDateKey(limit);
};

const emptyDraft = (assemblyId = ''): Draft => ({
  assemblyId,
  title: '',
  description: '',
  resolutionId: '',
  assigneeUserId: '',
  dueOn: '',
  serviceRequestId: '',
  maintenanceWorkOrderId: '',
});

const assigneeLabel = (assignee: Assignee | undefined) => {
  if (!assignee) return 'Responsable asignado';
  const identity = assignee.full_name || assignee.email || 'Miembro del equipo';
  return `${identity} · ${roleLabels[assignee.role] ?? assignee.role}`;
};

export function AssemblyActionItemsWorkspace({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManageGovernance(roles);
  const [assemblies, setAssemblies] = useState<AssemblySummary[]>([]);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [resolutions, setResolutions] = useState<AssemblyResolution[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assignedLabels, setAssignedLabels] = useState<AssemblyActionAssigneeLabel[]>([]);
  const [requests, setRequests] = useState<ServiceRequestRecord[]>([]);
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>([]);
  const [assemblyFilter, setAssemblyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [loading, setLoading] = useState(true);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [error, setError] = useState('');
  const [referenceError, setReferenceError] = useState('');
  const [labelError, setLabelError] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [transitioningId, setTransitioningId] = useState('');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextAssemblies = await apiRequest<AssemblySummary[]>(
        `/v1/condominiums/${condominiumId}/assemblies`,
        session,
      );
      const grouped = await Promise.all(
        nextAssemblies.map(async (assembly) => {
          const [actionItems, assemblyResolutions] = await Promise.all([
            apiRequest<ActionItem[]>(
              `/v1/condominiums/${condominiumId}/assemblies/${assembly.id}/action-items`,
              session,
            ),
            apiRequest<AssemblyResolution[]>(
              `/v1/condominiums/${condominiumId}/assemblies/${assembly.id}/resolutions`,
              session,
            ),
          ]);
          return { actionItems, assemblyResolutions };
        }),
      );
      setAssemblies(nextAssemblies);
      setItems(grouped.flatMap((group) => group.actionItems));
      setResolutions(grouped.flatMap((group) => group.assemblyResolutions));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'No se pudieron cargar los acuerdos.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  const loadAssignedLabels = useCallback(async () => {
    setLabelError('');
    try {
      setAssignedLabels(await loadAssemblyActionAssigneeLabels(condominiumId));
    } catch (loadError) {
      setAssignedLabels([]);
      setLabelError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar los nombres de los responsables.',
      );
    }
  }, [condominiumId]);

  const loadManagementReferences = useCallback(async () => {
    if (!manage) {
      setAssignees([]);
      setRequests([]);
      setWorkOrders([]);
      setReferenceError('');
      return;
    }

    setReferenceLoading(true);
    setReferenceError('');
    try {
      const [nextAssignees, nextRequests, nextWorkOrders] = await Promise.all([
        loadAssemblyActionAssignees(condominiumId),
        apiRequest<ServiceRequestRecord[]>(`/v1/condominiums/${condominiumId}/requests`, session),
        apiRequest<MaintenanceWorkOrder[]>(
          `/v1/condominiums/${condominiumId}/maintenance/work-orders`,
          session,
        ),
      ]);
      setAssignees(nextAssignees);
      setRequests(nextRequests);
      setWorkOrders(nextWorkOrders);
    } catch (loadError) {
      setReferenceError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar los selectores operativos.',
      );
    } finally {
      setReferenceLoading(false);
    }
  }, [condominiumId, manage, session]);

  useEffect(() => {
    setAssemblyFilter('all');
    setStatusFilter('all');
    setDueFilter('all');
    setEditor(null);
    setDraft(emptyDraft());
    void loadWorkspace();
    void loadAssignedLabels();
  }, [condominiumId, loadAssignedLabels, loadWorkspace]);

  useEffect(() => {
    void loadManagementReferences();
  }, [loadManagementReferences]);

  const assemblyById = useMemo(
    () => new Map(assemblies.map((assembly) => [assembly.id, assembly])),
    [assemblies],
  );
  const resolutionById = useMemo(
    () => new Map(resolutions.map((resolution) => [resolution.id, resolution])),
    [resolutions],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.user_id, assignee])),
    [assignees],
  );
  const assignedLabelById = useMemo(
    () => new Map(assignedLabels.map((label) => [label.user_id, label.display_name])),
    [assignedLabels],
  );
  const requestById = useMemo(
    () => new Map(requests.map((request) => [request.id, request])),
    [requests],
  );
  const workOrderById = useMemo(
    () => new Map(workOrders.map((workOrder) => [workOrder.id, workOrder])),
    [workOrders],
  );

  const eligibleAssemblies = useMemo(
    () => assemblies.filter((assembly) => ['in_progress', 'completed'].includes(assembly.status)),
    [assemblies],
  );

  const visibleItems = useMemo(() => {
    const currentDate = today();
    const nextWeek = upcomingLimit();
    return items.filter((item) => {
      if (assemblyFilter !== 'all' && item.assembly_id !== assemblyFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (dueFilter === 'overdue') {
        return !isFinalized(item.status) && Boolean(item.due_on && item.due_on < currentDate);
      }
      if (dueFilter === 'upcoming') {
        return Boolean(
          !isFinalized(item.status) &&
          item.due_on &&
          item.due_on >= currentDate &&
          item.due_on <= nextWeek,
        );
      }
      if (dueFilter === 'completed') return item.status === 'completed';
      return true;
    });
  }, [assemblyFilter, dueFilter, items, statusFilter]);

  const metrics = useMemo(() => {
    const currentDate = today();
    const nextWeek = upcomingLimit();
    return {
      open: items.filter((item) => !isFinalized(item.status)).length,
      overdue: items.filter(
        (item) => !isFinalized(item.status) && item.due_on && item.due_on < currentDate,
      ).length,
      upcoming: items.filter(
        (item) =>
          !isFinalized(item.status) &&
          item.due_on &&
          item.due_on >= currentDate &&
          item.due_on <= nextWeek,
      ).length,
      completed: items.filter((item) => item.status === 'completed').length,
    };
  }, [items]);

  const openCreate = () => {
    const defaultAssembly =
      eligibleAssemblies.find((assembly) => assembly.status === 'in_progress') ??
      eligibleAssemblies[0];
    setDraft(emptyDraft(defaultAssembly?.id ?? ''));
    setEditor({ mode: 'create', item: null });
  };

  const openEdit = (item: ActionItem) => {
    setDraft({
      assemblyId: item.assembly_id,
      title: item.title,
      description: item.description ?? '',
      resolutionId: item.resolution_id ?? '',
      assigneeUserId: item.assigned_to_user_id ?? '',
      dueOn: item.due_on ?? '',
      serviceRequestId: item.service_request_id ?? '',
      maintenanceWorkOrderId: item.maintenance_work_order_id ?? '',
    });
    setEditor({ mode: 'edit', item });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
  };

  const publishedResolutions = resolutions.filter(
    (resolution) => resolution.assembly_id === draft.assemblyId && resolution.published_at,
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor || !manage || !draft.assemblyId) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: draft.title,
        description: draft.description || null,
        resolutionId: draft.resolutionId || null,
        assigneeUserId: draft.assigneeUserId || null,
        dueOn: draft.dueOn || null,
        serviceRequestId: draft.serviceRequestId || null,
        maintenanceWorkOrderId: draft.maintenanceWorkOrderId || null,
      };

      if (editor.mode === 'create') {
        await apiRequest(
          `/v1/condominiums/${condominiumId}/assemblies/${draft.assemblyId}/action-items`,
          session,
          { method: 'POST', body: JSON.stringify(payload) },
        );
      } else {
        await apiRequest(
          `/v1/condominiums/${condominiumId}/assemblies/${editor.item.assembly_id}/action-items/${editor.item.id}`,
          session,
          {
            method: 'PATCH',
            body: JSON.stringify({ ...payload, expectedVersion: editor.item.version }),
          },
        );
      }
      setEditor(null);
      await Promise.all([loadWorkspace(), loadAssignedLabels()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el acuerdo.');
    } finally {
      setSaving(false);
    }
  };

  const transition = async (item: ActionItem, status: ActionItemStatus) => {
    if (!manage || isFinalized(item.status)) return;
    setTransitioningId(item.id);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/assemblies/${item.assembly_id}/action-items/${item.id}/transition`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ status, expectedVersion: item.version }),
        },
      );
      await loadWorkspace();
    } catch (transitionError) {
      setError(
        transitionError instanceof Error
          ? transitionError.message
          : 'No se pudo actualizar el estado del acuerdo.',
      );
    } finally {
      setTransitioningId('');
    }
  };

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="Cargando acuerdos y seguimiento"
        className="action-items-page"
      >
        <PageHeader eyebrow="Gobernanza" title="Acuerdos y seguimiento" />
        <div className="action-items-metrics">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="skeleton--card" key={index} />
          ))}
        </div>
        <Skeleton className="action-items-list-skeleton" />
      </div>
    );
  }

  return (
    <div className="action-items-page">
      <PageHeader
        actions={
          manage ? (
            <Button disabled={!eligibleAssemblies.length || referenceLoading} onClick={openCreate}>
              Nuevo acuerdo
            </Button>
          ) : undefined
        }
        description={`Convierte las decisiones de ${condominiumName} en compromisos con responsable, fecha y trazabilidad.`}
        eyebrow="Gobernanza"
        title="Acuerdos y seguimiento"
      />

      {error ? (
        <div aria-live="polite" className="action-items-alert" role="status">
          {error}
        </div>
      ) : null}
      {labelError ? (
        <div aria-live="polite" className="action-items-alert" role="status">
          Los acuerdos siguen visibles, pero no se pudieron resolver los nombres de sus
          responsables: {labelError}
          <Button onClick={() => void loadAssignedLabels()} size="sm" variant="ghost">
            Reintentar
          </Button>
        </div>
      ) : null}
      {manage && referenceError ? (
        <div aria-live="polite" className="action-items-alert" role="status">
          Los acuerdos siguen visibles, pero los selectores de responsables y vínculos operativos no
          están disponibles: {referenceError}
          <Button onClick={() => void loadManagementReferences()} size="sm" variant="ghost">
            Reintentar
          </Button>
        </div>
      ) : null}

      <div className="action-items-metrics" aria-label="Resumen de acuerdos">
        <Surface>
          <small>Activos</small>
          <strong>{metrics.open}</strong>
          <span>Pendientes o en curso</span>
        </Surface>
        <Surface>
          <small>Vencidos</small>
          <strong>{metrics.overdue}</strong>
          <span>Requieren atención</span>
        </Surface>
        <Surface>
          <small>Próximos a vencer</small>
          <strong>{metrics.upcoming}</strong>
          <span>Durante los próximos 7 días</span>
        </Surface>
        <Surface>
          <small>Completados</small>
          <strong>{metrics.completed}</strong>
          <span>Acuerdos finalizados</span>
        </Surface>
      </div>

      <Surface className="action-items-filters">
        <Field label="Asamblea">
          <Select
            value={assemblyFilter}
            onChange={(event) => setAssemblyFilter(event.target.value)}
          >
            <option value="all">Todas las asambleas</option>
            {assemblies.map((assembly) => (
              <option key={assembly.id} value={assembly.id}>
                {assembly.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">Todos los estados</option>
            <option value="open">Pendientes</option>
            <option value="in_progress">En curso</option>
            <option value="completed">Completados</option>
            <option value="cancelled">Cancelados</option>
          </Select>
        </Field>
        <Field label="Vencimiento">
          <Select
            value={dueFilter}
            onChange={(event) => setDueFilter(event.target.value as DueFilter)}
          >
            <option value="all">Cualquier fecha</option>
            <option value="overdue">Vencidos</option>
            <option value="upcoming">Próximos 7 días</option>
            <option value="completed">Completados</option>
          </Select>
        </Field>
      </Surface>

      {!assemblies.length ? (
        <EmptyState
          description="Cuando exista una asamblea en curso o completada, sus decisiones podrán convertirse en acuerdos accionables."
          icon={<CheckCircleIcon size={24} />}
          title="Aún no hay asambleas para dar seguimiento"
        />
      ) : !visibleItems.length ? (
        <EmptyState
          actionLabel={
            manage && items.length === 0 && eligibleAssemblies.length
              ? 'Crear primer acuerdo'
              : undefined
          }
          description={
            items.length
              ? 'No hay acuerdos que coincidan con los filtros actuales.'
              : 'Los acuerdos creados desde asambleas aparecerán aquí con sus responsables y vínculos operativos.'
          }
          icon={<CheckCircleIcon size={24} />}
          onAction={
            manage && items.length === 0 && eligibleAssemblies.length ? openCreate : undefined
          }
          title={items.length ? 'Sin coincidencias' : 'Aún no hay acuerdos registrados'}
        />
      ) : (
        <div className="action-items-list">
          {visibleItems.map((item) => {
            const assembly = assemblyById.get(item.assembly_id);
            const resolution = item.resolution_id
              ? resolutionById.get(item.resolution_id)
              : undefined;
            const assignee = item.assigned_to_user_id
              ? assigneeById.get(item.assigned_to_user_id)
              : undefined;
            const assignedDisplayName = item.assigned_to_user_id
              ? assignedLabelById.get(item.assigned_to_user_id)
              : undefined;
            const request = item.service_request_id
              ? requestById.get(item.service_request_id)
              : undefined;
            const workOrder = item.maintenance_work_order_id
              ? workOrderById.get(item.maintenance_work_order_id)
              : undefined;
            const overdue = Boolean(
              item.due_on && !isFinalized(item.status) && item.due_on < today(),
            );
            const busy = transitioningId === item.id;

            return (
              <Surface className="action-item-card" key={item.id}>
                <article>
                  <div className="action-item-card__heading">
                    <div>
                      <span className="action-item-card__assembly">
                        {assembly?.title ?? 'Asamblea'}
                        {assembly?.scheduled_at
                          ? ` · ${assemblyDateLabel(assembly.scheduled_at)}`
                          : ''}
                      </span>
                      <h2>{item.title}</h2>
                    </div>
                    <Badge tone={statusTone(item.status)}>{statusLabels[item.status]}</Badge>
                  </div>

                  {item.description ? (
                    <p className="action-item-card__description">{item.description}</p>
                  ) : null}

                  <dl className="action-item-card__meta">
                    <div>
                      <dt>Responsable</dt>
                      <dd>
                        {item.assigned_to_user_id
                          ? assignee
                            ? assigneeLabel(assignee)
                            : assignedDisplayName || 'Responsable asignado'
                          : 'Sin responsable asignado'}
                      </dd>
                    </div>
                    <div data-overdue={overdue || undefined}>
                      <dt>{overdue ? 'Vencido' : 'Fecha objetivo'}</dt>
                      <dd>{dateLabel(item.due_on)}</dd>
                    </div>
                    <div>
                      <dt>Resolución</dt>
                      <dd>
                        {resolution?.title ??
                          (item.resolution_id ? 'Resolución publicada' : 'Sin vínculo')}
                      </dd>
                    </div>
                  </dl>

                  {item.service_request_id || item.maintenance_work_order_id ? (
                    <div className="action-item-card__links" aria-label="Vínculos operativos">
                      {item.service_request_id ? (
                        <a href="/app/requests">
                          <RequestsIcon size={17} />
                          {request
                            ? `${request.request_number} · ${request.title}`
                            : 'Abrir solicitud vinculada'}
                        </a>
                      ) : null}
                      {item.maintenance_work_order_id ? (
                        <a href="/app/maintenance">
                          <MaintenanceIcon size={17} />
                          {workOrder
                            ? `${workOrder.work_order_number} · ${workOrder.title}`
                            : 'Abrir orden de mantenimiento vinculada'}
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {manage && !isFinalized(item.status) ? (
                    <div className="action-item-card__actions">
                      <Button
                        disabled={busy}
                        onClick={() => openEdit(item)}
                        size="sm"
                        variant="secondary"
                      >
                        Editar
                      </Button>
                      {item.status === 'open' ? (
                        <Button
                          disabled={busy}
                          onClick={() => void transition(item, 'in_progress')}
                          size="sm"
                          variant="secondary"
                        >
                          Iniciar
                        </Button>
                      ) : null}
                      <Button
                        disabled={busy}
                        onClick={() => void transition(item, 'completed')}
                        size="sm"
                      >
                        Completar
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => void transition(item, 'cancelled')}
                        size="sm"
                        variant="danger"
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : null}
                </article>
              </Surface>
            );
          })}
        </div>
      )}

      {editor ? (
        <Drawer
          eyebrow={editor.mode === 'create' ? 'Nuevo compromiso' : 'Edición controlada'}
          onClose={closeEditor}
          prefix="action-items"
          title={editor.mode === 'create' ? 'Crear acuerdo' : 'Editar acuerdo'}
          wide
        >
          <form className="action-items-form" onSubmit={(event) => void save(event)}>
            <Field
              hint={
                editor.mode === 'edit'
                  ? 'La asamblea de origen no cambia después de crear el acuerdo.'
                  : 'Solo se permiten asambleas del condominio actual.'
              }
              label="Asamblea"
            >
              <Select
                disabled={editor.mode === 'edit'}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    assemblyId: event.target.value,
                    resolutionId: '',
                  }))
                }
                required
                value={draft.assemblyId}
              >
                <option value="">Selecciona una asamblea</option>
                {eligibleAssemblies.map((assembly) => (
                  <option key={assembly.id} value={assembly.id}>
                    {assembly.title} · {assemblyDateLabel(assembly.scheduled_at)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Título">
              <input
                maxLength={180}
                minLength={3}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                required
                value={draft.title}
              />
            </Field>

            <Field label="Descripción">
              <textarea
                maxLength={4000}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                value={draft.description}
              />
            </Field>

            <div className="action-items-form__grid">
              <Field
                hint={
                  editor.mode === 'edit'
                    ? 'La resolución de origen queda fija para preservar trazabilidad.'
                    : 'Solo aparecen resoluciones ya publicadas.'
                }
                label="Resolución publicada"
              >
                <Select
                  disabled={editor.mode === 'edit'}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, resolutionId: event.target.value }))
                  }
                  value={draft.resolutionId}
                >
                  <option value="">Sin resolución vinculada</option>
                  {publishedResolutions.map((resolution) => (
                    <option key={resolution.id} value={resolution.id}>
                      {resolution.title}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                hint="El backend enumera únicamente responsables válidos para acuerdos de asamblea."
                label="Responsable"
              >
                <Select
                  disabled={referenceLoading || Boolean(referenceError)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))
                  }
                  value={draft.assigneeUserId}
                >
                  <option value="">Sin responsable asignado</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.user_id} value={assignee.user_id}>
                      {assigneeLabel(assignee)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Fecha objetivo">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, dueOn: event.target.value }))
                  }
                  type="date"
                  value={draft.dueOn}
                />
              </Field>

              <Field label="Solicitud vinculada">
                <Select
                  disabled={referenceLoading || Boolean(referenceError)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, serviceRequestId: event.target.value }))
                  }
                  value={draft.serviceRequestId}
                >
                  <option value="">Sin solicitud vinculada</option>
                  {requests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.request_number} · {request.title}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Orden de mantenimiento vinculada">
                <Select
                  disabled={referenceLoading || Boolean(referenceError)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maintenanceWorkOrderId: event.target.value,
                    }))
                  }
                  value={draft.maintenanceWorkOrderId}
                >
                  <option value="">Sin orden vinculada</option>
                  {workOrders.map((workOrder) => (
                    <option key={workOrder.id} value={workOrder.id}>
                      {workOrder.work_order_number} · {workOrder.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="action-items-form__actions">
              <Button disabled={saving} type="submit">
                {saving
                  ? 'Guardando…'
                  : editor.mode === 'create'
                    ? 'Crear acuerdo'
                    : 'Guardar cambios'}
              </Button>
              <Button disabled={saving} onClick={closeEditor} type="button" variant="ghost">
                Cancelar
              </Button>
            </div>
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}
