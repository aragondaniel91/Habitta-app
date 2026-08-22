import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('HAB-261 live Personas UX redesign', () => {
  it('routes Personas to the V3 controller and keeps the approved profile information architecture', async () => {
    const route = await read('./pages/CommunityDirectoryPage.tsx');
    const controller = await read('./features/people/PeoplePanelV3.tsx');

    expect(route).toContain("import { PeoplePanelV3 } from '../features/people/PeoplePanelV3';");
    expect(route).toContain('<PeoplePanelV3');
    expect(controller).toContain("useState<PeopleProfileTab>('summary')");
    expect(controller).toContain("tab === 'units'");
    expect(controller).toContain("tab === 'community-roles'");
    expect(controller).toContain("tab === 'private-notes'");
    expect(controller).toContain("tab === 'digital-access'");
    expect(controller).toContain('buildPersonUnitRelationships');
  });

  it('preserves atomic person creation and uses inline validation instead of browser-native bubbles', async () => {
    const editor = await read('./features/people/PersonEditorDrawerV3.tsx');

    expect(editor).toContain('/people/create-with-context`');
    expect(editor).toContain('initialRelationship');
    expect(editor).toContain('communication');
    expect(editor).toContain('<form className="ux-form" noValidate');
    expect(editor).toContain('Escribe el nombre para continuar.');
    expect(editor).toContain('Escribe el apellido para continuar.');
    expect(editor).toContain('Una persona inactiva no puede comenzar con una relación activa.');
    expect(editor).toContain('<option value="Cédula V">Cédula V</option>');
    expect(editor).toContain('<option value="Cédula E">Cédula E</option>');
    expect(editor).toContain('<option value="RIF">RIF</option>');
    expect(editor).toContain('<option value="Pasaporte">Pasaporte</option>');
    expect(editor).toContain('<option value="Otro">Otro</option>');
    expect(editor).not.toMatch(/<input[^>]+\srequired(?:=|\s|>)/s);
    expect(editor).not.toMatch(/<Select[^>]+\srequired(?:=|\s|>)/s);
  });

  it('keeps UUID-backed unit identity and independent property occupancy and communication mutations', async () => {
    const editor = await read('./features/people/PersonEditorDrawerV3.tsx');
    const relationship = await read('./features/people/PersonUnitRelationshipDrawerV3.tsx');

    expect(editor).toContain('<option key={unit.id} value={unit.id}>');
    expect(relationship).toContain('<option key={item.id} value={item.id}>');
    expect(relationship).toContain('/ownerships`');
    expect(relationship).toContain('/occupancies`');
    expect(relationship).toContain('/communication-responsibilities/${unitId}`');
    expect(relationship).toContain('unitId,');
    expect(relationship).toContain('financialRole, generalRecipient');
    expect(relationship).toContain('onRequestClose');
  });

  it('preserves community roles private notes resident invitations and CSV preview plus idempotent commit', async () => {
    const controller = await read('./features/people/PeoplePanelV3.tsx');
    const importer = await read('./features/people/PeopleImportDrawerV3.tsx');

    expect(controller).toContain('/condominium-relationships`');
    expect(controller).toContain('/admin-notes`');
    expect(controller).toContain('/admin-notes/clear`');
    expect(controller).toContain('adminNotesAuthorized');
    expect(controller).toContain('createResidentInvitation');
    expect(controller).toContain('residentAccessOptions');
    expect(controller).toContain('revokeResidentInvitation');
    expect(controller).toContain('listResidentInvitationDeliveryEvents');
    expect(importer).toContain('/people/import/preview`');
    expect(importer).toContain('/people/import/commit`');
    expect(importer).toContain('crypto.randomUUID()');
    expect(importer).toContain('preview.valid');
    expect(importer).toContain('preview.errors');
  });

  it('keeps lifecycle confirmations shared and exposes audit history without destructive rewrites', async () => {
    const controller = await read('./features/people/PeoplePanelV3.tsx');
    const history = await read('./features/people/PersonRelationshipHistoryDrawerV3.tsx');

    expect(controller).toContain('<ConfirmDialog');
    expect(controller).toContain('Cerrar relación activa');
    expect(controller).toContain('Revocar acceso pendiente');
    expect(controller).not.toContain('window.confirm(');
    expect(controller).not.toContain('window.alert(');
    expect(controller).not.toContain('window.prompt(');
    expect(history).toContain('relationship.ownershipHistory');
    expect(history).toContain('relationship.occupancyHistory');
    expect(history).toContain('relationship.communicationHistory');
    expect(history).toContain('relationship.invitations');
  });

  it('provides responsive live-workspace styling for desktop tablet and mobile', async () => {
    const css = await read('./features/people/people-v3-controller.css');

    expect(css).toContain('.people-v3-layout');
    expect(css).toContain('grid-template-columns: minmax(250px, 320px) minmax(0, 1fr)');
    expect(css).toContain('@media (max-width: 860px)');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('grid-template-columns: 1fr');
  });
});
