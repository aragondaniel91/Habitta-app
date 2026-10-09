import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ExpenseCaptureDrawer } from './ExpenseCaptureDrawer';
import type { ExpenseRecord } from '../../lib/expenses';

const session = { access_token: 'local-e2e-fixture-token' } as Session;
const categoryId = '00000000-0000-4000-8000-000000000010';
const expense: ExpenseRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  condominium_id: '00000000-0000-4000-8000-000000000002',
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

describe('ExpenseCaptureDrawer draft edit regression', () => {
  it('renders the local-fixture numeric draft amount instead of white-screening', () => {
    // Before this recovery, the render-time disabled predicate called .trim() on this number.
    const html = renderToStaticMarkup(
      <ExpenseCaptureDrawer
        categories={[
          {
            id: categoryId,
            condominium_id: expense.condominium_id,
            code: 'E2E-MAINTENANCE',
            name: 'Mantenimiento E2E',
            description: null,
            is_active: true,
          },
        ]}
        condominiumId={expense.condominium_id}
        expense={expense}
        onClose={() => undefined}
        onComplete={async () => undefined}
        onDraftCreated={async () => undefined}
        session={session}
        vendors={[]}
      />,
    );

    expect(html).toContain('Editar borrador');
    expect(html).toContain('value="125"');
    expect(html).toContain('Guardar cambios');
  });
});
