import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('HAB-260 approved People information architecture', () => {
  it('defines one profile navigation model instead of independent stacked operational forms', async () => {
    const source = await read('./features/people/PeopleWorkspaceComponents.tsx');

    expect(source).toContain("'summary'");
    expect(source).toContain("'units'");
    expect(source).toContain("'community-roles'");
    expect(source).toContain("'private-notes'");
    expect(source).toContain("'digital-access'");
    expect(source).toContain('Relaciones con unidades');
    expect(source).toContain('Roles en la comunidad');
    expect(source).toContain('Notas privadas');
    expect(source).toContain('Acceso digital');
  });

  it('renders a single per-unit card that summarizes the approved relationship dimensions', async () => {
    const source = await read('./features/people/PeopleWorkspaceComponents.tsx');

    expect(source).toContain('export function PersonUnitRelationshipCard');
    expect(source).toContain('Propiedad');
    expect(source).toContain('Comunicaciones financieras');
    expect(source).toContain('Comunicaciones generales');
    expect(source).toContain('Ocupación');
    expect(source).toContain('Acceso digital');
    expect(source).toContain('relationship.currentOwnership');
    expect(source).toContain('relationship.currentOccupancy');
    expect(source).toContain('relationship.currentCommunication');
    expect(source).toContain('relationship.latestInvitationStatus');
  });

  it('keeps relationship actions explicit and history discoverable', async () => {
    const source = await read('./features/people/PeopleWorkspaceComponents.tsx');

    expect(source).toContain('Editar relación');
    expect(source).toContain('Ver historial');
    expect(source).toContain('Cerrar relación');
    expect(source).toContain('Invitar');
    expect(source).toContain('accessEligible');
  });

  it('keeps the directory and profile responsive instead of turning mobile into horizontal overflow', async () => {
    const css = await read('./features/people/people-v3.css');

    expect(css).toContain('.people-v3-directory');
    expect(css).toContain('.people-v3-unit-card__facts');
    expect(css).toContain('@media (max-width: 860px)');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('grid-template-columns: 1fr');
  });

  it('does not switch the production route until the controller integration is ready', async () => {
    const route = await read('./pages/CommunityDirectoryPage.tsx');

    expect(route).toContain("import { PeoplePanel } from '../features/people/PeoplePanel';");
    expect(route).toContain('<PeoplePanel');
    expect(route).not.toContain('PeoplePanelV3');
  });
});
