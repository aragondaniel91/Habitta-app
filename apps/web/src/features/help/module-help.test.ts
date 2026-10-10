import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../../navigation';
import { MODULE_HELP, MODULE_HELP_CONTENT_VERSION } from './module-help';

describe('contextual module help', () => {
  it('covers every application route', () => {
    expect(Object.keys(MODULE_HELP).sort()).toEqual(APP_ROUTES.map((route) => route.key).sort());
  });

  it('assigns each route one stable canonical topic and the current content version', () => {
    const topicIds = APP_ROUTES.map((route) => {
      const help = MODULE_HELP[route.key];
      expect(help.topicId, `${route.key}: topicId`).toBe(`module-help.${route.key}`);
      expect(help.contentVersion, `${route.key}: contentVersion`).toBe(MODULE_HELP_CONTENT_VERSION);
      return help.topicId;
    });

    expect(new Set(topicIds).size).toBe(APP_ROUTES.length);
  });

  it('provides actionable guidance for every module', () => {
    APP_ROUTES.forEach((route) => {
      const help = MODULE_HELP[route.key];
      expect(help.purpose.trim()).not.toBe('');
      expect(help.purpose.length).toBeGreaterThan(20);
      expect(help.actions.length).toBeGreaterThanOrEqual(3);
      expect(help.steps.length).toBeGreaterThanOrEqual(3);
      expect(help.beforeConfirm.length).toBeGreaterThanOrEqual(2);
      expect(help.result.length).toBeGreaterThanOrEqual(2);
      expect(help.tips.length).toBeGreaterThanOrEqual(2);
      expect(help.actions.every((item) => item.trim().length > 0)).toBe(true);
      expect(help.steps.every((item) => item.trim().length > 0)).toBe(true);
      expect(help.beforeConfirm.every((item) => item.trim().length > 0)).toBe(true);
      expect(help.result.every((item) => item.trim().length > 0)).toBe(true);
      expect(help.tips.every((item) => item.trim().length > 0)).toBe(true);
      expect(help.permissions.length).toBeGreaterThan(10);
    });
  });

  it('limits guided imports to supported modules', () => {
    expect(MODULE_HELP.units.importKinds).toEqual(['units']);
    expect(MODULE_HELP.people.importKinds).toEqual(['people']);
    expect(MODULE_HELP.fees.importKinds).toEqual(['opening_balances']);
    expect(MODULE_HELP.payments.importKinds).toBeUndefined();
  });

  it('describes the separate vendor directory workflow for expenses', () => {
    const expensesHelp = [
      ...MODULE_HELP.expenses.actions,
      ...MODULE_HELP.expenses.steps,
      ...(MODULE_HELP.expenses.troubleshooting ?? []),
    ].join(' ');

    expect(expensesHelp).toContain('Directorio de proveedores');
    expect(expensesHelp).toContain('Nuevo proveedor');
    expect(expensesHelp).toContain('Editar');
    expect(expensesHelp).toContain('Archivar');
    expect(expensesHelp).toContain('Reactivar');
    expect(expensesHelp).toContain('gastos históricos permanecen vinculados');
    expect(expensesHelp).not.toContain('Categorías y proveedores');
  });
});
