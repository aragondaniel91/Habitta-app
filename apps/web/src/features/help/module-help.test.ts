import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../../navigation';
import { MODULE_HELP } from './module-help';

describe('contextual module help', () => {
  it('covers every application route', () => {
    expect(Object.keys(MODULE_HELP).sort()).toEqual(APP_ROUTES.map((route) => route.key).sort());
  });

  it('provides actionable guidance for every module', () => {
    APP_ROUTES.forEach((route) => {
      const help = MODULE_HELP[route.key];
      expect(help.purpose.length).toBeGreaterThan(20);
      expect(help.actions.length).toBeGreaterThanOrEqual(3);
      expect(help.steps.length).toBeGreaterThanOrEqual(3);
      expect(help.tips.length).toBeGreaterThanOrEqual(2);
      expect(help.permissions.length).toBeGreaterThan(10);
    });
  });

  it('limits guided imports to supported modules', () => {
    expect(MODULE_HELP.units.importKinds).toEqual(['units']);
    expect(MODULE_HELP.people.importKinds).toEqual(['people']);
    expect(MODULE_HELP.fees.importKinds).toEqual(['opening_balances']);
    expect(MODULE_HELP.payments.importKinds).toBeUndefined();
  });
});
