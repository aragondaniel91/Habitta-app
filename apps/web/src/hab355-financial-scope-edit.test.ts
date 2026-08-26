import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const workspace = source('./features/receivables/RecurringDuesWorkspace.tsx');
const styles = source('./recurring-dues.css');
const apiRoutes = source('../../api/src/recurring-dues-routes.ts');
const migration = source(
  '../../../supabase/migrations/20260826010000_hab355_edit_financial_scopes.sql',
);

describe('HAB-355 financial scope edit experience', () => {
  it('replaces the create-only drawer with a catalog manager', () => {
    expect(workspace).toContain("scopeView === 'catalog'");
    expect(workspace).toContain('title="Ámbitos financieros"');
    expect(workspace).toContain('Nuevo ámbito');
    expect(workspace).toContain('openScopeCatalog');
    expect(workspace).toContain('Todavía no hay ámbitos financieros');
  });

  it('offers an explicit Edit affordance per scope', () => {
    expect(workspace).toContain('openEditScopeDrawer(scope)');
    expect(workspace).toContain(
      '>\n                        Editar\n                      </Button>',
    );
    expect(workspace).toContain('scopeFormFromScope');
  });

  it('reuses one form for create and edit with a prefilled draft', () => {
    expect(workspace).toContain(
      "title={editingScopeId ? 'Editar ámbito financiero' : 'Nuevo ámbito financiero'}",
    );
    expect(workspace).toContain('Guardar cambios');
    expect(workspace).toContain('Crear ámbito');
    expect(workspace).toContain('buildingId: scope.building_id ?? ');
    expect(workspace).toContain(
      '(scope.financial_scope_units ?? []).map((membership) => membership.unit_id)',
    );
  });

  it('sends the edit through the guarded PATCH contract', () => {
    expect(workspace).toContain(
      '`/v1/condominiums/${condominiumId}/financial-scopes/${editingScopeId}`',
    );
    expect(workspace).toContain("method: editing ? 'PATCH' : 'POST'");
    expect(workspace).toContain('...(editing ? { isActive: scopeForm.isActive } : {})');
    expect(apiRoutes).toContain("patch('/:id/financial-scopes/:scopeId'");
  });

  it('describes scopes with human labels instead of identifiers', () => {
    expect(workspace).toContain('describeScope');
    expect(workspace).toContain('unitReferenceLabel({');
    expect(workspace).toContain('scopeKindLabels[scope.kind]');
    // Identifiers may key a list or back a <option value>, but must never reach rendered text.
    expect(workspace).not.toMatch(/>\s*\{scope\.id\}/);
    expect(workspace).not.toMatch(/>\s*\{scope\.building_id\}/);
    expect(workspace).not.toMatch(/>\s*\{unit\.id\}/);
  });

  it('explains that edits are prospective and history keeps its snapshot', () => {
    expect(workspace).toContain(
      'Los cambios afectan períodos que todavía no han sido preparados. Los repartos ya revisados o publicados conservan su snapshot original.',
    );
  });

  it('blocks editing while a reviewed allocation is open and says why', () => {
    expect(workspace).toContain('scopesWithPendingReview');
    expect(workspace).toContain('disabled={blocked}');
    expect(workspace).toContain('Hay una cuota de este ámbito pendiente de revisión');
  });

  it('archives instead of deleting and keeps activation an edit-only decision', () => {
    expect(workspace).toContain('<option value="archived">Archivado</option>');
    expect(workspace).toContain('Un ámbito archivado deja de ofrecerse para nuevas cuotas');
    expect(workspace).not.toMatch(/method:\s*'DELETE'/);
    expect(workspace).toContain('{editingScopeId ? (');
  });

  it('keeps the scope actions reachable on narrow viewports', () => {
    expect(workspace).toContain('<FormActions sticky>');
    expect(styles).toContain('.recurring-dues-scope-list');
    expect(styles).toContain(
      '.recurring-dues-scope-list article {\n    grid-template-columns: 1fr;',
    );
  });

  it('never falls back to native browser dialogs', () => {
    expect(workspace).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('keeps published allocations out of reach of a scope edit', () => {
    expect(migration).toContain('financial scope has pending review run');
    expect(migration).toContain('active recurring plan requires financial scope');
    expect(migration).not.toMatch(/update\s+public\.recurring_charge_runs/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.receivable_/i);
  });
});
