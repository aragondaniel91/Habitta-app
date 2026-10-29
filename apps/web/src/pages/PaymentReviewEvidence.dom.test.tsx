// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Payment } from '../features/payments/types';
import { PaymentsDrawerHost } from './PaymentsDrawers';

const { api, proof } = vi.hoisted(() => ({ api: vi.fn(), proof: vi.fn() }));

vi.mock('../features/payments/api', () => ({ paymentApi: api, paymentProof: proof }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = { access_token: 'test-token', user: { id: 'reviewer-1' } } as Session;
const payment: Payment = {
  can_approve: false,
  id: 'payment-1',
  notes: 'Transferencia dividida entre las cuotas pendientes.',
  original_amount: '125.50',
  original_currency_code: 'USD',
  payer_name: 'Residente de prueba',
  payment_date: '2026-10-18',
  payment_method_id: 'method-1',
  reference: 'TRANSFER-125',
  status: 'under_review',
  submitted_by_user_id: 'resident-1',
  unit_id: 'unit-1',
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('admin payment review evidence', () => {
  it('renders the submitted proof, reference, comment, and saved multi-charge proposal', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.endsWith('/proof/history')) return [];
      if (path.endsWith('/treasury/accounts')) return [];
      if (path.endsWith('/allocation-intent')) {
        return {
          payment_id: payment.id,
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
      throw new Error(`Unexpected review request: ${path}`);
    });
    proof.mockResolvedValue(new Blob(['proof'], { type: 'image/png' }));
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:payment-proof'),
      revokeObjectURL: vi.fn(),
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    await act(async () => {
      root.render(
        <PaymentsDrawerHost
          buildingNameById={{}}
          condominiumId="condominium-1"
          drawer={{ type: 'review', payment }}
          methods={[
            {
              currency_code: 'USD',
              display_name: 'Transferencia bancaria',
              id: 'method-1',
              is_active: true,
              method_type: 'bank_transfer',
              requires_proof: true,
              requires_reference: true,
            },
          ]}
          onChanged={async () => undefined}
          onClose={() => undefined}
          receivables={[
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
          ]}
          session={session}
          units={[{ building_id: null, code: 'A-101', id: 'unit-1' }]}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Revisar pago');
    expect(host.textContent).toContain('TRANSFER-125');
    expect(host.textContent).toContain('Transferencia dividida entre las cuotas pendientes.');
    expect(host.querySelector('img[alt="Comprobante del pago"]')).not.toBeNull();
    expect(host.textContent).toContain('Cuota de octubre');
    expect(host.textContent).toContain('Cuota extraordinaria');
    expect(host.textContent).toContain('75,25');
    expect(host.textContent).toContain('50,25');
    expect(host.textContent).toContain(
      'Es una guía para revisión; no ha aplicado ni registrado cargos.',
    );
    expect(api).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments/payment-1/allocation-intent',
      session,
    );
    expect(proof).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments/payment-1/proof',
      session,
    );
    expect(api.mock.calls.some(([path]) => String(path).endsWith('/approve'))).toBe(false);

    act(() => root.unmount());
  });
});
