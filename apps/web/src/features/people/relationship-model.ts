import type {
  Building,
  CondominiumRelationshipType,
  Occupancy,
  Ownership,
  Person,
  Unit,
  UnitContext,
} from './types';

export const condominiumRelationshipLabels: Record<CondominiumRelationshipType, string> = {
  board_member: 'Junta de condominio',
  administrator_contact: 'Contacto de administración',
  representative: 'Representante legal',
  emergency_contact: 'Contacto de emergencia',
  other: 'Otra relación',
};

export const occupancyLabels: Record<Occupancy['occupancy_type'], string> = {
  owner_occupant: 'Propietario ocupante',
  tenant: 'Inquilino',
  family_member: 'Familiar',
  authorized_occupant: 'Ocupante autorizado',
};

export type ResidentAccessRole = 'owner' | 'tenant' | 'family_member' | 'authorized_occupant';
export type ResidentInvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export const residentInvitationStatusLabels: Record<ResidentInvitationStatus, string> = {
  pending: 'Pendiente de aceptación',
  accepted: 'Aceptada',
  expired: 'Vencida',
  revoked: 'Revocada',
};

export type ResidentAccessOption = {
  role: ResidentAccessRole;
  unitId: string;
  unitLabel: string;
  relationshipId: string;
};

export function unitContextLabel(unit: Pick<UnitContext, 'code' | 'buildings'>) {
  return unit.buildings?.name ? `${unit.buildings.name} · ${unit.code}` : unit.code;
}

export function directoryUnitLabel(unit: Unit, buildings: Building[]) {
  const building = unit.building_id
    ? buildings.find((item) => item.id === unit.building_id)
    : undefined;
  return building ? `${building.name} · ${unit.code}` : unit.code;
}

export function personSearchText(person: Person) {
  return [
    person.first_name,
    person.last_name,
    person.document_type,
    person.document_number,
    person.email,
    person.phone,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function activeOwnerships(items: Ownership[]) {
  return items.filter((item) => !item.ends_at);
}

export function activeOccupancies(items: Occupancy[]) {
  return items.filter((item) => !item.ends_at);
}

function localDateKey(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function invitationEligibleOccupancy(item: Occupancy, today: string) {
  // Preserve the pre-HAB-418 tenant presentation contract. The database tenant helpers still use
  // their historical active-row semantics, and changing them belongs to a separate hardening issue.
  if (item.occupancy_type === 'tenant') return !item.ends_at;

  // The two roles introduced by HAB-418 use the strict lifecycle that the database enforces:
  // not before starts_at, and through an inclusive ends_at when one exists.
  if (
    item.occupancy_type === 'family_member' ||
    item.occupancy_type === 'authorized_occupant'
  ) {
    return item.starts_at <= today && (!item.ends_at || item.ends_at >= today);
  }

  return false;
}

export function residentAccessOptions(
  ownerships: Ownership[],
  occupancies: Occupancy[],
  now = new Date(),
) {
  const today = localDateKey(now);
  const options: ResidentAccessOption[] = [
    ...activeOwnerships(ownerships).map((item) => ({
      role: 'owner' as const,
      unitId: item.unit_id,
      unitLabel: unitContextLabel(item.units),
      relationshipId: item.id,
    })),
    // Every occupancy type that maps to a residential membership. `owner_occupant` is absent on
    // purpose: living in a unit you own is covered by the ownership above, and inviting somebody
    // twice for the same standing is not a thing an administrator should be offered.
    ...occupancies
      .filter((item) => invitationEligibleOccupancy(item, today))
      .map((item) => ({
        role: item.occupancy_type as ResidentAccessRole,
        unitId: item.unit_id,
        unitLabel: unitContextLabel(item.units),
        relationshipId: item.id,
      })),
  ];

  return options.filter(
    (option, index) =>
      options.findIndex(
        (candidate) => candidate.role === option.role && candidate.unitId === option.unitId,
      ) === index,
  );
}

export function residentInvitationDisplayStatus(
  invitation: { status: ResidentInvitationStatus; expires_at: string },
  now = new Date(),
): ResidentInvitationStatus {
  if (invitation.status !== 'pending') return invitation.status;
  return new Date(invitation.expires_at).getTime() < now.getTime() ? 'expired' : 'pending';
}
