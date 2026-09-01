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
// through the markup. This workspace runs vitest in the node environment with no jsdom and no
// testing-library, so a rendered `ResidentDashboard` only ever produces its loading skeleton --
// the effect that loads the data never runs. A "renders no balance" assertion against that
// skeleton passes because nothing rendered at all, which is worse than no test. The DOM-level
// version of this needs a browser environment; see the PR body for what is and is not covered.

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
    // The negatives above only mean something if these hold: the surfaces still exist and are
    // withheld from two roles, rather than removed from the product.
    expect(canAccessResidentPayments(['owner'])).toBe(true);
    expect(canAccessResidentOperations(['owner'])).toBe(true);
    expect(canAccessResidentOperations(['tenant'])).toBe(true);
    expect(canAccessResidentPayments(['tenant'])).toBe(false);
    expect(canAccessResidentOperations(['condominium_admin', 'family_member'])).toBe(true);
    expect(canAccessResidentPayments(['owner', 'authorized_occupant'])).toBe(true);
  });

  it('gates every financial and operational region of the dashboard on those two rules', () => {
    // Each surface the review found rendering unconditionally, now behind its capability. The
    // balance card and the next-due card sit inside the financial region, so the whole region is
    // asserted rather than each heading.
    expect(dashboard).toContain('{showsFinancialContext ? (');
    expect(dashboard).toContain('aria-label="Tu acceso residencial"');
    expect(dashboard).toContain(
      "const requestsRoute = showsResidentOperations ? routeByKey('requests') : undefined",
    );
    expect(dashboard).toContain(
      "const governanceRoute = showsResidentOperations ? routeByKey('governance') : undefined",
    );
    expect(dashboard).toContain('{showsResidentOperations ? (');
  });

  it('never requests data the database would refuse', () => {
    // Not merely hidden. A request whose only possible answer is "no" is still a request, and a
    // rendered "Sin saldos pendientes" derived from an empty refusal states something false.
    expect(dashboard).toContain('financial(apiRequest<ReceivableSummary[]>');
    expect(dashboard).toContain('financial(apiRequest<DashboardReceivable[]>');
    expect(dashboard).toContain('communityOnly(apiRequest<ServiceRequestRecord[]>');
    expect(dashboard).toContain('communityOnly(apiRequest<GovernanceProposal[]>');
  });
});

describe('HAB-412 navigation for the restricted residential roles', () => {
  for (const role of ['family_member', 'authorized_occupant'] as CondominiumRole[]) {
    it(`gives a ${role} a non-empty set of routes`, () => {
      // The empty list was the dangerous case: App.tsx fell back to the current route, preserving
      // whatever forbidden deep link the person arrived on.
      const visible = allowedRoutes(APP_ROUTES, [role]);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.map((route) => route.key)).toContain('dashboard');
    });

    it(`refuses a ${role} every denied deep link`, () => {
      for (const key of ['payments', 'fees', 'governance', 'requests']) {
        const route = APP_ROUTES.find((candidate) => candidate.key === key)!;
        expect(canAccessRoute(route, [role])).toBe(false);
      }
    });

    it(`lets a ${role} reach the community surfaces it is allowed`, () => {
      for (const key of ['dashboard', 'community', 'documents', 'announcements']) {
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
