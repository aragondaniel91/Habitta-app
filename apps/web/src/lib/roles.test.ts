import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../navigation';
import {
  allowedRoutes,
  canAccessRoute,
  canManage,
  canManageGovernance,
  isTenantOnly,
  rolesForCondominium,
  type CondominiumRole,
} from './roles';

const keysFor = (roles: CondominiumRole[]) =>
  allowedRoutes(APP_ROUTES, roles).map((route) => route.key);

describe('role aware navigation', () => {
  it('keeps a resident inside the modules they act in', () => {
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

  it('lets the board read the oversight modules without administering them', () => {
    const keys = keysFor(['board_member']);

    expect(keys).toContain('expenses');
    expect(keys).toContain('reports');
    expect(keys).toContain('treasury');
    expect(keys).not.toContain('team');
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

  it('matches the database tenant-only read-only boundary', () => {
    expect(isTenantOnly(['tenant'])).toBe(true);
    expect(isTenantOnly([])).toBe(false);
    expect(isTenantOnly(['owner'])).toBe(false);
    expect(isTenantOnly(['owner', 'tenant'])).toBe(false);
    expect(isTenantOnly(['tenant', 'board_member'])).toBe(false);
  });
});
