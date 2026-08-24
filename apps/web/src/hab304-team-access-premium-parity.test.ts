import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './features/help/module-help';

const page = readFileSync(new URL('./pages/TeamAccessPage.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./team-access.css', import.meta.url), 'utf8');
const api = readFileSync(new URL('./lib/teamAccess.ts', import.meta.url), 'utf8');
const matrix = readFileSync(
  new URL('../../../docs/frontend/form-parity-matrix.md', import.meta.url),
  'utf8',
);

describe('HAB-304 premium Team & Access parity', () => {
  it('uses the shared PageHeader and shared form primitives for invitations', () => {
    expect(page).toContain('<PageHeader');
    expect(page).toContain("import { FormActions, FormGrid } from '../components/FormLayout'");
    expect(page).toContain('team-invitation-form ux-form');
    expect(page).toContain('<FormGrid>');
    expect(page).toContain('<FormActions>');
    expect(page).toContain('<Select');
    expect(styles).not.toContain('.team-access-overview');
  });

  it('keeps invitation delivery and member lifecycle security intact', () => {
    expect(page).toContain('createAdminInvitation({');
    expect(page).toContain('emailDelivery.status');
    expect(page).toContain('Enlace seguro de respaldo');
    expect(page).toContain('manageTeamMember({');
    expect(page).toContain('<ConfirmDialog');
    expect(api).toContain("client.rpc('manage_condominium_team_member'");
    expect(api).toContain('Debe permanecer al menos un administrador activo del condominio.');
  });

  it('keeps explicit access actions and history-preserving consequences', () => {
    expect(page).toContain('Guardar rol');
    expect(page).toContain('Suspender');
    expect(page).toContain('Reactivar');
    expect(page).toContain('Quitar acceso');
    expect(page).toContain('La cuenta global y el historial se conservaron');
    expect(page).toContain('Su cuenta global y el historial de acciones se conservarán.');
  });

  it('provides intentional responsive targets for team administration', () => {
    expect(styles).toContain('min-height: 48px');
    expect(styles).toContain('min-height: 44px');
    expect(styles).toContain('@media (max-width: 900px)');
    expect(styles).toContain('@media (max-width: 620px)');
    expect(styles).toContain('overflow-wrap: anywhere');
  });

  it('keeps contextual help aligned with invitation and lifecycle concepts', () => {
    const help = MODULE_HELP.team;
    expect(help.steps.join(' ')).toContain('Crear y enviar invitación');
    expect(help.steps.join(' ')).toContain('Guardar rol');
    expect(help.steps.join(' ')).toContain('Suspender');
    expect(help.steps.join(' ')).toContain('Reactivar');
    expect(help.result.join(' ')).toContain('trazabilidad histórica');
  });

  it('records Team & Access as certified in the parity matrix', () => {
    expect(matrix).toContain('| Equipo y accesos |');
  });
});
