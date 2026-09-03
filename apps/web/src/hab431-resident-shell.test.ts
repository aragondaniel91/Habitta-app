import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync(new URL('./components/AppShell.tsx', import.meta.url), 'utf8');
const roles = readFileSync(new URL('./lib/roles.ts', import.meta.url), 'utf8');

describe('HAB-431 pure resident sessions use a resident-facing shell', () => {
  it('derives resident presentation from the existing resident-only role predicate', () => {
    expect(shell).toContain('usesResidentDashboard(roles)');
    expect(roles).toContain(
      'return roles.length > 0 && roles.every((role) => RESIDENT_ROLES.includes(role));',
    );
  });

  it('uses resident language without changing route paths or authorization', () => {
    expect(shell).toContain('residentOnly ? currentRoute.shortLabel : currentRoute.label');
    expect(shell).toContain('residentOnly ? route.shortLabel : route.label');
    expect(shell).toContain("principal: 'Mi hogar'");
    expect(shell).toContain("finanzas: 'Mi cuenta'");
    expect(shell).toContain("sistema: 'Cuenta'");
    expect(shell).toContain("residentOnly ? 'Mi comunidad' : 'Condominio'");
  });

  it('does not render empty administrative navigation sections', () => {
    expect(shell).toContain('if (!routes.length) return null;');
  });

  it('hides condominium creation from a pure resident shell only', () => {
    expect(shell).toContain('!residentOnly ? (');
    expect(shell).toContain('className="condo-switcher__add"');
    expect(shell).toContain('+ Agregar condominio');
  });

  it('keeps the same desktop and mobile navigation source of truth', () => {
    expect(shell).toContain('{navContent()}');
    expect(shell).toContain('{navContent(true)}');
    expect(shell).toContain("residentOnly ? 'Tu comunidad' : 'Gestión de condominios'");
  });
});
