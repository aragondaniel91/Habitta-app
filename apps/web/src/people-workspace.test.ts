import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  new URL('./pages/CommunityDirectoryPage.tsx', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('./features/people/PeoplePanel.tsx', import.meta.url),
  'utf8',
);
const relationshipSource = readFileSync(
  new URL('./features/people/relationship-model.ts', import.meta.url),
  'utf8',
);

describe('HAB-211 live People workspace contract', () => {
  it('routes the production People screen to the operational workspace', () => {
    expect(routeSource).toContain("if (mode === 'people')");
    expect(routeSource).toContain('<PeoplePanel');
    expect(routeSource).toContain('condominiumName={condominiumName}');
  });

  it('keeps one person profile connected to ownership, occupancy and condominium relationships', () => {
    expect(workspaceSource).toContain('/relationships`');
    expect(workspaceSource).toContain('/ownerships`');
    expect(workspaceSource).toContain('/occupancies`');
    expect(workspaceSource).toContain('/condominium-relationships`');
    expect(workspaceSource).toContain('Un registro por persona');
  });

  it('derives resident access from the existing HAB-125 owner and tenant model', () => {
    expect(relationshipSource).toContain("role: 'owner' as const");
    expect(relationshipSource).toContain("item.occupancy_type === 'tenant'");
    expect(relationshipSource).toContain('!item.ends_at');
    expect(workspaceSource).toContain('createResidentInvitation');
    expect(workspaceSource).toContain('residentAccessOptions');
    expect(workspaceSource).toContain('Se concederá acceso a');
  });

  it('keeps administrative notes private and revision based in the live People profile', () => {
    expect(workspaceSource).toContain('/admin-notes`');
    expect(workspaceSource).toContain('/admin-notes/clear`');
    expect(workspaceSource).toContain('Administración · privado');
    expect(workspaceSource).toContain('Cada guardado crea una nueva revisión auditable');
    expect(workspaceSource).toContain('Nunca guardes contraseñas, tokens, datos de tarjeta');
  });

  it('uses shared confirmation dialogs for relationship and invitation lifecycle actions', () => {
    expect(workspaceSource).toContain('<ConfirmDialog');
    expect(workspaceSource).toContain('Cerrar relación activa');
    expect(workspaceSource).toContain('Revocar acceso pendiente');
    expect(workspaceSource).not.toContain('window.confirm(');
    expect(workspaceSource).not.toContain('window.alert(');
    expect(workspaceSource).not.toContain('window.prompt(');
  });
});
