import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const count = (value: string, needle: string) => value.split(needle).length - 1;

const recurring = source('./features/receivables/RecurringDuesWorkspace.tsx');
const drawers = source('./pages/ReceivablesDrawersImpl.tsx');
const recurringCss = source('./recurring-dues.css');

describe('HAB-289 premium recurring, extraordinary and one-off charge flows', () => {
  it('moves recurring dues onto the shared premium form contract', () => {
    expect(recurring).toContain(
      "import { FormActions, FormGrid } from '../../components/FormLayout'",
    );
    expect(count(recurring, 'className="recurring-dues-form ux-form"')).toBe(2);
    expect(count(recurring, '<FormGrid')).toBe(5);
    expect(count(recurring, '<FormActions sticky>')).toBe(2);
    expect(recurringCss).not.toContain('recurring-dues-form-grid');
    expect(recurringCss).not.toContain('recurring-dues-drawer-footer');
  });

  it('preserves recurring-plan payload and explicit review-before-post semantics', () => {
    expect(recurring).toContain('conceptId: planForm.conceptId');
    expect(recurring).toContain('financialScopeId: planForm.financialScopeId');
    expect(recurring).toContain('distribution: planForm.distribution');
    expect(recurring).toContain('amount: planForm.amount');
    expect(recurring).toContain('currencyCode: planForm.currencyCode.toUpperCase()');
    expect(recurring).toContain('startsOn: planForm.startsOn');
    expect(recurring).toContain('endsOn: planForm.endsOn');
    expect(recurring).toContain('issueDay: Number(planForm.issueDay)');
    expect(recurring).toContain('dueDay: Number(planForm.dueDay)');
    expect(recurring).toContain('/recurring-charge-plans`');
    expect(recurring).toContain('/prepare`');
    expect(recurring).toContain('/post`');
    expect(recurring).toContain('Crear el plan no publica deuda');
    expect(recurring).toContain('Esto creará la deuda en cartera usando el reparto congelado');
  });

  it('moves one-off and extraordinary forms onto shared premium layout', () => {
    expect(drawers).toContain("import { FormActions, FormGrid } from '../components/FormLayout'");
    expect(count(drawers, 'className="receivables-form ux-form"')).toBe(2);
    expect(count(drawers, '<FormGrid>')).toBe(4);
    expect(count(drawers, '<FormActions>')).toBe(3);
    expect(count(drawers, 'className="input"')).toBe(8);
  });

  it('preserves one-off unit identity, currency and receivable payload', () => {
    expect(drawers).toContain("unitId: String(values.get('unitId') ?? '')");
    expect(drawers).toContain("conceptId ? { conceptId } : {}");
    expect(drawers).toContain("description: String(values.get('description') ?? '')");
    expect(drawers).toContain("amount: String(values.get('amount') ?? '')");
    expect(drawers).toContain("currencyCode: String(values.get('currencyCode') ?? '')");
    expect(drawers).toContain("issueDate: String(values.get('issueDate') ?? '')");
    expect(drawers).toContain("dueDate ? { dueDate } : {}");
    expect(drawers).toContain('`/v1/condominiums/${condominiumId}/receivables`');
    expect(drawers).toContain('<option key={unit.id} value={unit.id}>');
  });

  it('preserves extraordinary preview, UUID targeting and idempotent commit', () => {
    expect(drawers).toContain("distributionMethod: 'fixed_per_unit'");
    expect(drawers).toContain("fixedAmount: String(values.get('fixedAmount') ?? '')");
    expect(drawers).toContain('rows: activeUnits.map((unit) => ({ unitId: unit.id }))');
    expect(drawers).toContain('idempotencyKey: crypto.randomUUID()');
    expect(drawers).toContain('/charge-batches/preview`');
    expect(drawers).toContain('/charge-batches/commit`');
    expect(drawers).toContain('body: JSON.stringify(batchPreview.payload)');
    expect(drawers).toContain('Se aplicará una sola vez a cada unidad activa.');
    expect(drawers).toContain('No programa');
    expect(drawers).toContain('ciclos futuros ni sustituye Cuotas recurrentes.');
  });
});
