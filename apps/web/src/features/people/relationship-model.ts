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

export type ResidentAccessRole = 'owner' | 'tenant';
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

export function relationshipIsActive(item: { ends_at?: string | null }, today = new Date()) {
  if (!item.ends_at) return true;
  return item.ends_at >= today.toISOString().slice(0, 10);
}

export function activeOwnerships(items: Ownership[], today?: Date) {
  return items.filter((item) => relationshipIsActive(item, today));
}

export function activeOccupancies(items: Occupancy[], today?: Date) {
  return items.filter((item) => relationshipIsActive(item, today));
}

export function residentAccessOptions(ownerships: Ownership[], occupancies: Occupancy[]) {
  const options: ResidentAccessOption[] = [
    ...activeOwnerships(ownerships).map((item) => ({
      role: 'owner' as const,
      unitId: item.unit_id,
      unitLabel: unitContextLabel(item.units),
      relationshipId: item.id,
    })),
    ...activeOccupancies(occupancies)
      .filter((item) => item.occupancy_type === 'tenant')
      .map((item) => ({
        role: 'tenant' as const,
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
