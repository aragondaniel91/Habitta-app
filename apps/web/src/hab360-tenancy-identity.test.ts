import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const panel = source('./features/settings/CondominiumIdentityPanel.tsx');
const settingsPage = source('./pages/SettingsPage.tsx');
const migration = source(
  '../../../supabase/migrations/20260826030000_hab360_edit_tenancy_identity.sql',
);

describe('HAB-360 correctable tenancy identity', () => {
  it('replaces the read-only identity block with an editable panel', () => {
    expect(settingsPage).toContain(
      "import { CondominiumIdentityPanel } from '../features/settings/CondominiumIdentityPanel'",
    );
    expect(settingsPage).toContain('<CondominiumIdentityPanel');
    expect(panel).toContain('Editar datos del condominio');
    expect(panel).toContain('Renombrar organización');
  });

  it('prefills the drawer from the stored profile', () => {
    expect(panel).toContain('formFromCondominium');
    expect(panel).toContain('condominium.legal_id_number ??');
    expect(panel).toContain('condominium.address_line1 ??');
    expect(panel).toContain('setForm(formFromCondominium(condominium))');
  });

  it('sends both corrections through the guarded endpoints', () => {
    expect(panel).toContain('`/v1/condominiums/${condominiumId}`');
    expect(panel).toContain('`/v1/organizations/${organization.id}`');
    expect(panel).toMatch(/method: 'PATCH'/);
    expect(panel).not.toMatch(/method:\s*'DELETE'/);
  });

  it('explains why these fields matter instead of showing a bare form', () => {
    expect(panel).toContain('recibos, certificados de solvencia y comunicaciones');
    expect(panel).toContain('el que Habitta pide escribir para confirmar una eliminación');
    expect(panel).toContain('Aparece en recibos y certificados.');
  });

  it('keeps structure out of an identity form', () => {
    expect(panel).toContain('La estructura de');
    expect(panel).not.toContain('propertyTopology');
    expect(panel).not.toContain('declaredBuildingCount');
  });

  it('uses the shared form contract with reachable actions', () => {
    expect(panel).toContain('<FormActions sticky>');
    expect(panel).toContain('Guardar cambios');
    expect(panel).toContain('<FormGrid>');
    expect(panel).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('guards the correction in the database, not only in the form', () => {
    expect(migration).toContain('can_manage_condominium_structure(target)');
    expect(migration).toContain('is_organization_owner(target)');
    expect(migration).toContain('condominium name already exists');
    expect(migration).toContain('invalid condominium timezone');
    expect(migration).not.toMatch(/update\s+public\.condominiums[\s\S]{0,400}organization_id\s*=/i);
  });
});
