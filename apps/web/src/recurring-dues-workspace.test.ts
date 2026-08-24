import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./pages/ReceivablesPage.tsx', import.meta.url), 'utf8');
const drawerSource = readFileSync(
  new URL('./pages/ReceivablesDrawersImpl.tsx', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('./features/receivables/RecurringDuesWorkspace.tsx', import.meta.url),
  'utf8',
);
const workspaceCss = readFileSync(new URL('./recurring-dues.css', import.meta.url), 'utf8');
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

  it('requires a visible review and in-app confirmation before ledger posting', () => {
    expect(workspaceSource).toContain('Preparar para revisión');
    expect(workspaceSource).toContain('Aprobar y publicar');
    expect(workspaceSource).toContain('onClick={() => setRunToPost(run)}');
    expect(workspaceSource).toContain('<ConfirmDialog');
    expect(workspaceSource).toContain(
      'Esto creará la deuda en cartera usando el reparto congelado',
    );
    expect(workspaceSource).toContain('el período quedará inmutable');
    expect(workspaceSource).toContain('onConfirm={() => void postRun(runToPost)}');
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

  it('uses the shared premium form contract for scope and plan drawers', () => {
    expect(workspaceSource).toContain('className="recurring-dues-form ux-form"');
    expect(workspaceSource).toContain('<FormGrid>');
    expect(workspaceSource).toContain('<FormGrid columns={3}>');
    expect(workspaceSource).toContain('<FormActions sticky>');
    expect(workspaceCss).not.toContain('recurring-dues-form-grid');
    expect(workspaceCss).not.toContain('recurring-dues-drawer-footer');
  });

  it('preserves recurring plan financial payload fields', () => {
    expect(workspaceSource).toContain('conceptId: planForm.conceptId');
    expect(workspaceSource).toContain('financialScopeId: planForm.financialScopeId');
    expect(workspaceSource).toContain('distribution: planForm.distribution');
    expect(workspaceSource).toContain('amount: planForm.amount');
    expect(workspaceSource).toContain('currencyCode: planForm.currencyCode.toUpperCase()');
    expect(workspaceSource).toContain('startsOn: planForm.startsOn');
    expect(workspaceSource).toContain('endsOn: planForm.endsOn');
    expect(workspaceSource).toContain('issueDay: Number(planForm.issueDay)');
    expect(workspaceSource).toContain('dueDay: Number(planForm.dueDay)');
    expect(workspaceSource).toContain('Crear el plan no publica deuda');
  });

  it('keeps a one-off charge bound to the selected unit UUID and existing payload', () => {
    expect(drawerSource).toContain('className="receivables-form ux-form"');
    expect(drawerSource).toContain("unitId: String(values.get('unitId') ?? '')");
    expect(drawerSource).toContain("description: String(values.get('description') ?? '')");
    expect(drawerSource).toContain("amount: String(values.get('amount') ?? '')");
    expect(drawerSource).toContain("currencyCode: String(values.get('currencyCode') ?? '')");
    expect(drawerSource).toContain("issueDate: String(values.get('issueDate') ?? '')");
    expect(drawerSource).toContain('`/v1/condominiums/${condominiumId}/receivables`');
    expect(drawerSource).toContain('<option key={unit.id} value={unit.id}>');
  });
});
