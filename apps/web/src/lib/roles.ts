import { createContext, useContext } from 'react';
import type { AppRoute } from '../navigation';

// Mirrors public.condominium_role. The database is still the authority: RLS rejects anything a
// role may not touch. This only decides what the interface offers, so nobody is handed a button
// that is going to fail.
export type CondominiumRole =
  | 'condominium_admin'
  | 'accountant'
  | 'assistant'
  | 'payment_reviewer'
  | 'board_member'
  | 'owner'
  | 'tenant';

export type Membership = { condominium_id: string; role: CondominiumRole };
export type OrganizationMembership = { organization_id: string; role: string };

export type MembershipResponse = {
  condominiums: Membership[];
  organizations: OrganizationMembership[];
};

export const RESIDENT_ROLES: CondominiumRole[] = ['owner', 'tenant'];

export function rolesForCondominium(
  memberships: Membership[],
  condominiumId: string,
): CondominiumRole[] {
  return memberships
    .filter((membership) => membership.condominium_id === condominiumId)
    .map((membership) => membership.role);
}

export function canAccessRoute(route: AppRoute, roles: CondominiumRole[]) {
  if (!roles.length) return false;
  return roles.some((role) => route.roles.includes(role));
}

export function allowedRoutes(routes: readonly AppRoute[], roles: CondominiumRole[]) {
  return routes.filter((route) => canAccessRoute(route, roles));
}

/** True when the caller may run the administrative side of a module, not just read it. */
export function canManage(roles: CondominiumRole[]) {
  return roles.some((role) => role === 'condominium_admin' || role === 'accountant');
}

/** Residents act on their own authorized data; the database still decides which rows are visible. */
export function isResident(roles: CondominiumRole[]) {
  return roles.some((role) => RESIDENT_ROLES.includes(role));
}

/** Use the simpler resident home only when every role in this condominium is residential. */
export function usesResidentDashboard(roles: CondominiumRole[]) {
  return roles.length > 0 && roles.every((role) => RESIDENT_ROLES.includes(role));
}

/** Mirrors the pilot database guard: tenant-only memberships are operationally read-only. */
export function isTenantOnly(roles: CondominiumRole[]) {
  return roles.length > 0 && roles.every((role) => role === 'tenant');
}

/** Governance is run by the board as well as the administration. */
export function canManageGovernance(roles: CondominiumRole[]) {
  return canManage(roles) || roles.includes('board_member');
}

const RolesContext = createContext<CondominiumRole[]>([]);

export const RolesProvider = RolesContext.Provider;

/** Roles the signed-in user holds in the condominium currently selected. */
export function useCondominiumRoles() {
  return useContext(RolesContext);
}
