import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const wrapperSource = readFileSync(
  new URL('./pages/GovernanceWorkspacePage.tsx', import.meta.url),
  'utf8',
);
const workspaceSource = readFileSync(
  new URL('./features/governance/AssembliesWorkspace.tsx', import.meta.url),
  'utf8',
);

describe('HAB-171 assemblies workspace contract', () => {
  it('keeps proposals and assemblies inside the same lazy governance module', () => {
    expect(appSource).toContain("import('./pages/GovernanceWorkspacePage')");
    expect(wrapperSource).toContain("import { GovernancePage } from './GovernancePage'");
    expect(wrapperSource).toContain('Propuestas y votaciones');
    expect(wrapperSource).toContain('Asambleas y actas');
  });

  it('uses the authenticated assemblies API for every lifecycle-sensitive mutation', () => {
    for (const route of [
      '/assemblies`,',
      '/transition`,',
      '/agenda`,',
      '/attendance`,',
      '/minutes`,',
      '/minutes/publish`,',
      '/resolutions`,',
      '/publish`,',
    ]) {
      expect(workspaceSource).toContain(route);
    }
    expect(workspaceSource).not.toContain('/rest/v1/');
    expect(workspaceSource).not.toContain('supabase.from(');
  });

  it('preserves governance manager gating and published-record immutability in the UI', () => {
    expect(workspaceSource).toContain('canManageGovernance');
    expect(workspaceSource).toContain('minutes_published_at');
    expect(workspaceSource).toContain('resolution.published_at');
    expect(workspaceSource).toContain('Iniciar y congelar elegibilidad');
    expect(workspaceSource).toContain('Quórum alcanzado');
  });
});
