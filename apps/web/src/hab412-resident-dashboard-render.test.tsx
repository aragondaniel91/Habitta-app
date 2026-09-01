import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allowedRoutes,
  canAccessResidentOperations,
  canAccessResidentPayments,
  canAccessRoute,
  type CondominiumRole,
} from './lib/roles';
import { APP_ROUTES } from './navigation';

// HAB-412: what each persona is allowed to see, and what the dashboard therefore renders.
//
// The rules that decide this are pure functions, so they are tested as functions rather than
// through the markup. Browser-level behavior is covered by the authenticated financial E2E fixture.

const dashboard = readFileSync(new URL('./pages/ResidentDashboard.tsx', import.meta.url), 'utf8');
const restricted: CondominiumRole[][] = [
  ['family_member'],
  ['authorized_occupant'],
  ['family_member', 'authorized_occupant'],
];

describe('HAB-412 what a restricted resident may see', () => {
  it('denies every financial and operational surface to both roles, together or apart', () => {
    for (const roles of restricted) {
      expect(canAccessResidentPayments(roles)).toBe(false);
      expect(canAccessResidentOperations(roles)).toBe(false);
    }
  });

  it('keeps owner, tenant and staff exactly as they were', () => {
    expect(canAccessResidentPayments(['owner'])).toBe(true);
    expect(canAccessResidentOperations(['owner'])).toBe(true);
    expect(canAccessResidentOperations(['tenant'])).toBe(true);
    expect(canAccessResidentPayments(['tenant'])).toBe(false);
    expect(canAccessResidentOperations(['condominium_admin', 'family_member'])).toBe(true);
    expect(canAccessResidentPayments(['owner', 'authorized_occupant'])).toBe(true);
  });

  it('gates every financial and operational region of the dashboard on those two rules', () => {
    expect(dashboard).toContain('{showsFinancialContext ? (');
    expect(dashboard).toContain('aria-label="Tu acceso residencial"');
    expect(dashboard).toContain(
      "const feesRoute = showsFinancialContext ? routeByKey('fees') : undefined",
    );
    expect(dashboard).toContain(
      "const requestsRoute = showsResidentOperations ? routeByKey('requests') : undefined",
    );
    expect(dashboard).toContain(
      "const governanceRoute = showsResidentOperations ? routeByKey('governance') : undefined",
    );
    expect(dashboard).toContain('{showsResidentOperations ? (');
  });

  it('does not create denied requests before the capability check', () => {
    // Passing apiRequest(...) directly into a gate is too late: function arguments are evaluated
    // first, which starts fetch even if the gate then returns an empty promise. The gate therefore
    // accepts a factory and invokes it only after authorization succeeds.
    expect(dashboard).toContain('const financial = <T,>(request: () => Promise<T[]>) =>');
    expect(dashboard).toContain('showsFinancialContext ? request() : Promise.resolve([] as T[])');
    expect(dashboard).toContain('const communityOnly = <T,>(request: () => Promise<T[]>) =>');
    expect(dashboard).toContain('showsResidentOperations ? request() : Promise.resolve([] as T[])');
    expect(dashboard).toContain('financial(() => apiRequest<ReceivableSummary[]>');
    expect(dashboard).toContain('financial(() => apiRequest<DashboardReceivable[]>');
    expect(dashboard).toContain('communityOnly(() => apiRequest<ServiceRequestRecord[]>');
    expect(dashboard).toContain('communityOnly(() =>');
    expect(dashboard).not.toContain('financial(apiRequest<');
    expect(dashboard).not.toContain('communityOnly(apiRequest<');
  });
});

describe('HAB-412 the dashboard obeys the rules of hooks', () => {
  it('declares every hook before the early returns', () => {
    // A `useMemo` below `if (loading && !data) return ...` runs on the loaded render and not on the
    // loading one, so React tears the page down with "Rendered more hooks than during the previous
    // render" the instant the data arrives. That shipped, and no unit test could see it: this suite
    // renders no DOM, so nothing here ever reaches a second render. The authenticated browser spec
    // caught it, and this keeps the ordering honest between runs of that much slower gate.
    const firstEarlyReturn = dashboard.indexOf('if (loading && !data) return');
    expect(firstEarlyReturn).toBeGreaterThan(0);

    const afterReturns = dashboard.slice(firstEarlyReturn);
    for (const hook of ['useMemo(', 'useState(', 'useEffect(', 'useCallback(']) {
      expect(afterReturns).not.toContain(hook);
    }
  });
});

describe('HAB-412 navigation for the restricted residential roles', () => {
  for (const role of ['family_member', 'authorized_occupant'] as CondominiumRole[]) {
    it(`gives a ${role} a non-empty set of routes`, () => {
      const visible = allowedRoutes(APP_ROUTES, [role]);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.map((route) => route.key)).toContain('dashboard');
    });

    it(`refuses a ${role} every denied deep link`, () => {
      for (const key of ['payments', 'fees', 'governance', 'requests', 'community']) {
        const route = APP_ROUTES.find((candidate) => candidate.key === key)!;
        expect(canAccessRoute(route, [role])).toBe(false);
      }
    });

    it(`lets a ${role} reach only the resident-safe community surfaces`, () => {
      for (const key of ['dashboard', 'documents', 'announcements']) {
        const route = APP_ROUTES.find((candidate) => candidate.key === key)!;
        expect(canAccessRoute(route, [role])).toBe(true);
      }
    });
  }

  it('resolves a forbidden deep link to an allowed route rather than keeping it', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('const safeFallback =');
    expect(app).toContain("APP_ROUTES.find((route) => route.key === 'dashboard')");
    expect(app).not.toContain('(visibleRoutes[0] ?? currentRoute)');
  });

  it('still routes an administrator who is also family to the administrative modules', () => {
    const payments = APP_ROUTES.find((candidate) => candidate.key === 'payments')!;
    expect(canAccessRoute(payments, ['condominium_admin', 'family_member'])).toBe(true);
    expect(canAccessRoute(payments, ['accountant', 'authorized_occupant'])).toBe(true);
  });
});
