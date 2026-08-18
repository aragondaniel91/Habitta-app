import { unitReferenceLabel } from './unit-domain';

export type AnnouncementPriority = 'normal' | 'important' | 'urgent';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type AnnouncementAudience =
  'everyone' | 'owners' | 'tenants' | 'board' | 'building' | 'unit';

export type AnnouncementRecord = {
  id: string;
  condominium_id: string;
  title: string;
  summary: string;
  body: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  building_id: string | null;
  unit_id: string | null;
  requires_acknowledgement: boolean;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  archived_at: string | null;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type AnnouncementRecipient = {
  announcement_id: string;
  condominium_id: string;
  user_id: string;
  person_id: string | null;
  audience_reason: string;
  read_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

export type AnnouncementEvent = {
  id: string;
  announcement_id: string;
  condominium_id: string;
  event_type:
    'created' | 'updated' | 'scheduled' | 'unscheduled' | 'published' | 'archived' | 'acknowledged';
  actor_user_id: string | null;
  from_value: Record<string, unknown> | null;
  to_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AnnouncementAttachment = {
  id: string;
  announcement_id: string;
  condominium_id: string;
  storage_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: string;
  created_at: string;
};

export type AnnouncementBuilding = { id: string; name: string };
export type AnnouncementUnit = {
  id: string;
  code: string;
  building_id: string | null;
  status: string;
};

export type AnnouncementFilters = {
  query: string;
  status: AnnouncementStatus | '';
  priority: AnnouncementPriority | '';
  audience: AnnouncementAudience | '';
};

export const priorityLabels: Record<AnnouncementPriority, string> = {
  normal: 'Normal',
  important: 'Importante',
  urgent: 'Urgente',
};

export const statusLabels: Record<AnnouncementStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programado',
  published: 'Publicado',
  archived: 'Archivado',
};

export const audienceLabels: Record<AnnouncementAudience, string> = {
  everyone: 'Toda la comunidad',
  owners: 'Propietarios',
  tenants: 'Inquilinos y ocupantes',
  board: 'Junta de condominio',
  building: 'Edificio o torre',
  unit: 'Unidad específica',
};

export const eventLabels: Record<AnnouncementEvent['event_type'], string> = {
  created: 'Borrador creado',
  updated: 'Contenido actualizado',
  scheduled: 'Publicación programada',
  unscheduled: 'Programación retirada',
  published: 'Anuncio publicado',
  archived: 'Anuncio archivado',
  acknowledged: 'Lectura confirmada',
};

export const formatAnnouncementDate = (
  value: string | null,
  options: Intl.DateTimeFormatOptions = {},
) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
};

export const getAnnouncementStats = (rows: AnnouncementRecord[]) => ({
  drafts: rows.filter((item) => item.status === 'draft').length,
  scheduled: rows.filter((item) => item.status === 'scheduled').length,
  published: rows.filter((item) => item.status === 'published').length,
  acknowledgement: rows.filter(
    (item) => item.status === 'published' && item.requires_acknowledgement,
  ).length,
});

export const getRecipientStats = (rows: AnnouncementRecipient[]) => ({
  total: rows.length,
  read: rows.filter((item) => item.read_at).length,
  acknowledged: rows.filter((item) => item.acknowledged_at).length,
});

export const filterAnnouncements = (
  rows: AnnouncementRecord[],
  buildings: AnnouncementBuilding[],
  units: AnnouncementUnit[],
  filters: AnnouncementFilters,
) => {
  const query = filters.query.trim().toLocaleLowerCase('es');
  return rows
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => !filters.priority || item.priority === filters.priority)
    .filter((item) => !filters.audience || item.audience === filters.audience)
    .filter((item) => {
      if (!query) return true;
      const building = buildings.find((candidate) => candidate.id === item.building_id);
      const unit = units.find((candidate) => candidate.id === item.unit_id);
      const unitBuilding = buildings.find((candidate) => candidate.id === unit?.building_id);
      return [item.title, item.summary, item.body, building?.name, unit?.code, unitBuilding?.name]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query);
    })
    .sort((left, right) => {
      const priorityOrder: Record<AnnouncementPriority, number> = {
        urgent: 0,
        important: 1,
        normal: 2,
      };
      const statusOrder: Record<AnnouncementStatus, number> = {
        scheduled: 0,
        draft: 1,
        published: 2,
        archived: 3,
      };
      return (
        statusOrder[left.status] - statusOrder[right.status] ||
        priorityOrder[left.priority] - priorityOrder[right.priority] ||
        right.updated_at.localeCompare(left.updated_at)
      );
    });
};

export const getAudienceDetail = (
  announcement: AnnouncementRecord,
  buildings: AnnouncementBuilding[],
  units: AnnouncementUnit[],
) => {
  if (announcement.audience === 'building') {
    return buildings.find((item) => item.id === announcement.building_id)?.name ?? 'Edificio';
  }
  if (announcement.audience === 'unit') {
    const unit = units.find((item) => item.id === announcement.unit_id);
    const building = buildings.find((item) => item.id === unit?.building_id);
    return unit
      ? unitReferenceLabel({ code: unit.code, buildingName: building?.name ?? null })
      : 'Unidad';
  }
  return audienceLabels[announcement.audience];
};
