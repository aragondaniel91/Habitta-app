import type { PersonAdminNoteRevision, PersonAdminNotesView } from './types';

export function currentAdminNote(view: PersonAdminNotesView) {
  const revision = view.revisions[0];
  return revision?.action === 'saved' ? (revision.content ?? '') : '';
}

export function hasActiveAdminNote(revisions: PersonAdminNoteRevision[]) {
  return revisions[0]?.action === 'saved';
}
