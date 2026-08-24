import type { PropertyTopology } from './unit-domain';

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

export type CommunityStructureCopy = {
  metricDetail: string;
  kicker: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

const countLabel = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

export function getCommunityStructureCopy(
  topology: PropertyTopology,
  buildingCount: number,
): CommunityStructureCopy {
  if (topology === 'house_community') {
    return {
      metricDetail: 'Las casas se administran directamente como unidades del conjunto.',
      kicker: 'Organización residencial',
      title: 'Casas y unidades del conjunto',
      description: 'Este tipo de condominio no necesita una jerarquía por torre o edificio.',
      emptyTitle: 'Casas gestionadas directamente',
      emptyDescription:
        'Cada vivienda se administra desde Unidades y no requiere asignarse a una torre o edificio.',
    };
  }

  if (topology === 'single_building') {
    return {
      metricDetail: `${countLabel(
        buildingCount,
        'edificio registrado',
        'edificios registrados',
      )}.`,
      kicker: 'Estructura residencial',
      title: 'Unidades por edificio',
      description: 'Distribución real de las unidades dentro del edificio residencial.',
      emptyTitle: 'Edificio pendiente',
      emptyDescription: 'Completa la estructura del edificio para visualizar su distribución.',
    };
  }

  if (topology === 'multi_building_complex') {
    return {
      metricDetail: `${countLabel(
        buildingCount,
        'torre o edificio registrado',
        'torres o edificios registrados',
      )}.`,
      kicker: 'Estructura residencial',
      title: 'Unidades por torre o edificio',
      description: 'Distribución real de las unidades entre las estructuras del conjunto.',
      emptyTitle: 'Sin torres o edificios',
      emptyDescription: 'Registra la estructura del conjunto para visualizar su distribución.',
    };
  }

  if (topology === 'mixed') {
    return {
      metricDetail: `${countLabel(
        buildingCount,
        'edificio o torre registrado',
        'edificios o torres registrados',
      )}; las casas pueden existir como unidades directas.`,
      kicker: 'Estructura mixta',
      title: 'Unidades por edificio o torre',
      description:
        'Las estructuras verticales se muestran aquí y las casas permanecen como unidades directas.',
      emptyTitle: 'Sin estructuras verticales',
      emptyDescription:
        'Las casas pueden gestionarse directamente; agrega edificios o torres sólo cuando existan físicamente.',
    };
  }

  return {
    metricDetail: buildingCount
      ? `${countLabel(
          buildingCount,
          'estructura física registrada',
          'estructuras físicas registradas',
        )}; falta definir la topología.`
      : 'Falta definir la topología del condominio.',
    kicker: 'Estructura residencial',
    title: 'Unidades por estructura',
    description: 'Se muestra únicamente la estructura ya registrada mientras se completa el perfil.',
    emptyTitle: 'Topología pendiente',
    emptyDescription:
      'Completa el tipo de propiedad antes de organizar la comunidad por edificios, torres o casas.',
  };
}

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
