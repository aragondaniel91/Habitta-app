export type PropertyTopology =
  'unspecified' | 'house_community' | 'single_building' | 'multi_building_complex' | 'mixed';

export type ChargeScope = 'unit' | 'building';
export type UnitType = 'apartment' | 'house' | 'commercial' | 'parking' | 'storage' | 'building';

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  apartment: 'Apartamento',
  house: 'Casa',
  commercial: 'Local comercial',
  parking: 'Estacionamiento',
  storage: 'Depósito',
  building: 'Edificio completo',
};

const ALL_UNIT_TYPES: UnitType[] = ['apartment', 'house', 'commercial', 'parking', 'storage'];
const BUILDING_UNIT_TYPES: UnitType[] = ['apartment', 'commercial', 'parking', 'storage'];
const HOUSE_COMMUNITY_UNIT_TYPES: UnitType[] = ['house', 'commercial', 'parking', 'storage'];

export function allowedUnitTypes(
  topology: PropertyTopology,
  chargeScope: ChargeScope = 'unit',
): UnitType[] {
  if (chargeScope === 'building') {
    return topology === 'multi_building_complex' ? ['building'] : [];
  }
  if (topology === 'house_community') return HOUSE_COMMUNITY_UNIT_TYPES;
  if (topology === 'single_building' || topology === 'multi_building_complex') {
    return BUILDING_UNIT_TYPES;
  }
  return ALL_UNIT_TYPES;
}

export function defaultUnitType(
  topology: PropertyTopology,
  chargeScope: ChargeScope = 'unit',
): UnitType {
  if (chargeScope === 'building') return 'building';
  return topology === 'house_community' ? 'house' : 'apartment';
}

export function unitTypeOptions(
  topology: PropertyTopology,
  chargeScope: ChargeScope = 'unit',
): Array<[UnitType, string]> {
  return allowedUnitTypes(topology, chargeScope).map((type) => [type, UNIT_TYPE_LABELS[type]]);
}

export function isUnitTypeAllowed(
  topology: PropertyTopology,
  type: UnitType,
  chargeScope: ChargeScope = 'unit',
): boolean {
  return allowedUnitTypes(topology, chargeScope).includes(type);
}

export function supportsBuildingStructure(topology: PropertyTopology): boolean {
  return topology !== 'house_community';
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
