import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const count = (value: string, needle: string) => value.split(needle).length - 1;

const budgets = source('./pages/BudgetsPage.tsx');
const budgetsCss = source('./budgets.css');
const parityMatrix = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-277 Budget shared form layout', () => {
  it('moves only period layout and editor actions to shared primitives', () => {
    expect(count(budgets, '<FormGrid columns={3}>')).toBe(1);
    expect(count(budgets, '<FormActions>')).toBe(1);
    expect(budgets).toContain('className="budgets-editor ux-form"');
    expect(budgets).not.toContain('budgets-editor__grid');
    expect(budgets).not.toContain('budgets-editor__footer');
    expect(budgets).toContain('className="budgets-editor-line"');
    expect(budgetsCss).not.toContain('.budgets-editor__grid');
    expect(budgetsCss).not.toContain('.budgets-editor__footer');
    expect(budgetsCss).toContain('.budgets-editor-line {');
  });

  it('preserves create and revision idempotency plus line financial payloads', () => {
    expect(budgets).toContain('requestId: crypto.randomUUID()');
    expect(budgets).toContain('categoryId: line.categoryId');
    expect(budgets).toContain('currencyCode: line.currencyCode');
    expect(budgets).toContain('amount: line.amount');
    expect(budgets).toContain('requestId: editor.requestId');
    expect(budgets).toContain('revisionNote: editor.revisionNote || undefined');
    expect(budgets).toContain('Number(line.amount) > 0');
  });

  it('preserves period validation, role-gated approval and reporting semantics', () => {
    expect(budgets).toContain('editor.endsOn >= editor.startsOn');
    expect(budgets).toContain("const canApprove = roles.includes('condominium_admin')");
    expect(budgets).toContain("action: 'submit' | 'approve'");
    expect(budgets).toContain('/actual-vs-budget`');
    expect(budgets).toContain('Nunca se consolidan monedas distintas.');
    expect(budgets).toContain('Sin conversión entre monedas.');
  });

  it('marks Budget forms compliant only after focused financial contracts exist', () => {
    expect(parityMatrix).toContain(
      '| Presupuestos | Editor de período y líneas financieras especializadas | compliant | Sí | Parcial | Sí | Sí |',
    );
  });
});
