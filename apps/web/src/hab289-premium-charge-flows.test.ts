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
    for (const contract of [
      'conceptId: planForm.conceptId',
      'financialScopeId: planForm.financialScopeId',
      'distribution: planForm.distribution',
      'amount: planForm.amount',
      'currencyCode: planForm.currencyCode.toUpperCase()',
      'startsOn: planForm.startsOn',
      'endsOn: planForm.endsOn',
      'issueDay: Number(planForm.issueDay)',
      'dueDay: Number(planForm.dueDay)',
      '/recurring-charge-plans`',
      '/prepare`',
      '/post`',
      'Crear el plan no publica deuda',
      'Esto creará la deuda en cartera usando el reparto congelado',
    ]) {
      expect(recurring).toContain(contract);
    }
  });

  it('moves one-off and extraordinary forms onto shared premium layout', () => {
    expect(drawers).toContain("import { FormActions, FormGrid } from '../components/FormLayout'");
    expect(count(drawers, 'className="receivables-form ux-form"')).toBe(2);
    expect(count(drawers, '<FormGrid>')).toBe(4);
    expect(count(drawers, '<FormActions>')).toBe(3);
    expect(count(drawers, 'className="input"')).toBe(8);
  });

  it('preserves one-off unit identity, currency and receivable payload', () => {
    for (const contract of [
      "unitId: String(values.get('unitId') ?? '')",
      "conceptId ? { conceptId } : {}",
      "description: String(values.get('description') ?? '')",
      "amount: String(values.get('amount') ?? '')",
      "currencyCode: String(values.get('currencyCode') ?? '')",
      "issueDate: String(values.get('issueDate') ?? '')",
      "dueDate ? { dueDate } : {}",
      '`/v1/condominiums/${condominiumId}/receivables`',
      '<option key={unit.id} value={unit.id}>',
    ]) {
      expect(drawers).toContain(contract);
    }
  });

  it('preserves extraordinary preview, UUID targeting and idempotent commit', () => {
    for (const contract of [
      "distributionMethod: 'fixed_per_unit'",
      "fixedAmount: String(values.get('fixedAmount') ?? '')",
      'rows: activeUnits.map((unit) => ({ unitId: unit.id }))',
      'idempotencyKey: crypto.randomUUID()',
      '/charge-batches/preview`',
      '/charge-batches/commit`',
      'body: JSON.stringify(batchPreview.payload)',
      'Se aplicará una sola vez a cada unidad activa.',
      'No programa',
      'ciclos futuros ni sustituye Cuotas recurrentes.',
    ]) {
      expect(drawers).toContain(contract);
    }
  });
});
