import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const drawers = source('./features/treasury/TreasuryDrawers.tsx');
const page = source('./pages/TreasuryPage.tsx');
const api = source('./features/treasury/api.ts');
const migration = source(
  '../../../supabase/migrations/20260826040000_hab360_edit_treasury_account.sql',
);

describe('HAB-360 correctable treasury accounts', () => {
  it('offers an Edit affordance per account', () => {
    expect(page).toContain('setEditingAccountId(account.id)');
    expect(page).toContain('Editar');
    expect(page).toContain('const editingAccount = data.accounts.find(');
  });

  it('reuses one drawer for create and edit', () => {
    expect(drawers).toContain("title={editing ? 'Editar cuenta' : 'Nueva cuenta'}");
    expect(drawers).toContain(
      "{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cuenta'}",
    );
    expect(drawers).toContain("const [name, setName] = useState(account?.name ?? '')");
    expect(drawers).toContain("useState(account?.account_type ?? 'bank')");
  });

  it('routes the correction through the guarded PATCH', () => {
    expect(api).toContain('export const updateTreasuryAccount');
    expect(api).toContain('`${base(condominiumId)}/accounts/${accountId}`');
    expect(api).toContain("method: 'PATCH'");
    expect(page).toContain(
      'updateTreasuryAccount(condominiumId, session, editingAccount.id, input)',
    );
    expect(api).not.toMatch(/accounts\/\$\{accountId\}`[\s\S]{0,80}method: 'DELETE'/);
  });

  it('freezes currency and type once the account moved money, and says why', () => {
    expect(drawers).toContain('const hasMovements =');
    expect(drawers).toContain('disabled={hasMovements}');
    expect(drawers).toContain('la moneda y el tipo quedan fijos');
  });

  it('archives instead of deleting, only when editing', () => {
    expect(drawers).toContain('<option value="archived">Archivada</option>');
    expect(drawers).toContain('Una cuenta archivada deja de ofrecerse para nuevos movimientos');
    expect(drawers).toContain('{editing ? (');
    expect(drawers).not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
  });

  it('keeps the actions reachable with the shared form contract', () => {
    expect(drawers).toContain('<FormActions sticky>');
    expect(drawers).toContain('<FormGrid>');
  });

  it('enforces the same rules in the database, not only in the form', () => {
    expect(migration).toContain('treasury account has movements');
    expect(migration).toContain('treasury account still holds a balance');
    expect(migration).toContain('can_manage_treasury(target_condominium)');
    expect(migration).toContain('version = current_account.version + 1');
    expect(migration).not.toMatch(/delete\s+from\s+public\.treasury_/i);
  });
});
