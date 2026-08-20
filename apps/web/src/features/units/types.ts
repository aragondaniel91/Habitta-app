import type { UnitType } from '../../lib/unit-domain';

export type CondominiumProfile = {
  id: string;
  property_topology?: import('../../lib/unit-domain').PropertyTopology;
};

export type DirectoryPerson = {
  assignmentId: string;
  personId: string;
  firstName: string;
  lastName: string;
  isPrimaryContact: boolean;
  startsAt: string;
  endsAt: string | null;
};

export type DirectoryOwner = DirectoryPerson & {
  ownershipPercentage: number | string | null;
};

export type DirectoryOccupancy = DirectoryPerson & {
  occupancyType: 'owner_occupant' | 'tenant' | 'family_member' | 'authorized_occupant';
};

export type DirectoryUnit = {
  id: string;
  condominiumId: string;
  buildingId: string | null;
  code: string;
  type: UnitType;
  floor: string | null;
  ownershipPercentage: number | string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  building: { id: string; name: string } | null;
  owners: DirectoryOwner[];
  occupancies: DirectoryOccupancy[];
};

export type UnitsDirectory = { units: DirectoryUnit[] };
