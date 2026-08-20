import { uuidSchema } from '@habitta/validation';
import { Hono } from 'hono';
import type { NotificationBindings } from './notifications/types';

type Environment = {
  Bindings: NotificationBindings;
  Variables: { token: string; userId: string };
};

type UnitsDirectoryPerson = {
  personId: string;
  firstName: string;
  lastName: string;
};

type UnitsDirectoryOwner = UnitsDirectoryPerson & {
  assignmentId: string;
  ownershipPercentage: number | string | null;
  isPrimaryContact: boolean;
  startsAt: string;
  endsAt: string | null;
};

type UnitsDirectoryOccupancy = UnitsDirectoryPerson & {
  assignmentId: string;
  occupancyType: 'owner_occupant' | 'tenant' | 'family_member' | 'authorized_occupant';
  isPrimaryContact: boolean;
  startsAt: string;
  endsAt: string | null;
};

type UnitsDirectoryUnit = {
  id: string;
  condominiumId: string;
  buildingId: string | null;
  code: string;
  type: 'apartment' | 'house' | 'commercial' | 'parking' | 'storage';
  floor: string | null;
  ownershipPercentage: number | string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  building: { id: string; name: string } | null;
  owners: UnitsDirectoryOwner[];
  occupancies: UnitsDirectoryOccupancy[];
};

type PersonRow = { id: string; first_name: string; last_name: string };
type BuildingRow = { id: string; name: string };
type UnitRow = {
  id: string;
  condominium_id: string;
  building_id: string | null;
  code: string;
  type: UnitsDirectoryUnit['type'];
  floor: string | null;
  ownership_percentage: number | string | null;
  status: UnitsDirectoryUnit['status'];
  created_at: string;
  updated_at: string;
  buildings: BuildingRow | null;
};
type OwnerRow = {
  id: string;
  unit_id: string;
  ownership_percentage: number | string | null;
  is_primary_contact: boolean;
  starts_at: string;
  ends_at: string | null;
  people: PersonRow;
};
type OccupancyRow = {
  id: string;
  unit_id: string;
  occupancy_type: UnitsDirectoryOccupancy['occupancyType'];
  is_primary_contact: boolean;
  starts_at: string;
  ends_at: string | null;
  people: PersonRow;
};

const directoryRequest = (
  c: { env: NotificationBindings; get: (key: 'token') => string },
  path: string,
) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
    },
  });

const indexByUnit = <T extends { unit_id: string }>(rows: T[]) => {
  const indexed = new Map<string, T[]>();
  for (const row of rows) indexed.set(row.unit_id, [...(indexed.get(row.unit_id) ?? []), row]);
  return indexed;
};

const owner = (row: OwnerRow): UnitsDirectoryOwner => ({
  assignmentId: row.id,
  personId: row.people.id,
  firstName: row.people.first_name,
  lastName: row.people.last_name,
  ownershipPercentage: row.ownership_percentage,
  isPrimaryContact: row.is_primary_contact,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
});

const occupancy = (row: OccupancyRow): UnitsDirectoryOccupancy => ({
  assignmentId: row.id,
  personId: row.people.id,
  firstName: row.people.first_name,
  lastName: row.people.last_name,
  occupancyType: row.occupancy_type,
  isPrimaryContact: row.is_primary_contact,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
});

export const unitsDirectoryRoutes = new Hono<Environment>();

unitsDirectoryRoutes.get('/:id/units-directory', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const [unitsResponse, ownersResponse, occupanciesResponse] = await Promise.all([
    directoryRequest(
      c,
      `units?condominium_id=eq.${condominiumId}&select=id,condominium_id,building_id,code,type,floor,ownership_percentage,status,created_at,updated_at,buildings(id,name)&order=code`,
    ),
    directoryRequest(
      c,
      `unit_owners?ends_at=is.null&units!inner(condominium_id=eq.${condominiumId})&select=id,unit_id,ownership_percentage,is_primary_contact,starts_at,ends_at,people!inner(id,first_name,last_name)&order=starts_at.desc`,
    ),
    directoryRequest(
      c,
      `unit_occupancies?ends_at=is.null&units!inner(condominium_id=eq.${condominiumId})&select=id,unit_id,occupancy_type,is_primary_contact,starts_at,ends_at,people!inner(id,first_name,last_name)&order=starts_at.desc`,
    ),
  ]);
  if (!unitsResponse.ok || !ownersResponse.ok || !occupanciesResponse.ok)
    return c.json({ error: 'Units directory is unavailable' }, 403);

  const [units, owners, occupancies] = await Promise.all([
    unitsResponse.json() as Promise<UnitRow[]>,
    ownersResponse.json() as Promise<OwnerRow[]>,
    occupanciesResponse.json() as Promise<OccupancyRow[]>,
  ]);
  const ownersByUnit = indexByUnit(owners);
  const occupanciesByUnit = indexByUnit(occupancies);
  const response: UnitsDirectoryUnit[] = units.map((unit) => ({
    id: unit.id,
    condominiumId: unit.condominium_id,
    buildingId: unit.building_id,
    code: unit.code,
    type: unit.type,
    floor: unit.floor,
    ownershipPercentage: unit.ownership_percentage,
    status: unit.status,
    createdAt: unit.created_at,
    updatedAt: unit.updated_at,
    building: unit.buildings,
    owners: (ownersByUnit.get(unit.id) ?? []).map(owner),
    occupancies: (occupanciesByUnit.get(unit.id) ?? []).map(occupancy),
  }));
  return c.json({ units: response });
});
