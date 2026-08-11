export type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
};
export type Unit = { id: string; code: string };
export type Assignment = {
  id: string;
  person_id: string;
  starts_at: string;
  ends_at?: string;
  unitId?: string;
  unitCode?: string;
};
export type Preview = { valid: unknown[]; errors: { row: number; error: string }[] };
