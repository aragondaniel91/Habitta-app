import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const teamAccess = source('./lib/teamAccess.ts');
const page = source('./pages/TeamAccessPage.tsx');
const css = source('./team-access.css');
const migration = source(
  '../../../supabase/migrations/20260826080000_hab361_team_role_null_guards.sql',
);

describe('HAB-361 administrative role guards', () => {
  it('rejects a null role instead of letting it reach the write', () => {
    // `null not in (...)` is null, so the null test has to be explicit in both role RPCs.
    const guards = migration.match(/target_role is null\s*\n?\s*or target_role not in \(/g) ?? [];
    expect(guards).toHaveLength(2);
    expect(migration).toContain('create or replace function public.manage_condominium_team_member');
    expect(migration).toContain('create or replace function public.create_admin_invitation');
  });

  it('keeps the last-administrator rule and the permission check intact', () => {
    expect(migration).toContain('last condominium administrator required');
    expect(migration).toContain('condominium administrator required');
    expect(migration).toContain('set row_security = off');
    expect(migration).not.toMatch(/drop\s+(function|constraint|policy|trigger)/i);
  });

  it('translates the last-administrator rule before the permission message it contains', () => {
    const specific = teamAccess.indexOf("includes('last condominium administrator required')");
    const generic = teamAccess.indexOf("includes('administrator required')");
    expect(specific).toBeGreaterThan(-1);
    expect(generic).toBeGreaterThan(-1);
    // 'administrator required' is a substring of the specific rule, so order decides correctness.
    expect(specific).toBeLessThan(generic);
    expect(teamAccess).toContain(
      'Debe permanecer al menos un administrador activo del condominio.',
    );
  });

  it('explains the last-administrator rule instead of offering an action that must fail', () => {
    expect(page).toContain('const activeAdministrators = useMemo(');
    expect(page).toContain("member.role === 'condominium_admin'");
    expect(page).toContain('activeAdministrators <= 1');
    expect(page).toContain('busy || selectedRole === member.role || wouldRemoveLastAdministrator');
    expect(page).toContain('busy || isLastAdministrator');
    expect(page).toContain('className="team-member-hint"');
    expect(page).toContain('Este es el único administrador activo del condominio.');
    expect(page).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('styles the hint with the shared tokens rather than new hard-coded values', () => {
    const hintStart = css.indexOf('.team-member-hint');
    expect(hintStart).toBeGreaterThan(-1);
    const hint = css.slice(hintStart, css.indexOf('}', hintStart));
    expect(hint).toContain('color: var(--muted)');
    expect(hint).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
