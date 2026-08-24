import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './features/help/module-help';

const page = readFileSync(new URL('./pages/CommunityPage.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./community.css', import.meta.url), 'utf8');
const matrix = readFileSync(
  new URL('../../../docs/frontend/form-parity-matrix.md', import.meta.url),
  'utf8',
);

describe('HAB-303 premium Community certification', () => {
  it('uses the shared PageHeader and no legacy Community header selectors', () => {
    expect(page).toContain('<PageHeader');
    expect(styles).not.toContain('.community-overview');
    expect(styles).not.toContain('.community-overview__actions');
  });

  it('keeps responsive metrics, panels and actions intentional', () => {
    expect(styles).toContain('@media (max-width: 1180px)');
    expect(styles).toContain('@media (max-width: 720px)');
    expect(styles).toContain('@media (max-width: 440px)');
    expect(styles).toContain('.community-grid,\n  .community-secondary-grid');
    expect(styles).toContain('.community-action-list');
  });

  it('preserves topology-aware structure presentation and UUID-backed navigation', () => {
    expect(page).toContain('supportsBuildingStructure(data.propertyTopology)');
    expect(page).toContain(
      'getCommunityStructureCopy(data.propertyTopology, data.buildings.length)',
    );
    expect(page).toContain("routeByKey('units')");
    expect(page).toContain("routeByKey('people')");
    expect(page).toContain("routeByKey('requests')");
    expect(page).toContain("routeByKey('announcements')");
    expect(page).toContain('key={building.id}');
    expect(page).toContain('key={person.id}');
  });

  it('keeps explicit loading, retry, empty and contact-health states', () => {
    expect(page).toContain('CommunityLoading');
    expect(page).toContain('Intentar nuevamente');
    expect(page).toContain('Directorio vacío');
    expect(page).toContain('Salud de los contactos');
    expect(page).toContain('Requiere atención');
  });

  it('keeps contextual Help aligned with the real Community actions', () => {
    const guide = MODULE_HELP.community.steps.join(' ');
    expect(guide).toContain('Ver unidades');
    expect(guide).toContain('Completar directorio');
    expect(guide).toContain('Ver solicitudes');
    expect(page).toContain('<strong>Anuncios</strong>');
  });

  it('records Community as certified in the parity matrix', () => {
    expect(matrix).toContain('| Comunidad |');
    expect(matrix).toContain('topology-aware');
  });
});
