export type DirectoryBuilding = {
  id: string;
  name: string;
};

export type DirectoryUnit = {
  id: string;
  code: string;
  building_id?: string | null;
  type?: string | null;
  floor?: string | number | null;
  ownership_percentage?: string | number | null;
  status: string;
};

export type DirectoryPerson = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
};

export type UnitOwnerAssignment = {
  id: string;
  person_id: string;
  unit_id?: string;
  ownership_percentage?: string | number | null;
  is_primary_contact?: boolean;
  starts_at: string;
  ends_at?: string | null;
};

export type UnitOccupancyAssignment = {
  id: string;
  person_id: string;
  unit_id?: string;
  occupancy_type?: string | null;
  is_primary_contact?: boolean;
  starts_at: string;
  ends_at?: string | null;
};

const normalized = (value: string | number | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

export function getPersonName(person: DirectoryPerson) {
  return `${person.first_name} ${person.last_name}`.trim();
}

export function getPersonInitials(person: DirectoryPerson) {
  const first = person.first_name.trim().charAt(0);
  const last = person.last_name.trim().charAt(0);
  return `${first}${last}`.toLocaleUpperCase('es') || '—';
}

export function getBuildingName(
  unit: DirectoryUnit,
  buildings: DirectoryBuilding[],
  fallback = 'Sin torre',
) {
  if (!unit.building_id) return fallback;
  return buildings.find((building) => building.id === unit.building_id)?.name ?? fallback;
}

export function getUnitTypeLabel(type: string | null | undefined) {
  const labels: Record<string, string> = {
    apartment: 'Apartamento',
    house: 'Casa',
    commercial: 'Local',
    storage: 'Depósito',
    parking: 'Estacionamiento',
    other: 'Otro',
  };
  return labels[type ?? ''] ?? (type ? type : 'Sin tipo');
}

export function getUnitStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'Activa',
    inactive: 'Inactiva',
    under_construction: 'En construcción',
  };
  return labels[status] ?? status;
}

export function getPersonStatusLabel(status: string | null | undefined) {
  return status === 'inactive' ? 'Inactiva' : 'Activa';
}

export function filterUnits(
  units: DirectoryUnit[],
  buildings: DirectoryBuilding[],
  filters: { query: string; buildingId: string; status: string },
) {
  const query = normalized(filters.query);
  return units.filter((unit) => {
    const buildingName = getBuildingName(unit, buildings);
    const matchesQuery =
      !query ||
      [unit.code, unit.floor, buildingName, getUnitTypeLabel(unit.type)]
        .map(normalized)
        .some((value) => value.includes(query));
    const matchesBuilding = !filters.buildingId || unit.building_id === filters.buildingId;
    const matchesStatus = !filters.status || unit.status === filters.status;
    return matchesQuery && matchesBuilding && matchesStatus;
  });
}

export function filterPeople(
  people: DirectoryPerson[],
  filters: { query: string; status: string },
) {
  const query = normalized(filters.query);
  return people.filter((person) => {
    const matchesQuery =
      !query ||
      [getPersonName(person), person.email, person.phone]
        .map(normalized)
        .some((value) => value.includes(query));
    const status = person.status === 'inactive' ? 'inactive' : 'active';
    return matchesQuery && (!filters.status || status === filters.status);
  });
}

export function countUnitsByStatus(units: DirectoryUnit[]) {
  return units.reduce(
    (summary, unit) => {
      if (unit.status === 'active') summary.active += 1;
      else summary.inactive += 1;
      return summary;
    },
    { active: 0, inactive: 0 },
  );
}

export function isCurrentAssignment(assignment: { ends_at?: string | null }) {
  return !assignment.ends_at || assignment.ends_at >= new Date().toISOString().slice(0, 10);
}
