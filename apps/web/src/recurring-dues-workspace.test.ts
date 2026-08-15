import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./pages/ReceivablesPage.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(
  new URL('./features/receivables/RecurringDuesWorkspace.tsx', import.meta.url),
  'utf8',
);

describe('HAB-185 recurring dues workspace contract', () => {
  it('keeps recurring dues inside the existing receivables module', () => {
    expect(pageSource).toContain("import { RecurringDuesWorkspace } from '../features/receivables/RecurringDuesWorkspace'");
    expect(pageSource).toContain('<RecurringDuesWorkspace');
    expect(pageSource).toContain('Nueva cuota manual');
  });

  it('uses authenticated API routes rather than direct Supabase writes', () => {
    for (const route of [
      '/financial-scopes`',
      '/recurring-charge-plans`',
      '/recurring-charge-runs`',
      '/runs`',
      '/prepare`',
      '/post`',
    ]) {
      expect(workspaceSource).toContain(route);
    }
    expect(workspaceSource).not.toContain('/rest/v1/');
    expect(workspaceSource).not.toContain('supabase.from(');
  });

  it('makes financial scope and distribution semantics explicit to operators', () => {
    expect(workspaceSource).toContain('Todo el condominio');
    expect(workspaceSource).toContain('Un edificio');
    expect(workspaceSource).toContain('Grupo personalizado de unidades');
    expect(workspaceSource).toContain('Por alícuota / participación');
    expect(workspaceSource).toContain('Monto fijo por unidad');
    expect(workspaceSource).toContain('Presupuesto total por período');
  });

  it('requires a visible review step before ledger posting', () => {
    expect(workspaceSource).toContain('Preparar para revisión');
    expect(workspaceSource).toContain('Aprobar y publicar');
    expect(workspaceSource).toContain('Después de publicar, el período queda inmutable');
    expect(workspaceSource).toContain("run.status === 'pending_review'");
    expect(workspaceSource).toContain("run.status === 'posted'");
  });

  it('keeps a next period scheduled after a successful publication flow', () => {
    expect(workspaceSource).toContain('const nextPeriod = addMonth(run.period)');
    expect(workspaceSource).toContain("body: JSON.stringify({ period: nextPeriod })");
  });
});
