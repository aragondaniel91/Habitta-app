import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const workspace = source('./features/receivables/RecurringDuesWorkspace.tsx');
const migration = source(
  '../../../supabase/migrations/20260826020000_hab359_deactivate_recurring_plan.sql',
);

describe('HAB-359 stop a recurring dues plan without deleting history', () => {
  it('keeps stopped plans visible instead of hiding them', () => {
    expect(workspace).toContain('const visiblePlans');
    expect(workspace).toContain('{visiblePlans.map((plan)');
    expect(workspace).toContain("const stopped = plan.status !== 'active'");
    expect(workspace).toContain("{stopped ? 'Detenida' : 'Activo'}");
  });

  it('offers the transition that matches the current state', () => {
    expect(workspace).toContain('setPlanStatus(plan, true)');
    expect(workspace).toContain('setPlanToStop(plan)');
    expect(workspace).toContain('Reactivar');
    expect(workspace).toContain('Detener');
  });

  it('routes the transition through the guarded endpoint', () => {
    expect(workspace).toContain(
      '`/v1/condominiums/${condominiumId}/recurring-charge-plans/${plan.id}/status`',
    );
    expect(workspace).toContain("method: 'PATCH', body: JSON.stringify({ isActive })");
    expect(workspace).not.toMatch(/method:\s*'DELETE'/);
  });

  it('confirms before stopping because scheduled periods are cancelled', () => {
    expect(workspace).toContain('<ConfirmDialog');
    expect(workspace).toContain('Detener cuota ordinaria');
    expect(workspace).toContain('Los períodos ya publicados conservan sus cargos, recibos y');
    expect(workspace).toContain('se cancelan junto con la');
    expect(workspace).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('blocks stopping while a period is pending review', () => {
    expect(workspace).toContain('disabled={hasPendingReview || busyId === `status:${plan.id}`}');
    expect(workspace).toContain('Primero resuelve la cuota pendiente de revisión.');
  });

  it('never lets a stopped plan schedule or be edited by mistake', () => {
    expect(workspace).toContain('disabled={hasPendingReview || stopped}');
    expect(workspace).toContain('Reactiva la cuota para poder editar su configuración.');
    expect(workspace).toContain('{stopped ? null : (');
  });

  it('protects published periods in the database, not only in the UI', () => {
    expect(migration).toContain('recurring plan has pending review run');
    expect(migration).toContain("status = 'cancelled'");
    expect(migration).toContain("and status = 'scheduled'");
    expect(migration).not.toMatch(/delete\s+from\s+public\.(recurring_charge_runs|receivable_)/i);
    expect(migration).not.toMatch(/update\s+public\.receivable_/i);
  });
});
