import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { TreasuryPage } from './pages/TreasuryPage';
import './styles.css';
import './treasury.css';
import './brand-palette.css';

const accounts = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'Banco Mercantil USD',
    account_type: 'bank',
    currency_code: 'USD',
    bank_name: 'Banco Mercantil',
    account_reference: '**** 4821',
    notes: null,
    is_active: true,
    balance: '4850.75',
    latest_movement_at: '2026-08-05T14:00:00Z',
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-05T14:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'Caja menor USD',
    account_type: 'cash',
    currency_code: 'USD',
    bank_name: null,
    account_reference: null,
    notes: null,
    is_active: true,
    balance: '320.00',
    latest_movement_at: '2026-08-04T11:00:00Z',
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-04T11:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    name: 'Banco Nacional VES',
    account_type: 'bank',
    currency_code: 'VES',
    bank_name: 'Banco Nacional de Crédito',
    account_reference: '**** 9017',
    notes: null,
    is_active: true,
    balance: '148250.00',
    latest_movement_at: '2026-08-05T10:00:00Z',
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-05T10:00:00Z',
  },
];

const movements = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    condominium_id: '30000000-0000-0000-0000-000000000001',
    account_id: accounts[0]!.id,
    transfer_id: null,
    direction: 'credit',
    movement_kind: 'deposit',
    amount: '1250.00',
    currency_code: 'USD',
    occurred_on: '2026-08-05',
    description: 'Pagos de cuotas aprobados',
    reference: 'DEP-0805',
    source_type: 'payment',
    source_id: null,
    reversal_of: null,
    created_at: '2026-08-05T14:00:00Z',
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    condominium_id: '30000000-0000-0000-0000-000000000001',
    account_id: accounts[0]!.id,
    transfer_id: null,
    direction: 'debit',
    movement_kind: 'fee',
    amount: '12.50',
    currency_code: 'USD',
    occurred_on: '2026-08-05',
    description: 'Comisión bancaria mensual',
    reference: 'COM-08',
    source_type: 'manual',
    source_id: null,
    reversal_of: null,
    created_at: '2026-08-05T13:00:00Z',
  },
  {
    id: '20000000-0000-0000-0000-000000000003',
    condominium_id: '30000000-0000-0000-0000-000000000001',
    account_id: accounts[1]!.id,
    transfer_id: '40000000-0000-0000-0000-000000000001',
    direction: 'credit',
    movement_kind: 'transfer_in',
    amount: '200.00',
    currency_code: 'USD',
    occurred_on: '2026-08-04',
    description: 'Reposición de caja menor',
    reference: 'TRF-0804',
    source_type: 'transfer',
    source_id: '40000000-0000-0000-0000-000000000001',
    reversal_of: null,
    created_at: '2026-08-04T11:00:00Z',
  },
  {
    id: '20000000-0000-0000-0000-000000000004',
    condominium_id: '30000000-0000-0000-0000-000000000001',
    account_id: accounts[2]!.id,
    transfer_id: null,
    direction: 'debit',
    movement_kind: 'withdrawal',
    amount: '18500.00',
    currency_code: 'VES',
    occurred_on: '2026-08-03',
    description: 'Pago de mantenimiento del ascensor',
    reference: 'EG-1042',
    source_type: 'expense',
    source_id: null,
    reversal_of: null,
    created_at: '2026-08-03T10:00:00Z',
  },
];

const reconciliations = [
  {
    id: '50000000-0000-0000-0000-000000000001',
    condominium_id: '30000000-0000-0000-0000-000000000001',
    account_id: accounts[0]!.id,
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    statement_opening_balance: '3613.25',
    statement_closing_balance: '4850.75',
    book_closing_balance: null,
    difference: null,
    status: 'draft',
    notes: 'Pendiente de cierre al recibir el estado bancario definitivo.',
    closed_at: null,
    created_at: '2026-08-05T15:00:00Z',
  },
  {
    id: '50000000-0000-0000-0000-000000000002',
    condominium_id: '30000000-0000-0000-0000-000000000001',
    account_id: accounts[2]!.id,
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    statement_opening_balance: '120000.00',
    statement_closing_balance: '136750.00',
    book_closing_balance: '136750.00',
    difference: '0.00',
    status: 'closed',
    notes: null,
    closed_at: '2026-08-02T16:00:00Z',
    created_at: '2026-08-01T09:00:00Z',
  },
];

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    window.location.href,
  );
  if ((init?.method ?? 'GET') !== 'GET') return json({ id: crypto.randomUUID() }, 201);
  if (url.pathname.endsWith('/treasury/accounts')) return json(accounts);
  if (url.pathname.endsWith('/treasury/movements')) return json(movements);
  if (url.pathname.endsWith('/treasury/reconciliations')) return json(reconciliations);
  return json({ error: `Unexpected visual review request: ${url.pathname}` }, 404);
};

const session = {
  access_token: 'visual-review-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  refresh_token: 'visual-review-refresh',
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    app_metadata: {},
    user_metadata: { full_name: 'Daniel' },
    aud: 'authenticated',
    created_at: '2026-08-01T00:00:00Z',
  },
} as Session;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main style={{ background: '#f4f7fa', minHeight: '100vh', padding: 'clamp(16px, 3vw, 42px)' }}>
      <div style={{ margin: '0 auto', maxWidth: 1540 }}>
        <TreasuryPage
          condominiumId="30000000-0000-0000-0000-000000000001"
          condominiumName="Condominio Patricia"
          session={session}
        />
      </div>
    </main>
  </StrictMode>,
);
