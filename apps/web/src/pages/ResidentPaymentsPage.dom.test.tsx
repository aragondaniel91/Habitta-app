// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResidentPaymentsPage } from './ResidentPaymentsPage';

const { api, proof, request } = vi.hoisted(() => ({
  api: vi.fn(),
  proof: vi.fn(),
  request: vi.fn(),
}));

vi.mock('../lib/api', () => ({ apiRequest: request }));
vi.mock('../features/payments/api', () => ({ paymentApi: api, paymentProof: proof }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = { access_token: 'test-token', user: { id: 'resident-1' } } as Session;

const paged = <T,>(items: T[]) => ({
  hasNextPage: false,
  hasPreviousPage: false,
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  totalPages: 1,
});

const payment = (status: 'submitted' | 'under_review') => ({
  id: `payment-${status}`,
  notes: 'Aplicar exactamente a las dos cuotas seleccionadas.',
  original_amount: '125.50',
  original_currency_code: 'USD',
  payer_name: 'Residente de prueba',
  payment_date: '2026-10-18',
  payment_method_id: 'method-1',
  reference: 'REF-125',
  status,
  submitted_by_user_id: 'resident-1',
  unit_id: 'unit-1',
});

const installPageResponses = (status: 'submitted' | 'under_review') => {
  const currentPayment = payment(status);
  request.mockImplementation(async (path: string) => {
    if (path.endsWith('/units')) return [{ building_id: null, code: 'A-101', id: 'unit-1' }];
    if (path.endsWith('/buildings')) return [];
    if (path.endsWith('/resident-financial-units')) {
      return [
        {
          can_submit_payment: true,
          currency_code: 'USD',
          net_outstanding: '125.50',
          overdue_amount: '0.00',
          total_credits: '0.00',
          total_debits: '125.50',
          unit_id: 'unit-1',
          upcoming_amount: '125.50',
        },
      ];
    }
    if (path.includes('/payment-methods?')) {
      return paged([
        {
          currency_code: 'USD',
          display_name: 'Transferencia bancaria',
          id: 'method-1',
          is_active: true,
          method_type: 'bank_transfer',
          requires_proof: true,
          requires_reference: true,
        },
      ]);
    }
    if (path.includes('/charge-concepts?')) return paged([]);
    if (path.includes('/receivables?')) {
      return paged([
        {
          currency_code: 'USD',
          description: 'Cuota de octubre',
          id: 'receivable-1',
          outstanding_amount: '75.25',
          unit_id: 'unit-1',
        },
        {
          currency_code: 'USD',
          description: 'Cuota extraordinaria',
          id: 'receivable-2',
          outstanding_amount: '50.25',
          unit_id: 'unit-1',
        },
      ]);
    }
    if (path.includes('/payments?')) return paged([currentPayment]);
    throw new Error(`Unexpected page request: ${path}`);
  });
  api.mockImplementation(async (path: string) => {
    if (path.endsWith(`/payments/${currentPayment.id}`)) return currentPayment;
    if (path.endsWith('/allocation-intent')) {
      return {
        payment_id: currentPayment.id,
        proposals: [
          {
            payment_amount: '75.25',
            payment_currency_code: 'USD',
            receivable_amount: '75.25',
            receivable_currency_code: 'USD',
            receivable_item_id: 'receivable-1',
          },
          {
            payment_amount: '50.25',
            payment_currency_code: 'USD',
            receivable_amount: '50.25',
            receivable_currency_code: 'USD',
            receivable_item_id: 'receivable-2',
          },
        ],
        updated_at: '2026-10-18T12:00:00.000Z',
      };
    }
    if (path.endsWith('/proof/history')) return [];
    throw new Error(`Unexpected payment request: ${path}`);
  });
  proof.mockResolvedValue(new Blob(['proof'], { type: 'image/png' }));
  return currentPayment;
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ResidentPaymentsPage payment details', () => {
  it.each(['submitted', 'under_review'] as const)(
    'opens the persisted %s payment through the real page and keeps it read-only',
    async (status) => {
      const currentPayment = installPageResponses(status);
      const createObjectURL = vi.fn(() => 'blob:payment-proof');
      const revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      const host = document.createElement('div');
      const root = createRoot(host);
      document.body.append(host);

      await act(async () => {
        root.render(
          <ResidentPaymentsPage
            condominiumId="condominium-1"
            condominiumName="Condominio de prueba"
            session={session}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(host.textContent).toContain('Ver detalle');
      await act(async () => {
        Array.from(host.querySelectorAll('button'))
          .find((button) => button.textContent === 'Ver detalle')
          ?.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(api).toHaveBeenCalledWith(
        `/v1/condominiums/condominium-1/payments/${currentPayment.id}`,
        session,
      );
      expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Detalle del pago');
      expect(host.textContent).toContain('REF-125');
      expect(host.textContent).toContain('Aplicar exactamente a las dos cuotas seleccionadas.');
      expect(host.textContent).toContain('Cuota de octubre');
      expect(host.textContent).toContain('Cuota extraordinaria');
      expect(host.textContent).toContain('75,25');
      expect(host.textContent).toContain('50,25');
      expect(host.textContent).toContain('Total propuesto:');
      expect(host.textContent).toContain('125,50');
      expect(proof).toHaveBeenCalledWith(
        `/v1/condominiums/condominium-1/payments/${currentPayment.id}/proof`,
        session,
      );
      expect(host.textContent).not.toContain('Solicitar corrección');
      expect(host.textContent).not.toContain('Aprobar pago');
      expect(host.querySelectorAll('input, textarea, select')).toHaveLength(0);

      act(() => root.unmount());
    },
  );
});
