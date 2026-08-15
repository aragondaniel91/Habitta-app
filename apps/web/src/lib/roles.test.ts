import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../navigation';
import {
  allowedRoutes,
  canAccessRoute,
  canManage,
  canManageGovernance,
  isTenantOnly,
  rolesForCondominium,
  usesResidentDashboard,
  type CondominiumRole,
} from './roles';

const keysFor = (roles: CondominiumRole[]) =>
  allowedRoutes(APP_ROUTES, roles).map((route) => route.key);

describe('role aware navigation', () => {
  it('keeps an owner inside the resident modules they act in', () => {
    const keys = keysFor(['owner']);

    expect(keys).toEqual([
      'dashboard',
      'fees',
      'payments',
      'community',
      'governance',
      'requests',
      'announcements',
      'settings',
    ]);
  });

  it('keeps tenant-only navigation aligned with the pilot read-only RLS boundary', () => {
    const keys = keysFor(['tenant']);
    const payments = APP_ROUTES.find((route) => route.key === 'payments');

    expect(keys).toEqual([
      'dashboard',
      'fees',
      'community',
      'governance',
      'requests',
      'announcements',
      'settings',
    ]);
    expect(canAccessRoute(payments!, ['tenant'])).toBe(false);
    expect(canAccessRoute(payments!, ['owner', 'tenant'])).toBe(true);
  });

  it('keeps tenant pilot access readable while blocking write-oriented payment navigation', () => {
    const dashboard = APP_ROUTES.find((route) => route.key === 'dashboard');
    const fees = APP_ROUTES.find((route) => route.key === 'fees');
    const governance = APP_ROUTES.find((route) => route.key === 'governance');
    const payments = APP_ROUTES.find((route) => route.key === 'payments');

    expect(canAccessRoute(dashboard!, ['tenant'])).toBe(true);
    expect(canAccessRoute(fees!, ['tenant'])).toBe(true);
    expect(canAccessRoute(governance!, ['tenant'])).toBe(true);
    expect(canAccessRoute(payments!, ['tenant'])).toBe(false);
    expect(usesResidentDashboard(['tenant'])).toBe(true);
    expect(isTenantOnly(['tenant'])).toBe(true);
  });

  it('never offers a resident an administrative module', () => {
    for (const role of ['owner', 'tenant'] as CondominiumRole[]) {
      const keys = keysFor([role]);
      for (const forbidden of [
        'expenses',
        'reports',
        'treasury',
        'units',
        'people',
        'maintenance',
        'team',
        'audit',
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it('gives the condominium administrator every module', () => {
    expect(keysFor(['condominium_admin'])).toHaveLength(APP_ROUTES.length);
  });

  it('reserves team administration for the condominium administrator', () => {
    const team = APP_ROUTES.find((route) => route.key === 'team');

    expect(team?.roles).toEqual(['condominium_admin']);
    expect(canAccessRoute(team!, ['accountant'])).toBe(false);
    expect(canAccessRoute(team!, ['board_member'])).toBe(false);
    expect(canAccessRoute(team!, ['owner'])).toBe(false);
  });

  it('reserves the administrator audit log for the condominium administrator', () => {
    const audit = APP_ROUTES.find((route) => route.key === 'audit');

    expect(audit?.roles).toEqual(['condominium_admin']);
    expect(canAccessRoute(audit!, ['accountant'])).toBe(false);
    expect(canAccessRoute(audit!, ['board_member'])).toBe(false);
    expect(canAccessRoute(audit!, ['owner'])).toBe(false);
    expect(canAccessRoute(audit!, ['tenant'])).toBe(false);
  });

  it('lets the board read the oversight modules without administering them', () => {
    const keys = keysFor(['board_member']);

    expect(keys).toContain('expenses');
    expect(keys).toContain('reports');
    expect(keys).toContain('treasury');
    expect(keys).not.toContain('team');
    expect(keys).not.toContain('audit');
    expect(canManage(['board_member'])).toBe(false);
    expect(canManageGovernance(['board_member'])).toBe(true);
  });

  it('grants nothing when the user holds no membership in the condominium', () => {
    expect(keysFor([])).toEqual([]);
    expect(canAccessRoute(APP_ROUTES[0], [])).toBe(false);
  });

  it('reads only the roles belonging to the selected condominium', () => {
    const memberships = [
      { condominium_id: 'a', role: 'condominium_admin' as const },
      { condominium_id: 'b', role: 'owner' as const },
    ];

    expect(rolesForCondominium(memberships, 'a')).toEqual(['condominium_admin']);
    expect(rolesForCondominium(memberships, 'b')).toEqual(['owner']);
    expect(rolesForCondominium(memberships, 'c')).toEqual([]);
  });

  it('separates managing a module from merely opening it', () => {
    expect(canManage(['condominium_admin'])).toBe(true);
    expect(canManage(['accountant'])).toBe(true);
    expect(canManage(['owner'])).toBe(false);
    expect(canManage(['tenant'])).toBe(false);
    expect(canManage(['payment_reviewer'])).toBe(false);
  });

  it('routes owner and tenant memberships to the resident dashboard without downgrading staff', () => {
    expect(usesResidentDashboard(['owner'])).toBe(true);
    expect(usesResidentDashboard(['tenant'])).toBe(true);
    expect(usesResidentDashboard(['owner', 'tenant'])).toBe(true);
    expect(usesResidentDashboard(['condominium_admin'])).toBe(false);
    expect(usesResidentDashboard(['condominium_admin', 'owner'])).toBe(false);
    expect(usesResidentDashboard(['board_member', 'tenant'])).toBe(false);
    expect(usesResidentDashboard([])).toBe(false);
  });

  it('matches the database tenant-only read-only boundary', () => {
    expect(isTenantOnly(['tenant'])).toBe(true);
    expect(isTenantOnly([])).toBe(false);
    expect(isTenantOnly(['owner'])).toBe(false);
    expect(isTenantOnly(['owner', 'tenant'])).toBe(false);
    expect(isTenantOnly(['tenant', 'board_member'])).toBe(false);
  });
});
