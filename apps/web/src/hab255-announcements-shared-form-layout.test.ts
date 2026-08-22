import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const announcementsSource = source('./pages/AnnouncementsPage.tsx');
const announcementsStyles = source('./announcements.css');
const parityMatrixSource = source('../../../docs/frontend/form-parity-matrix.md');

describe('HAB-255 Announcements shared form layout', () => {
  it('uses shared form grids and actions for create and editable announcement flows', () => {
    expect(announcementsSource).toContain(
      "import { FormActions, FormGrid } from '../components/FormLayout'",
    );
    expect(announcementsSource.match(/<FormGrid>/g)?.length).toBe(2);
    expect(announcementsSource.match(/<FormActions/g)?.length).toBe(2);
    expect(announcementsSource).not.toContain('className="announcements-form__grid"');
    expect(announcementsStyles).not.toContain('.announcements-form__grid');
  });

  it('preserves topology-aware audiences and building-qualified unit labels', () => {
    expect(announcementsSource).toContain(
      "supportsBuildingStructure(propertyTopology) || audience === 'building'",
    );
    expect(announcementsSource).toContain('unitReferenceLabel({');
    expect(announcementsSource).toContain('buildingNameById[item.building_id]');
    expect(announcementsSource).toContain('<option key={item.id} value={item.id}>');
  });

  it('preserves UUID-backed audience selector payload semantics', () => {
    expect(announcementsSource).toContain(
      "if (audience === 'building') payload.buildingId = buildingId;",
    );
    expect(announcementsSource).toContain("if (audience === 'unit') payload.unitId = unitId;");
    expect(announcementsSource).toContain('payload.buildingId = buildingId');
    expect(announcementsSource).toContain('payload.unitId = unitId');
  });

  it('preserves optimistic versioning and publication lifecycle behavior', () => {
    expect(announcementsSource).toContain('{ expectedVersion: announcement.version }');
    expect(announcementsSource).toContain('expectedVersion: announcement.version');
    expect(announcementsSource).toContain(
      "action: 'publish' | 'archive' | 'unschedule' | 'read' | 'acknowledge'",
    );
    expect(announcementsSource).toContain(
      "const editable = announcement.status === 'draft' || announcement.status === 'scheduled'",
    );
    expect(announcementsSource).toContain("requestAction('publish')");
    expect(announcementsSource).toContain("requestAction('archive')");
    expect(announcementsSource).toContain("requestAction('unschedule')");
  });

  it('preserves acknowledgement and private attachment behavior', () => {
    expect(announcementsSource).toContain('requiresAcknowledgement');
    expect(announcementsSource).toContain("requestAction('acknowledge')");
    expect(announcementsSource).toContain('${announcement.id}/attachments');
    expect(announcementsSource).toContain('${attachment.id}/file');
    expect(announcementsSource).toContain(
      "disabled={announcement.status === 'published' || announcement.status === 'archived'}",
    );
  });

  it('keeps native blocking dialogs out of the Announcements workflow', () => {
    expect(announcementsSource).not.toContain('window.alert');
    expect(announcementsSource).not.toContain('window.confirm');
    expect(announcementsSource).not.toContain('window.prompt');
  });

  it('marks Announcements compliant only after the focused migration', () => {
    expect(parityMatrixSource).toContain(
      '| Anuncios | AnnouncementsPage create + editor | compliant | Sí | Sí | Sí | Sí |',
    );
  });
});
