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

export const serviceRequestPriorities = ['low', 'normal', 'high', 'urgent'] as const;
export type ServiceRequestPriority = (typeof serviceRequestPriorities)[number];

export const serviceRequestStatuses = [
  'submitted',
  'acknowledged',
  'in_progress',
  'waiting_resident',
  'waiting_vendor',
  'resolved',
  'closed',
  'cancelled',
] as const;
export type ServiceRequestStatus = (typeof serviceRequestStatuses)[number];

export type ServiceRequestVisibility = 'public' | 'internal';
