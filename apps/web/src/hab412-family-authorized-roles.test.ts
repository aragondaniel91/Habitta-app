import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canAccessResidentPayments,
  canAccessRoute,
  isTenantOnly,
  usesResidentDashboard,
  type CondominiumRole,
} from './lib/roles';
import { APP_ROUTES } from './navigation';

const payments = APP_ROUTES.find((route) => route.key === 'payments')!;
const dashboard = readFileSync(new URL('./pages/ResidentDashboard.tsx', import.meta.url), 'utf8');

describe('HAB-412 family members and authorized occupants', () => {
  it('sends both to the resident experience', () => {
    expect(usesResidentDashboard(['family_member'])).toBe(true);
    expect(usesResidentDashboard(['authorized_occupant'])).toBe(true);
    expect(usesResidentDashboard(['family_member', 'authorized_occupant'])).toBe(true);
  });

  it('keeps a session administrative when it also holds a staff role', () => {
    // A residential role must never demote a legitimate staff session to the resident UI.
    for (const staff of ['condominium_admin', 'accountant', 'board_member'] as CondominiumRole[]) {
      expect(usesResidentDashboard([staff, 'family_member'])).toBe(false);
      expect(usesResidentDashboard([staff, 'authorized_occupant'])).toBe(false);
    }
    expect(usesResidentDashboard(['owner', 'condominium_admin'])).toBe(false);
  });

  it('hides payments from every restricted residential role', () => {
    // The database refuses payment access to all three the same way. Gating on `isTenantOnly`
    // would have admitted the two new ones, since neither of them is a tenant.
    expect(canAccessResidentPayments(['family_member'])).toBe(false);
    expect(canAccessResidentPayments(['authorized_occupant'])).toBe(false);
    expect(canAccessResidentPayments(['family_member', 'authorized_occupant'])).toBe(false);
    expect(canAccessResidentPayments(['tenant', 'family_member'])).toBe(false);
    expect(canAccessRoute(payments, ['family_member'])).toBe(false);
    expect(canAccessRoute(payments, ['authorized_occupant'])).toBe(false);
  });

  it('leaves owner and staff payment access exactly as it was', () => {
    expect(canAccessResidentPayments(['owner'])).toBe(true);
    expect(canAccessResidentPayments(['owner', 'family_member'])).toBe(true);
    expect(canAccessResidentPayments(['condominium_admin', 'family_member'])).toBe(true);
    expect(canAccessRoute(payments, ['owner'])).toBe(true);
    expect(canAccessResidentPayments(['tenant'])).toBe(false);
    expect(isTenantOnly(['tenant'])).toBe(true);
  });

  it('never asks the backend for balances it would refuse', () => {
    // Not merely hidden: the request is not made. A CTA that leads to a 403 is worse than no CTA.
    expect(dashboard).toContain('const showsFinancialContext = canAccessResidentPayments(roles)');
    expect(dashboard).toContain('const paymentsRequest = !showsFinancialContext');
    expect(dashboard).toContain('showsFinancialContext ? routeByKey(');
  });

  it('names the residential standing without inventing one', () => {
    expect(dashboard).toContain("'Familiar'");
    expect(dashboard).toContain("'Ocupante autorizado'");
    // Owner first: someone who owns and is also family is an owner, because that standing carries
    // the capability.
    expect(dashboard.indexOf("'Propietario'")).toBeLessThan(dashboard.indexOf("'Familiar'"));
  });
});
