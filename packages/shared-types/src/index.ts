export const membershipRoles = [
  'administrator',
  'accountant',
  'assistant',
  'payment_reviewer',
  'board_member',
  'owner',
  'tenant',
] as const;

export type MembershipRole = (typeof membershipRoles)[number];

export interface TenantContext {
  organizationId: string;
  condominiumId: string;
  membershipId: string;
  role: MembershipRole;
}
