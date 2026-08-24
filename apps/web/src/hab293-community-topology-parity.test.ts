import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./pages/CommunityPage.tsx', import.meta.url), 'utf8');
const domain = readFileSync(new URL('./lib/community.ts', import.meta.url), 'utf8');

describe('HAB-293 topology-aware Community presentation', () => {
  it('reads the existing condominium topology and fails soft to unspecified', () => {
    expect(page).toContain('type CondominiumProfile = { property_topology?: PropertyTopology }');
    expect(page).toContain('apiRequest<CondominiumProfile[]>(base, session).catch(() => [])');
    expect(page).toContain("propertyTopology: profile[0]?.property_topology ?? 'unspecified'");
  });

  it('uses the canonical building-structure guard before showing building distribution', () => {
    expect(page).toContain("import { supportsBuildingStructure } from '../lib/unit-domain'");
    expect(page).toContain('supportsBuildingStructure(data.propertyTopology)');
    expect(page).toContain('showBuildingDistribution && buildingRows.length');
  });

  it('removes topology-blind tower copy from CommunityPage', () => {
    expect(page).not.toContain('Unidades por torre</h2>');
    expect(page).not.toContain('torres registradas');
    expect(page).not.toContain('Crea una torre o edificio');
    expect(page).not.toContain('Todavía no hay torres');
  });

  it('keeps topology copy in the Community domain helper with a neutral unspecified fallback', () => {
    for (const topology of [
      'house_community',
      'single_building',
      'multi_building_complex',
      'mixed',
    ]) {
      expect(domain).toContain(`topology === '${topology}'`);
    }
    expect(domain).toContain("'Falta definir la topología del condominio.'");
    expect(domain).toContain("title: 'Unidades por estructura'");
    expect(domain).toContain("emptyTitle: 'Topología pendiente'");
    expect(page).toContain(
      'getCommunityStructureCopy(data.propertyTopology, data.buildings.length)',
    );
  });

  it('keeps the existing UUID-backed community entity routes and navigation intact', () => {
    expect(page).toContain('`${base}/units`');
    expect(page).toContain('`${base}/buildings`');
    expect(page).toContain('`${base}/people`');
    expect(page).toContain("routeByKey('units')");
    expect(page).toContain('key={building.id}');
    expect(page).toContain('key={person.id}');
  });
});
