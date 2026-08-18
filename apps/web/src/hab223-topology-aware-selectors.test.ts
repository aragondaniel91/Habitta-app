import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const maintenance = source('./pages/MaintenancePageBase.tsx');
const announcements = source('./pages/AnnouncementsPage.tsx');
const announcementHelpers = source('./lib/announcements.ts');

describe('HAB-223 topology-aware selectors', () => {
  it('keeps maintenance building targets topology-aware and UUID-backed', () => {
    expect(maintenance).toContain('supportsBuildingStructure(propertyTopology)');
    expect(maintenance).toContain(
      '{buildingStructure ? <option value="building">Edificio o torre</option> : null}',
    );
    expect(maintenance).toContain("buildingStructure && locationType === 'building'");
    expect(maintenance).toContain("unitId: locationType === 'unit' ? unitId : undefined");
    expect(maintenance).toContain('<option key={unit.id} value={unit.id}>');
    expect(maintenance).toContain('unitReferenceLabel({');
  });

  it('keeps new house-community announcements from selecting buildings without rewriting history', () => {
    expect(announcements).toContain(
      "supportsBuildingStructure(propertyTopology) || audience === 'building'",
    );
    expect(announcements).toContain(
      "if (audience === 'building') payload.buildingId = buildingId;",
    );
    expect(announcements).toContain("if (audience === 'unit') payload.unitId = unitId;");
    expect(announcements).toContain(
      'const [audience, setAudience] = useState<AnnouncementAudience>(announcement.audience)',
    );
    expect(announcements).toContain('<option key={item.id} value={item.id}>');
    expect(announcements).toContain('unitReferenceLabel({');
  });

  it('uses building-qualified unit details and building-name search without changing technical identity', () => {
    expect(announcementHelpers).toContain('unitBuilding?.name');
    expect(announcementHelpers).toContain(
      'unitReferenceLabel({ code: unit.code, buildingName: building?.name ?? null })',
    );
    expect(announcementHelpers).not.toContain('unitLabel');
  });
});
