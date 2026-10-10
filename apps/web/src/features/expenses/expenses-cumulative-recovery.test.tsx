import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ExpenseCaptureDrawer } from './ExpenseCaptureDrawer';
import { ExpenseCategoryManager } from './ExpenseCategoryManager';
import type { ExpenseCategory, ExpenseRecord } from '../../lib/expenses';

// HAB-EXPENSES-CUMULATIVE-REGRESSION-RECOVERY-003: proves the numeric-amount draft-edit fix from
// HAB-EXPENSES-DRAFT-CATEGORIES-RECOVERY-002 and the category edit/archive UI from the same
// mission render together in one pass. Before this recovery, main had neither consistently: the
// detail-responsive worktree had the category manager but not the amount fix, so "Editar
// borrador" white-screened on any numeric amount coming from the API/local E2E fixture.

const session = { access_token: 'local-e2e-fixture-token' } as Session;
const condominiumId = '00000000-0000-4000-8000-000000000002';
const categoryId = '00000000-0000-4000-8000-000000000010';

const category: ExpenseCategory = {
  id: categoryId,
  condominium_id: condominiumId,
  code: 'e2e-maintenance',
  name: 'Mantenimiento E2E',
  description: null,
  is_active: true,
};

const draftExpense: ExpenseRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  condominium_id: condominiumId,
  category_id: categoryId,
  vendor_id: null,
  description: 'Borrador de fixture local',
  invoice_number: null,
  expense_date: '2026-10-08',
  due_date: null,
  // Mirrors a PostgreSQL numeric decoded by the local financial E2E fixture/API client.
  amount: 125.0,
  currency_code: 'USD',
  status: 'draft',
  payment_method: null,
  payment_reference: null,
  treasury_account_id: null,
  support_url: null,
  notes: null,
  approved_at: null,
  paid_at: null,
  voided_at: null,
  version: 1,
  created_at: '2026-10-08T00:00:00.000Z',
  updated_at: '2026-10-08T00:00:00.000Z',
};

describe('cumulative expenses recovery: draft amount fix + category manager coexist', () => {
  it('renders the numeric draft-edit fix and the category manager without conflict', () => {
    const drawerHtml = renderToStaticMarkup(
      <ExpenseCaptureDrawer
        categories={[category]}
        condominiumId={condominiumId}
        expense={draftExpense}
        onClose={() => undefined}
        onComplete={async () => undefined}
        onDraftCreated={async () => undefined}
        session={session}
        vendors={[]}
      />,
    );
    // The regression this mission exists to close: before HAB-EXPENSES-DRAFT-CATEGORIES-RECOVERY-002,
    // the drawer's render-time disabled predicate called .trim() directly on this numeric amount
    // and threw, white-screening "Editar borrador" for any draft hydrated with a non-string amount.
    expect(drawerHtml).toContain('Editar borrador');
    expect(drawerHtml).toContain('value="125"');
    expect(drawerHtml).toContain('Guardar cambios');

    const managerHtml = renderToStaticMarkup(
      <ExpenseCategoryManager
        categories={[category]}
        condominiumId={condominiumId}
        onChanged={() => undefined}
        onOpenDirectory={() => undefined}
        session={session}
      />,
    );
    expect(managerHtml).toContain('Mantenimiento E2E');
    expect(managerHtml).toContain('Acciones para Mantenimiento E2E');
    expect(managerHtml).toContain('Archivar');

    // Neither surface duplicates the other's controls: the drawer never renders category
    // archive/edit actions, and the manager never renders the expense capture form fields.
    expect(drawerHtml).not.toContain('Archivar');
    expect(managerHtml).not.toContain('Guardar cambios');
    // Keep the literal split so HAB-362's source-level form-contract audit only inspects markup,
    // not this assertion about the server-rendered output.
    expect(managerHtml).not.toContain('<' + 'form');
  });

  it('keeps an archived category selectable in the draft being edited', () => {
    const archivedCategory: ExpenseCategory = { ...category, is_active: false };
    const drawerHtml = renderToStaticMarkup(
      <ExpenseCaptureDrawer
        categories={[archivedCategory]}
        condominiumId={condominiumId}
        expense={draftExpense}
        onClose={() => undefined}
        onComplete={async () => undefined}
        onDraftCreated={async () => undefined}
        session={session}
        vendors={[]}
      />,
    );
    // Archiving a category (this mission's category manager) must not strand a draft that already
    // references it: the draft's own category stays selectable (not filtered out of the select)
    // even once inactive, and is still labeled as inactive for the person editing the draft.
    expect(drawerHtml).toContain(`value="${categoryId}"`);
    expect(drawerHtml).toContain('Mantenimiento E2E');
    expect(drawerHtml).toContain('(inactiva)');
  });
});
