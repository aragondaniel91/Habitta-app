import { describe, expect, it } from 'vitest';
import { currentAdminNote, hasActiveAdminNote } from './admin-notes';
import type { PersonAdminNotesView } from './types';

const saved: PersonAdminNotesView = {
  authorized: true,
  revisions: [
    {
      id: 2,
      action: 'saved',
      content: 'Seguimiento interno',
      created_by: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-08-18T00:00:00.000Z',
    },
  ],
};

describe('HAB-217 private note view helpers', () => {
  it('uses only the latest saved revision as the current note', () => {
    expect(currentAdminNote(saved)).toBe('Seguimiento interno');
    expect(hasActiveAdminNote(saved.revisions)).toBe(true);
  });

  it('treats a clear tombstone as an empty current note while preserving history', () => {
    const cleared: PersonAdminNotesView = {
      authorized: true,
      revisions: [
        {
          id: 3,
          action: 'cleared',
          content: null,
          created_by: '00000000-0000-0000-0000-000000000001',
          created_at: '2026-08-18T01:00:00.000Z',
        },
        ...saved.revisions,
      ],
    };
    expect(currentAdminNote(cleared)).toBe('');
    expect(hasActiveAdminNote(cleared.revisions)).toBe(false);
    expect(cleared.revisions).toHaveLength(2);
  });
});
