export type MaintenanceAssetStatus = 'active' | 'out_of_service' | 'retired';
export type MaintenancePlanKind = 'preventive' | 'inspection';
export type MaintenanceFrequencyUnit = 'days' | 'weeks' | 'months' | 'years';
export type MaintenanceWorkOrderKind = 'preventive' | 'corrective' | 'inspection' | 'emergency';
export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent';
export type MaintenanceWorkOrderStatus =
  'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type MaintenanceAsset = {
  id: string;
  condominium_id: string;
  building_id: string | null;
  unit_id: string | null;
  code: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  installed_on: string | null;
  warranty_expires_on: string | null;
  status: MaintenanceAssetStatus;
  location_notes: string | null;
  notes: string | null;
  retired_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type MaintenancePlan = {
  id: string;
  condominium_id: string;
  asset_id: string;
  default_vendor_id: string | null;
  assigned_to_user_id: string | null;
  name: string;
  kind: MaintenancePlanKind;
  instructions: string;
  frequency_value: number;
  frequency_unit: MaintenanceFrequencyUnit;
  next_due_on: string;
  last_generated_due_on: string | null;
  estimated_duration_minutes: number | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type MaintenanceWorkOrder = {
  id: string;
  work_order_number: string;
  condominium_id: string;
  asset_id: string | null;
  plan_id: string | null;
  plan_due_on: string | null;
  request_id: string | null;
  vendor_id: string | null;
  assigned_to_user_id: string | null;
  kind: MaintenanceWorkOrderKind;
  priority: MaintenancePriority;
  status: MaintenanceWorkOrderStatus;
  title: string;
  description: string;
  scheduled_for: string | null;
  due_on: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  completion_summary: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type MaintenanceServiceLog = {
  id: string;
  condominium_id: string;
  work_order_id: string;
  vendor_id: string | null;
  performed_by_user_id: string | null;
  technician_name: string | null;
  serviced_on: string;
  summary: string;
  duration_minutes: number | null;
  service_amount: number | null;
  currency_code: string | null;
  reference: string | null;
  created_at: string;
};

export type MaintenanceEvent = {
  id: string;
  entity_type: 'asset' | 'plan' | 'work_order' | 'service_log';
  entity_id: string;
  event_type:
    | 'created'
    | 'updated'
    | 'status_changed'
    | 'generated'
    | 'service_logged'
    | 'activated'
    | 'deactivated'
    | 'retired';
  from_value: Record<string, unknown> | null;
  to_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export type MaintenanceBuilding = { id: string; name: string };
export type MaintenanceUnit = { id: string; code: string; building_id: string | null };
export type MaintenanceVendor = { id: string; name: string; is_active: boolean };

export const assetStatusLabels: Record<MaintenanceAssetStatus, string> = {
  active: 'Activo',
  out_of_service: 'Fuera de servicio',
  retired: 'Retirado',
};

export const planKindLabels: Record<MaintenancePlanKind, string> = {
  preventive: 'Preventivo',
  inspection: 'Inspección',
};

export const frequencyLabels: Record<MaintenanceFrequencyUnit, string> = {
  days: 'días',
  weeks: 'semanas',
  months: 'meses',
  years: 'años',
};

export const workOrderKindLabels: Record<MaintenanceWorkOrderKind, string> = {
  preventive: 'Preventiva',
  corrective: 'Correctiva',
  inspection: 'Inspección',
  emergency: 'Emergencia',
};

export const priorityLabels: Record<MaintenancePriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export const workOrderStatusLabels: Record<MaintenanceWorkOrderStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const nextWorkOrderStatuses = (
  status: MaintenanceWorkOrderStatus,
): MaintenanceWorkOrderStatus[] => {
  if (status === 'draft') return ['scheduled', 'cancelled'];
  if (status === 'scheduled') return ['in_progress', 'completed', 'cancelled'];
  if (status === 'in_progress') return ['completed', 'cancelled'];
  return [];
};

export const formatMaintenanceDate = (value: string | null, includeTime = false) => {
  if (!value) return 'Sin fecha';
  const date = new Date(includeTime || value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
};

export const isMaintenanceOverdue = (order: MaintenanceWorkOrder) =>
  Boolean(
    order.due_on &&
    !['completed', 'cancelled'].includes(order.status) &&
    order.due_on < new Date().toISOString().slice(0, 10),
  );

export const maintenanceStats = (
  assets: MaintenanceAsset[],
  plans: MaintenancePlan[],
  orders: MaintenanceWorkOrder[],
) => ({
  activeAssets: assets.filter((asset) => asset.status === 'active').length,
  outOfServiceAssets: assets.filter((asset) => asset.status === 'out_of_service').length,
  activePlans: plans.filter((plan) => plan.is_active).length,
  openOrders: orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length,
  overdueOrders: orders.filter(isMaintenanceOverdue).length,
  urgentOrders: orders.filter(
    (order) => order.priority === 'urgent' && !['completed', 'cancelled'].includes(order.status),
  ).length,
});
