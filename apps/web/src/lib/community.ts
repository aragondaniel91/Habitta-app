export type CommunityUnit = {
  id: string;
  code: string;
  status: string;
  type?: string;
  building_id?: string;
};

export type CommunityBuilding = {
  id: string;
  name: string;
};

export type CommunityPerson = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
};

export type BuildingCommunityRow = {
  id: string;
  name: string;
  units: number;
  activeUnits: number;
  percentage: number;
};

export function getCommunityStats(units: CommunityUnit[], people: CommunityPerson[]) {
  const activeUnits = units.filter((unit) => unit.status === 'active').length;
  const activePeople = people.filter((person) => person.status !== 'inactive').length;
  const peopleWithEmail = people.filter((person) => Boolean(person.email?.trim())).length;
  const peopleWithPhone = people.filter((person) => Boolean(person.phone?.trim())).length;
  const peopleWithBoth = people.filter(
    (person) => Boolean(person.email?.trim()) && Boolean(person.phone?.trim()),
  ).length;
  const peopleWithoutContact = people.filter(
    (person) => !person.email?.trim() && !person.phone?.trim(),
  ).length;

  return {
    activeUnits,
    inactiveUnits: Math.max(0, units.length - activeUnits),
    activePeople,
    inactivePeople: Math.max(0, people.length - activePeople),
    peopleWithEmail,
    peopleWithPhone,
    peopleWithBoth,
    peopleWithoutContact,
    contactCoverage: people.length ? (peopleWithBoth / people.length) * 100 : 0,
  };
}

export function buildBuildingCommunityRows(
  buildings: CommunityBuilding[],
  units: CommunityUnit[],
): BuildingCommunityRow[] {
  const maximum = Math.max(
    ...buildings.map((building) => units.filter((unit) => unit.building_id === building.id).length),
    1,
  );

  return buildings
    .map((building) => {
      const buildingUnits = units.filter((unit) => unit.building_id === building.id);
      return {
        id: building.id,
        name: building.name,
        units: buildingUnits.length,
        activeUnits: buildingUnits.filter((unit) => unit.status === 'active').length,
        percentage: (buildingUnits.length / maximum) * 100,
      };
    })
    .sort((left, right) => right.units - left.units || left.name.localeCompare(right.name));
}

export function getCommunityDirectoryRows(people: CommunityPerson[], limit = 6) {
  return [...people]
    .sort(
      (left, right) =>
        Number(right.status !== 'inactive') - Number(left.status !== 'inactive') ||
        left.last_name.localeCompare(right.last_name) ||
        left.first_name.localeCompare(right.first_name),
    )
    .slice(0, limit);
}

export function getUnitTypeRows(units: CommunityUnit[]) {
  const totals = new Map<string, number>();
  units.forEach((unit) => {
    const label = unit.type?.trim() || 'Sin clasificar';
    totals.set(label, (totals.get(label) ?? 0) + 1);
  });
  return [...totals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}
