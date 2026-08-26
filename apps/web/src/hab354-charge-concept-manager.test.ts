import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const manager = source('./features/receivables/ChargeConceptManagerDrawer.tsx');
const wrapper = source('./pages/ReceivablesDrawers.tsx');
const receivables = source('./lib/receivables.ts');
const migration = source('../../../supabase/migrations/20260826001000_hab354_charge_concept_edit.sql');

describe('HAB-354 charge concept lifecycle contract', () => {
  it('routes the concept workflow to a reusable catalog with visible editing', () => {
    expect(wrapper).toContain("if (mode === 'concept')");
    expect(wrapper).toContain('<ChargeConceptManagerDrawer');
    expect(manager).toContain('title="Conceptos de cobro"');
    expect(manager).toContain('Nuevo concepto');
    expect(manager).toContain('Editar');
    expect(manager).toContain("setView('edit')");
  });

  it('supports create and tenant-scoped patch without inventing a second API contract', () => {
    expect(manager).toContain("method: 'POST'");
    expect(manager).toContain("method: 'PATCH'");
    expect(manager).toContain('/charge-concepts/${selectedConcept.id}`');
    expect(manager).toContain("editing ? 'Guardar cambios' : 'Crear concepto'");
    expect(manager).toContain('await onRefresh()');
  });

  it('prefills editing safely when PostgREST returns numeric defaults as JSON numbers', () => {
    expect(receivables).toContain('default_amount?: string | number;');
    expect(manager).toContain("const amountValue = (value: string | number | undefined)");
    expect(manager).toContain('defaultValue={amountValue(concept?.default_amount)}');
    expect(manager).toContain("defaultValue={concept?.default_currency_code ?? ''}");
  });

  it('explains prospective defaults and protects historical semantic fields in the database', () => {
    expect(manager).toContain('aplican hacia adelante');
    expect(manager).toContain('Solo afecta operaciones futuras');
    expect(migration).toContain('historical charge concept semantics are immutable');
    expect(migration).toContain('charge concept tenant is immutable');
    expect(migration).toContain('active recurring plan requires concept');
    expect(migration).toContain('before update on public.charge_concepts');
  });

  it('does not add destructive deletion or browser-native confirmation shortcuts', () => {
    expect(manager).not.toContain("method: 'DELETE'");
    expect(manager).not.toContain('window.alert');
    expect(manager).not.toContain('window.confirm');
    expect(manager).not.toContain('window.prompt');
  });
});
