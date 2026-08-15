import type {
  CondominiumRelationshipType,
  Occupancy,
  Ownership,
  Person,
  UnitContext,
} from './types';

export const condominiumRelationshipLabels: Record<CondominiumRelationshipType, string> = {
  board_member: 'Junta de condominio',
  administrator_contact: 'Contacto de administración',
  representative: 'Representante',
  emergency_contact: 'Contacto de emergencia',
  other: 'Otra relación',
};

export const occupancyLabels: Record<Occupancy['occupancy_type'], string> = {
  owner_occupant: 'Propietario ocupante',
  tenant: 'Inquilino',
  family_member: 'Familiar',
  authorized_occupant: 'Ocupante autorizado',
};

export function unitContextLabel(unit: UnitContext) {
  return unit.buildings?.name ? `${unit.buildings.name} · ${unit.code}` : unit.code;
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
