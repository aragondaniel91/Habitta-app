import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const count = (value: string, needle: string) => value.split(needle).length - 1;

const maintenanceSource = source('./pages/MaintenancePageBase.tsx');
const maintenanceStyles = source('./maintenance.css');
const sharedStyles = source('./styles.css');
const parityMatrix = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-257 Maintenance shared form layout', () => {
  it('migrates exactly the compatible Maintenance grids and form footers', () => {
    expect(maintenanceSource).toContain(
      "import { FormActions, FormGrid } from '../components/FormLayout'",
    );
    expect(count(maintenanceSource, '<FormGrid')).toBe(12);
    expect(count(maintenanceSource, '<FormGrid columns={3}>')).toBe(3);
    expect(count(maintenanceSource, '<FormActions>')).toBe(4);
    expect(maintenanceSource).not.toContain('maintenance-form-grid');
    expect(maintenanceSource).not.toContain('maintenance-form__actions');
    expect(maintenanceSource).toContain('maintenance-detail__actions');
  });

  it('preserves topology-aware UUID-backed asset locations', () => {
    expect(maintenanceSource).toContain('supportsBuildingStructure(propertyTopology)');
    expect(maintenanceSource).toContain('unitReferenceLabel');
    expect(maintenanceSource).toContain('<option key={building.id} value={building.id}>');
    expect(maintenanceSource).toContain('<option key={unit.id} value={unit.id}>');
    expect(maintenanceSource).toContain('<option key={asset.id} value={asset.id}>');
    expect(maintenanceSource).toContain('<option key={vendor.id} value={vendor.id}>');
  });

  it('preserves work-order concurrency, lifecycle notes and dates', () => {
    expect(maintenanceSource).toContain('expectedVersion: workOrder.version');
    expect(maintenanceSource).toContain('note.trim().length < 3');
    expect(maintenanceSource).toContain(
      'scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined',
    );
    expect(maintenanceSource).toContain('dueOn: dueOn || undefined');
  });

  it('preserves service-log amount and currency semantics', () => {
    expect(maintenanceSource).toContain('amount: amount ? Number(amount) : undefined');
    expect(maintenanceSource).toContain('currencyCode: amount ? currency : undefined');
  });

  it('removes only dead local form-layout ownership and inherits shared responsive grids', () => {
    expect(maintenanceStyles).not.toContain('maintenance-form-grid');
    expect(maintenanceStyles).not.toContain('maintenance-form__actions');
    expect(maintenanceStyles).toContain('.maintenance-detail__actions {');
    expect(sharedStyles).toContain(".form-grid[data-columns='2']");
    expect(sharedStyles).toContain(".form-grid[data-columns='3']");
    expect(sharedStyles).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('marks Maintenance compliant only after the focused migration contract exists', () => {
    expect(parityMatrix).toContain(
      '| Mantenimiento | Asset, Plan, Work Order y Service Log forms | compliant | Sí | Sí | Sí | Sí |',
    );
  });
});
