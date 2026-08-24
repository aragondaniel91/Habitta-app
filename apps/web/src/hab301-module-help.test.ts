import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './features/help/module-help';
import { APP_ROUTES } from './navigation';

describe('HAB-301 contextual help coverage', () => {
  it('covers every application route with a complete foolproof guide', () => {
    for (const route of APP_ROUTES) {
      const help = MODULE_HELP[route.key];
      expect(help, route.key).toBeDefined();
      expect(help.purpose.length, `${route.key}: purpose`).toBeGreaterThan(40);
      expect(help.actions.length, `${route.key}: actions`).toBeGreaterThanOrEqual(3);
      expect(help.steps.length, `${route.key}: steps`).toBeGreaterThanOrEqual(5);
      expect(help.beforeConfirm.length, `${route.key}: beforeConfirm`).toBeGreaterThanOrEqual(2);
      expect(help.result.length, `${route.key}: result`).toBeGreaterThanOrEqual(2);
      expect(help.tips.length, `${route.key}: tips`).toBeGreaterThanOrEqual(2);
      expect(help.permissions.length, `${route.key}: permissions`).toBeGreaterThan(30);
    }
  });

  it('uses actual critical action labels instead of generic directions', () => {
    expect(MODULE_HELP.dashboard.steps.join(' ')).toContain('Actualizar datos');
    expect(MODULE_HELP.units.steps.join(' ')).toContain('Nueva casa');
    expect(MODULE_HELP.people.steps.join(' ')).toContain('Vincular unidad');
    expect(MODULE_HELP.maintenance.steps.join(' ')).toContain('Finanzas y evidencias');
    expect(MODULE_HELP.fees.steps.join(' ')).toContain('Nueva cuota');
    expect(MODULE_HELP.payments.steps.join(' ')).toContain('Registrar pago');
    expect(MODULE_HELP.treasury.steps.join(' ')).toContain('Registrar movimiento');
    expect(MODULE_HELP.expenses.steps.join(' ')).toContain('Registrar gasto');
    expect(MODULE_HELP.budgets.steps.join(' ')).toContain('Enviar a aprobación');
    expect(MODULE_HELP.reports.steps.join(' ')).toContain('Exportar CSV');
    expect(MODULE_HELP.community.steps.join(' ')).toContain('Completar directorio');
    expect(MODULE_HELP.documents.steps.join(' ')).toContain('Nuevo documento');
    expect(MODULE_HELP.governance.steps.join(' ')).toContain('Crear propuesta');
    expect(MODULE_HELP.requests.steps.join(' ')).toContain('Nueva solicitud');
    expect(MODULE_HELP.announcements.steps.join(' ')).toContain('Nuevo anuncio');
    expect(MODULE_HELP.team.steps.join(' ')).toContain('Crear y enviar invitación');
    expect(MODULE_HELP.audit.steps.join(' ')).toContain('Aplicar filtros');
    expect(MODULE_HELP.settings.steps.join(' ')).toContain('Guardar cambios');
  });

  it('does not force building terminology onto house communities', () => {
    const unitGuide = [
      MODULE_HELP.units.purpose,
      ...MODULE_HELP.units.steps,
      ...MODULE_HELP.units.beforeConfirm,
    ].join(' ');
    expect(unitGuide).toContain('comunidad de casas');
    expect(unitGuide).toContain('no necesitas crear torres');
    expect(unitGuide).not.toContain('Crea primero las torres o edificios');

    const announcementGuide = MODULE_HELP.announcements.steps.join(' ');
    expect(announcementGuide).toContain('comunidad de casas');
    expect(announcementGuide).toContain('no debe aparecer una audiencia de edificio');
  });

  it('keeps financial semantics explicit in help content', () => {
    expect(MODULE_HELP.fees.beforeConfirm.join(' ')).toContain('moneda');
    expect(MODULE_HELP.payments.beforeConfirm.join(' ')).toContain('moneda');
    expect(MODULE_HELP.treasury.beforeConfirm.join(' ')).toContain('moneda');
    expect(MODULE_HELP.expenses.beforeConfirm.join(' ')).toContain('moneda');
    expect(MODULE_HELP.budgets.beforeConfirm.join(' ')).toContain('moneda');
    expect(MODULE_HELP.reports.beforeConfirm.join(' ')).toContain('moneda');
    expect(MODULE_HELP.reports.tips.join(' ')).toContain('simulados');
  });

  it('keeps imports attached only to supported administrative domains', () => {
    expect(MODULE_HELP.units.importKinds).toEqual(['units']);
    expect(MODULE_HELP.people.importKinds).toEqual(['people']);
    expect(MODULE_HELP.fees.importKinds).toEqual(['opening_balances']);
    const routesWithoutImport = APP_ROUTES.filter(
      (route) => !['units', 'people', 'fees'].includes(route.key),
    );
    for (const route of routesWithoutImport) expect(MODULE_HELP[route.key].importKinds).toBeUndefined();
  });
});
