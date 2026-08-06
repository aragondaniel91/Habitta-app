import { describe, expect, it } from 'vitest';
import {
  filterMaintenanceAssets,
  filterMaintenanceWorkOrders,
  getMaintenanceMetrics,
  maintenanceLocationLabel,
} from './maintenance';
import type { MaintenanceAsset, MaintenancePlan, MaintenanceWorkOrder } from './maintenance';

const asset = (overrides: Partial<MaintenanceAsset> = {}): MaintenanceAsset => ({
  id: 'asset-1',
  condominium_id: 'condo-1',
  building_id: null,
  unit_id: null,
  code: 'BOMBA-01',
  name: 'Bomba principal',
  category: 'Bombas',
  manufacturer: 'ACME',
  model: 'P100',
  serial_number: 'SN-001',
  installed_on: null,
  warranty_expires_on: null,
  status: 'active',
  location_notes: 'Cuarto de bombas',
  notes: null,
  version: 1,
  updated_at: '2026-08-06T00:00:00Z',
  ...overrides,
});

const plan = (overrides: Partial<MaintenancePlan> = {}): MaintenancePlan => ({
  id: 'plan-1',
  condominium_id: 'condo-1',
  asset_id: 'asset-1',
  default_vendor_id: null,
  assigned_to_user_id: null,
  name: 'Inspección mensual',
  kind: 'inspection',
  instructions: 'Validar presión y fugas.',
  frequency_value: 1,
  frequency_unit: 'months',
  next_due_on: '2026-08-01',
  last_generated_due_on: null,
  estimated_duration_minutes: 30,
  is_active: true,
  version: 1,
  updated_at: '2026-08-06T00:00:00Z',
  ...overrides,
});

const workOrder = (overrides: Partial<MaintenanceWorkOrder> = {}): MaintenanceWorkOrder => ({
  id: 'work-1',
  work_order_number: 'WO-2026-000001',
  condominium_id: 'condo-1',
  asset_id: 'asset-1',
  plan_id: null,
  plan_due_on: null,
  request_id: null,
  vendor_id: null,
  assigned_to_user_id: null,
  kind: 'corrective',
  priority: 'urgent',
  status: 'scheduled',
  title: 'Corregir fuga',
  description: 'Fuga detectada en la bomba principal.',
  scheduled_for: null,
  due_on: '2026-08-06',
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  completion_summary: null,
  version: 1,
  updated_at: '2026-08-06T00:00:00Z',
  ...overrides,
});

describe('maintenance workspace helpers', () => {
  it('calculates operational metrics without mixing lifecycle states', () => {
    expect(
      getMaintenanceMetrics(
        [asset(), asset({ id: 'asset-2', status: 'out_of_service' })],
        [plan()],
        [workOrder(), workOrder({ id: 'work-2', status: 'completed' })],
        '2026-08-06',
      ),
    ).toEqual({
      activeAssets: 1,
      outOfServiceAssets: 1,
      activePlans: 1,
      overduePlans: 1,
      openWorkOrders: 1,
      urgentWorkOrders: 1,
    });
  });

  it('filters assets by status and recognizable equipment data', () => {
    const assets = [
      asset(),
      asset({ id: 'asset-2', code: 'ASC-01', name: 'Ascensor', status: 'retired' }),
    ];
    expect(filterMaintenanceAssets(assets, 'bomba', '')).toHaveLength(1);
    expect(filterMaintenanceAssets(assets, '', 'retired')).toHaveLength(1);
  });

  it('filters work orders by query, status and priority', () => {
    const workOrders = [
      workOrder(),
      workOrder({ id: 'work-2', title: 'Pintura', priority: 'low' }),
    ];
    expect(filterMaintenanceWorkOrders(workOrders, 'fuga', '', '')).toHaveLength(1);
    expect(filterMaintenanceWorkOrders(workOrders, '', 'scheduled', 'urgent')).toHaveLength(1);
  });

  it('resolves building, unit and common-area locations', () => {
    expect(
      maintenanceLocationLabel(
        asset({ building_id: 'building-1' }),
        [{ id: 'building-1', name: 'Torre A' }],
        [],
      ),
    ).toBe('Torre A');
    expect(
      maintenanceLocationLabel(asset({ unit_id: 'unit-1' }), [], [{ id: 'unit-1', code: 'A-101' }]),
    ).toBe('A-101');
    expect(maintenanceLocationLabel(asset(), [], [])).toBe('Cuarto de bombas');
  });
});
