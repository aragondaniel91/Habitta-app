export type Person = {
  id: string;
  first_name: string;
  last_name: string;
  document_type?: string | null;
  document_number?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: 'active' | 'inactive';
};

export type Building = { id: string; name: string };

export type Unit = {
  id: string;
  code: string;
  condominium_id?: string;
  building_id?: string | null;
  buildings?: { id: string; name: string } | null;
  status?: string;
};

export type UnitContext = {
  id: string;
  code: string;
  condominium_id: string;
  building_id?: string | null;
  buildings?: { id: string; name: string } | null;
};

export type Ownership = {
  id: string;
  person_id: string;
  unit_id: string;
  ownership_percentage?: number | null;
  is_primary_contact?: boolean;
  starts_at: string;
  ends_at?: string | null;
  units: UnitContext;
};

export type Occupancy = {
  id: string;
  person_id: string;
  unit_id: string;
  occupancy_type: 'owner_occupant' | 'tenant' | 'family_member' | 'authorized_occupant';
  is_primary_contact?: boolean;
  starts_at: string;
  ends_at?: string | null;
  units: UnitContext;
};

export type CondominiumRelationshipType =
  | 'board_member'
  | 'administrator_contact'
  | 'representative'
  | 'emergency_contact'
  | 'other';

export type CondominiumRelationship = {
  id: string;
  condominium_id: string;
  person_id: string;
  relationship_type: CondominiumRelationshipType;
  title?: string | null;
  starts_at: string;
  ends_at?: string | null;
};

export type PersonRelationshipView = {
  person: Person;
  ownerships: Ownership[];
  occupancies: Occupancy[];
  condominiumRelationships: CondominiumRelationship[];
};

export type PersonAdminNoteRevision = {
  id: number;
  action: 'saved' | 'cleared';
  content: string | null;
  created_by: string;
  created_at: string;
};

export type PersonAdminNotesView = {
  authorized: boolean;
  revisions: PersonAdminNoteRevision[];
};

export type Preview = { valid: unknown[]; errors: { row: number; error: string }[] };
