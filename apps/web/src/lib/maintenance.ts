import { unitReferenceLabel } from './unit-domain';

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
  version: number;
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
  updated_at: string;
};

export type MaintenanceServiceLog = {
  id: string;
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

export type MaintenanceLocation = {
  id: string;
  name?: string;
  code?: string;
  building_id?: string | null;
};
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

export const frequencyUnitLabels: Record<MaintenanceFrequencyUnit, string> = {
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

export function formatMaintenanceDate(value: string | null, includeTime = false) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(includeTime ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(parsed);
}

export function maintenanceLocationLabel(
  asset: MaintenanceAsset,
  buildings: MaintenanceLocation[],
  units: MaintenanceLocation[],
) {
  if (asset.building_id) {
    const building = buildings.find((item) => item.id === asset.building_id);
    return building?.name ?? 'Edificio asignado';
  }
  if (asset.unit_id) {
    const unit = units.find((item) => item.id === asset.unit_id);
    const building = buildings.find((item) => item.id === unit?.building_id);
    return unit?.code
      ? unitReferenceLabel({ code: unit.code, buildingName: building?.name ?? null })
      : (unit?.name ?? 'Unidad asignada');
  }
  return asset.location_notes || 'Área común';
}

export function getMaintenanceMetrics(
  assets: MaintenanceAsset[],
  plans: MaintenancePlan[],
  workOrders: MaintenanceWorkOrder[],
  today = new Date().toISOString().slice(0, 10),
) {
  const openStatuses: MaintenanceWorkOrderStatus[] = ['draft', 'scheduled', 'in_progress'];
  return {
    activeAssets: assets.filter((item) => item.status === 'active').length,
    outOfServiceAssets: assets.filter((item) => item.status === 'out_of_service').length,
    activePlans: plans.filter((item) => item.is_active).length,
    overduePlans: plans.filter((item) => item.is_active && item.next_due_on < today).length,
    openWorkOrders: workOrders.filter((item) => openStatuses.includes(item.status)).length,
    urgentWorkOrders: workOrders.filter(
      (item) => openStatuses.includes(item.status) && item.priority === 'urgent',
    ).length,
  };
}

export function filterMaintenanceAssets(
  assets: MaintenanceAsset[],
  query: string,
  status: MaintenanceAssetStatus | '',
) {
  const normalized = query.trim().toLocaleLowerCase('es');
  return assets.filter((asset) => {
    if (status && asset.status !== status) return false;
    if (!normalized) return true;
    return [
      asset.code,
      asset.name,
      asset.category,
      asset.manufacturer,
      asset.model,
      asset.serial_number,
    ]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase('es').includes(normalized));
  });
}

export function filterMaintenanceWorkOrders(
  workOrders: MaintenanceWorkOrder[],
  query: string,
  status: MaintenanceWorkOrderStatus | '',
  priority: MaintenancePriority | '',
) {
  const normalized = query.trim().toLocaleLowerCase('es');
  return workOrders.filter((workOrder) => {
    if (status && workOrder.status !== status) return false;
    if (priority && workOrder.priority !== priority) return false;
    if (!normalized) return true;
    return [workOrder.work_order_number, workOrder.title, workOrder.description]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase('es').includes(normalized));
  });
}
