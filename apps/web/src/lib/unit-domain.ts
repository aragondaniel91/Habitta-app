export type PropertyTopology =
  'unspecified' | 'house_community' | 'single_building' | 'multi_building_complex' | 'mixed';

export type UnitType = 'apartment' | 'house' | 'commercial' | 'parking' | 'storage';

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  apartment: 'Apartamento',
  house: 'Casa',
  commercial: 'Local comercial',
  parking: 'Estacionamiento',
  storage: 'Depósito',
};

const ALL_UNIT_TYPES: UnitType[] = ['apartment', 'house', 'commercial', 'parking', 'storage'];
const BUILDING_UNIT_TYPES: UnitType[] = ['apartment', 'commercial', 'parking', 'storage'];
const HOUSE_COMMUNITY_UNIT_TYPES: UnitType[] = ['house', 'commercial', 'parking', 'storage'];

export function allowedUnitTypes(topology: PropertyTopology): UnitType[] {
  if (topology === 'house_community') return HOUSE_COMMUNITY_UNIT_TYPES;
  if (topology === 'single_building' || topology === 'multi_building_complex') {
    return BUILDING_UNIT_TYPES;
  }
  return ALL_UNIT_TYPES;
}

export function defaultUnitType(topology: PropertyTopology): UnitType {
  return topology === 'house_community' ? 'house' : 'apartment';
}

export function unitTypeOptions(topology: PropertyTopology): Array<[UnitType, string]> {
  return allowedUnitTypes(topology).map((type) => [type, UNIT_TYPE_LABELS[type]]);
}

export function isUnitTypeAllowed(topology: PropertyTopology, type: UnitType): boolean {
  return allowedUnitTypes(topology).includes(type);
}

export function unitReferenceLabel({
  code,
  buildingName,
}: {
  code: string;
  buildingName?: string | null;
}): string {
  const normalizedBuilding = buildingName?.trim();
  return normalizedBuilding ? `${normalizedBuilding} · ${code}` : code;
}
