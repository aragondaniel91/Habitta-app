import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const chooserSource = source('./features/receivables/ChargeCreationChooser.tsx');
const drawerSource = source('./pages/ReceivablesDrawersImpl.tsx');
const recurringFoundationSource = source(
  '../../../supabase/migrations/20260815205032_hab185_recurring_dues_foundation.sql',
);

describe('HAB-242 one-time bulk charge guardrails', () => {
  it('labels the bulk workflow as a one-time operation instead of recurring dues', () => {
    expect(chooserSource).toContain('Extraordinaria de una sola vez');
    expect(chooserSource).toContain('no sustituye un plan de cuotas recurrentes');
    expect(drawerSource).toContain('Cargo masivo único');
    expect(drawerSource).toContain('Crear lote de una sola vez');
    expect(drawerSource).toContain('No programa');
    expect(drawerSource).toContain('ni sustituye Cuotas recurrentes');
    expect(drawerSource).toContain('Fondo extraordinario ascensores');
  });

  it('warns when a regular-dues concept is selected without blocking legitimate ad-hoc batches', () => {
    expect(drawerSource).toContain("selected?.category === 'regular_dues'");
    expect(drawerSource).toContain('Para cuotas mensuales o periódicas usa Cuotas recurrentes');
    expect(drawerSource).toContain('crear otro lote equivalente será una operación nueva');
    expect(drawerSource).toContain('<option key={concept.id} value={concept.id}>');
    expect(drawerSource).not.toContain("concept.category !== 'regular_dues'");
  });

  it('keeps retry idempotency tied to the preview payload', () => {
    expect(drawerSource).toContain('idempotencyKey: crypto.randomUUID()');
    expect(drawerSource).toContain('body: JSON.stringify(batchPreview.payload)');
    expect(drawerSource).toContain('/charge-batches/preview`');
    expect(drawerSource).toContain('/charge-batches/commit`');
  });

  it('preserves canonical recurring plan-period uniqueness', () => {
    expect(recurringFoundationSource).toContain('create table public.recurring_charge_runs');
    expect(recurringFoundationSource).toContain('unique (plan_id, period)');
  });

  it('uses the shared premium form contract for one-off and bulk charge creation', () => {
    expect(drawerSource).toContain('className="receivables-form ux-form"');
    expect(drawerSource).toContain('<FormGrid>');
    expect(drawerSource).toContain('<FormActions>');
    expect(drawerSource).toContain('className="input"');
  });

  it('keeps one-off charges scoped to the selected unit UUID and payload', () => {
    expect(drawerSource).toContain("unitId: String(values.get('unitId') ?? '')");
    expect(drawerSource).toContain('conceptId ? { conceptId } : {}');
    expect(drawerSource).toContain("description: String(values.get('description') ?? '')");
    expect(drawerSource).toContain("amount: String(values.get('amount') ?? '')");
    expect(drawerSource).toContain("currencyCode: String(values.get('currencyCode') ?? '')");
    expect(drawerSource).toContain("issueDate: String(values.get('issueDate') ?? '')");
    expect(drawerSource).toContain("dueDate ? { dueDate } : {}");
    expect(drawerSource).toContain('`/v1/condominiums/${condominiumId}/receivables`');
    expect(drawerSource).toContain('<option key={unit.id} value={unit.id}>');
  });

  it('keeps one-time batch unit targeting and distribution semantics', () => {
    expect(drawerSource).toContain("distributionMethod: 'fixed_per_unit'");
    expect(drawerSource).toContain("fixedAmount: String(values.get('fixedAmount') ?? '')");
    expect(drawerSource).toContain('rows: activeUnits.map((unit) => ({ unitId: unit.id }))');
    expect(drawerSource).toContain('Se aplicará una sola vez a cada unidad activa.');
  });
});
