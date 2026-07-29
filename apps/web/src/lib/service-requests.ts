export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ServiceRequestStatus =
  | 'submitted'
  | 'acknowledged'
  | 'in_progress'
  | 'waiting_resident'
  | 'waiting_vendor'
  | 'resolved'
  | 'closed'
  | 'cancelled';
export type ServiceRequestVisibility = 'public' | 'internal';

export type ServiceRequestRecord = {
  id: string;
  request_number: string;
  condominium_id: string;
  unit_id: string | null;
  category_id: string;
  requester_person_id: string | null;
  submitted_by_user_id: string;
  assigned_to_user_id: string | null;
  title: string;
  description: string;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  due_at: string | null;
  resolution_summary: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ServiceRequestCategory = {
  id: string;
  condominium_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ServiceRequestUnit = {
  id: string;
  code: string;
  status: string;
};

export type ServiceRequestPerson = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  auth_user_id?: string | null;
  status?: string | null;
};

export type ServiceRequestComment = {
  id: string;
  request_id: string;
  author_user_id: string;
  body: string;
  visibility: ServiceRequestVisibility;
  created_at: string;
};

export type ServiceRequestEvent = {
  id: string;
  request_id: string;
  event_type: string;
  visibility: ServiceRequestVisibility;
  actor_user_id: string | null;
  from_value: Record<string, unknown> | null;
  to_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ServiceRequestAttachment = {
  id: string;
  request_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  visibility: ServiceRequestVisibility;
  created_at: string;
};

export type ServiceRequestFilters = {
  query: string;
  status: string;
  priority: string;
  categoryId: string;
  unitId: string;
  assignment: '' | 'assigned' | 'unassigned';
};

export const priorityLabels: Record<ServiceRequestPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export const statusLabels: Record<ServiceRequestStatus, string> = {
  submitted: 'Recibida',
  acknowledged: 'Confirmada',
  in_progress: 'En progreso',
  waiting_resident: 'Esperando residente',
  waiting_vendor: 'Esperando proveedor',
  resolved: 'Resuelta',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

export const statusGroups = [
  {
    key: 'incoming',
    label: 'Entrada',
    statuses: ['submitted', 'acknowledged'] as ServiceRequestStatus[],
  },
  { key: 'active', label: 'En progreso', statuses: ['in_progress'] as ServiceRequestStatus[] },
  {
    key: 'waiting',
    label: 'En espera',
    statuses: ['waiting_resident', 'waiting_vendor'] as ServiceRequestStatus[],
  },
  {
    key: 'completed',
    label: 'Finalizadas',
    statuses: ['resolved', 'closed', 'cancelled'] as ServiceRequestStatus[],
  },
] as const;

const priorityWeight: Record<ServiceRequestPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

export function personName(person: ServiceRequestPerson | undefined) {
  return person ? `${person.first_name} ${person.last_name}`.trim() : 'Sin identificar';
}

export function isOpenRequest(status: ServiceRequestStatus) {
  return !['resolved', 'closed', 'cancelled'].includes(status);
}

export function isOverdueRequest(request: ServiceRequestRecord, now = new Date()) {
  return Boolean(
    request.due_at &&
    isOpenRequest(request.status) &&
    new Date(request.due_at).getTime() < now.getTime(),
  );
}

export function getRequestStats(requests: ServiceRequestRecord[], now = new Date()) {
  return requests.reduce(
    (stats, request) => {
      if (isOpenRequest(request.status)) stats.open += 1;
      if (isOpenRequest(request.status) && request.priority === 'urgent') stats.urgent += 1;
      if (isOverdueRequest(request, now)) stats.overdue += 1;
      if (isOpenRequest(request.status) && !request.assigned_to_user_id) stats.unassigned += 1;
      return stats;
    },
    { open: 0, urgent: 0, overdue: 0, unassigned: 0 },
  );
}

export function filterServiceRequests(
  requests: ServiceRequestRecord[],
  categories: ServiceRequestCategory[],
  units: ServiceRequestUnit[],
  people: ServiceRequestPerson[],
  filters: ServiceRequestFilters,
) {
  const query = normalize(filters.query);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const unitCodes = new Map(units.map((unit) => [unit.id, unit.code]));
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return [...requests]
    .filter((request) => {
      const requester = request.requester_person_id
        ? personName(peopleById.get(request.requester_person_id))
        : '';
      const matchesQuery =
        !query ||
        [
          request.request_number,
          request.title,
          request.description,
          categoryNames.get(request.category_id),
          request.unit_id ? unitCodes.get(request.unit_id) : '',
          requester,
        ]
          .map(normalize)
          .some((value) => value.includes(query));
      const matchesAssignment =
        !filters.assignment ||
        (filters.assignment === 'assigned'
          ? Boolean(request.assigned_to_user_id)
          : !request.assigned_to_user_id);
      return (
        matchesQuery &&
        (!filters.status || request.status === filters.status) &&
        (!filters.priority || request.priority === filters.priority) &&
        (!filters.categoryId || request.category_id === filters.categoryId) &&
        (!filters.unitId || request.unit_id === filters.unitId) &&
        matchesAssignment
      );
    })
    .sort(
      (left, right) =>
        priorityWeight[left.priority] - priorityWeight[right.priority] ||
        right.updated_at.localeCompare(left.updated_at),
    );
}

export function nextRequestStatuses(status: ServiceRequestStatus) {
  const transitions: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
    submitted: ['acknowledged', 'in_progress'],
    acknowledged: ['in_progress', 'waiting_resident', 'waiting_vendor', 'resolved'],
    in_progress: ['waiting_resident', 'waiting_vendor', 'resolved'],
    waiting_resident: ['in_progress', 'resolved'],
    waiting_vendor: ['in_progress', 'resolved'],
    resolved: ['in_progress', 'closed'],
    closed: [],
    cancelled: [],
  };
  return transitions[status];
}

export function formatRequestDate(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    created: 'Solicitud creada',
    status_changed: 'Estado actualizado',
    priority_changed: 'Prioridad actualizada',
    category_changed: 'Categoría actualizada',
    assigned: 'Responsable asignado',
    unassigned: 'Responsable retirado',
    due_date_changed: 'Fecha objetivo actualizada',
    comment_added: 'Comentario agregado',
    resolved: 'Solicitud resuelta',
    reopened: 'Solicitud reabierta',
    cancelled: 'Solicitud cancelada',
    attachment_added: 'Archivo adjuntado',
  };
  return labels[eventType] ?? eventType.replaceAll('_', ' ');
}

export function getEventDetail(event: ServiceRequestEvent) {
  if (
    event.event_type === 'status_changed' ||
    event.event_type === 'resolved' ||
    event.event_type === 'reopened'
  ) {
    const status = event.to_value?.status;
    return typeof status === 'string' && status in statusLabels
      ? statusLabels[status as ServiceRequestStatus]
      : '';
  }
  if (event.event_type === 'priority_changed') {
    const priority = event.to_value?.priority;
    return typeof priority === 'string' && priority in priorityLabels
      ? priorityLabels[priority as ServiceRequestPriority]
      : '';
  }
  return '';
}
