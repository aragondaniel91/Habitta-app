import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./pages/ReceivablesPage.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(
  new URL('./features/receivables/RecurringDuesWorkspace.tsx', import.meta.url),
  'utf8',
);
const chooserSource = readFileSync(
  new URL('./features/receivables/ChargeCreationChooser.tsx', import.meta.url),
  'utf8',
);
const rollForwardSource = readFileSync(
  new URL(
    '../../../supabase/migrations/20260815213500_hab185_recurring_roll_forward.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('HAB-185 recurring dues workspace contract', () => {
  it('keeps recurring dues inside the existing receivables module', () => {
    expect(pageSource).toContain(
      "import { RecurringDuesWorkspace } from '../features/receivables/RecurringDuesWorkspace'",
    );
    expect(pageSource).toContain('<RecurringDuesWorkspace');
    expect(pageSource).toContain('<ChargeCreationChooser');
  });

  it('routes Nueva cuota by operator intent instead of accounting primitives', () => {
    expect(pageSource).toContain('Nueva cuota');
    expect(chooserSource).toContain('Ordinaria recurrente');
    expect(chooserSource).toContain('Extraordinaria');
    expect(chooserSource).toContain('Cargo puntual');
    expect(pageSource).toContain("openDrawer('batch')");
    expect(pageSource).toContain("openDrawer('manual')");
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

  it('schedules the first and following periods server-side without posting money', () => {
    expect(rollForwardSource).toContain('recurring_plan_schedule_initial_run');
    expect(rollForwardSource).toContain('recurring_run_schedule_next_period');
    expect(rollForwardSource).toContain("new.status <> 'posted'");
    expect(rollForwardSource).toContain("'scheduled'");
    expect(rollForwardSource).not.toContain('post_charge_batch');
  });
});
