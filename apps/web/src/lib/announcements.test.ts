import { describe, expect, it } from 'vitest';
import {
  filterAnnouncements,
  getAnnouncementStats,
  getAudienceDetail,
  getRecipientStats,
  type AnnouncementRecord,
} from './announcements';

const announcement = (patch: Partial<AnnouncementRecord> = {}): AnnouncementRecord => ({
  id: 'announcement-1',
  condominium_id: 'condo-1',
  title: 'Mantenimiento de ascensores',
  summary: 'El ascensor norte estará fuera de servicio.',
  body: 'El proveedor realizará mantenimiento preventivo.',
  priority: 'normal',
  status: 'draft',
  audience: 'everyone',
  building_id: null,
  unit_id: null,
  requires_acknowledgement: false,
  publish_at: null,
  published_at: null,
  expires_at: null,
  archived_at: null,
  created_by: 'user-1',
  updated_by: 'user-1',
  version: 1,
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
  ...patch,
});

describe('announcement workspace helpers', () => {
  it('keeps lifecycle metrics independent', () => {
    const rows = [
      announcement(),
      announcement({ id: '2', status: 'scheduled' }),
      announcement({ id: '3', status: 'published', requires_acknowledgement: true }),
      announcement({ id: '4', status: 'published' }),
    ];
    expect(getAnnouncementStats(rows)).toEqual({
      drafts: 1,
      scheduled: 1,
      published: 2,
      acknowledgement: 1,
    });
  });

  it('searches audience targets and sorts urgent work first', () => {
    const rows = filterAnnouncements(
      [
        announcement({ id: 'normal', title: 'General' }),
        announcement({
          id: 'urgent',
          title: 'Torre norte',
          priority: 'urgent',
          audience: 'building',
          building_id: 'building-1',
        }),
      ],
      [{ id: 'building-1', name: 'Torre Norte' }],
      [],
      { query: 'torre norte', status: '', priority: '', audience: '' },
    );
    expect(rows.map((item) => item.id)).toEqual(['urgent']);
  });

  it('summarizes audience and acknowledgement progress', () => {
    expect(
      getAudienceDetail(
        announcement({ audience: 'unit', unit_id: 'unit-1' }),
        [],
        [{ id: 'unit-1', code: '4B', building_id: null, status: 'active' }],
      ),
    ).toBe('Unidad 4B');
    expect(
      getRecipientStats([
        {
          announcement_id: 'announcement-1',
          condominium_id: 'condo-1',
          user_id: 'user-1',
          person_id: null,
          audience_reason: 'everyone',
          read_at: '2026-07-20T13:00:00Z',
          acknowledged_at: null,
          created_at: '2026-07-20T12:00:00Z',
        },
        {
          announcement_id: 'announcement-1',
          condominium_id: 'condo-1',
          user_id: 'user-2',
          person_id: null,
          audience_reason: 'everyone',
          read_at: '2026-07-20T13:00:00Z',
          acknowledged_at: '2026-07-20T13:05:00Z',
          created_at: '2026-07-20T12:00:00Z',
        },
      ]),
    ).toEqual({ total: 2, read: 2, acknowledged: 1 });
  });
});
