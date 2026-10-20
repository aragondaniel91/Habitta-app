// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentApi, paymentProof } from '../features/payments/api';
import type { Payment } from '../features/payments/types';
import { ResidentPaymentsView } from './ResidentPaymentsView';
import { PaymentsDrawerHost, type PaymentsDrawerMode } from './PaymentsDrawers';

vi.mock('../features/payments/api', () => ({
  paymentApi: vi.fn(),
  paymentProof: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.mocked(paymentApi);
const proof = vi.mocked(paymentProof);
const session = { access_token: 'test-token', user: { id: 'resident-1' } } as Session;

const payment = (status: 'submitted' | 'under_review'): Payment => ({
  id: `payment-${status}`,
  status,
  original_amount: '125.50',
  original_currency_code: 'USD',
  payment_date: '2026-10-18',
  payer_name: 'Residente de prueba',
  payment_method_id: 'method-1',
  reference: 'REF-125',
  submitted_by_user_id: 'resident-1',
  unit_id: 'unit-1',
});

function ResidentPaymentDetailsHarness({ status }: { status: 'submitted' | 'under_review' }) {
  const [drawer, setDrawer] = useState<PaymentsDrawerMode>(null);
  const currentPayment = payment(status);

  return (
    <>
      <ResidentPaymentsView
        canRegisterPayment={false}
        condominiumName="Condominio de prueba"
        data={{
          methods: [
            {
              id: 'method-1',
              currency_code: 'USD',
              display_name: 'Transferencia bancaria',
              is_active: true,
              method_type: 'bank_transfer',
              requires_proof: true,
              requires_reference: true,
            },
          ],
          payments: [currentPayment],
          paymentsPage: {
            hasNextPage: false,
            hasPreviousPage: false,
            page: 1,
            pageSize: 50,
            total: 1,
            totalPages: 1,
          },
          receivables: [
            {
              id: 'receivable-1',
              currency_code: 'USD',
              description: 'Cuota de octubre',
              outstanding_amount: '125.50',
              unit_id: 'unit-1',
            },
          ],
          units: [{ building_id: null, code: 'A-101', id: 'unit-1' }],
        }}
        error=""
        financialRows={[]}
        loadingMorePayments={false}
        message=""
        onCurrencyChange={() => undefined}
        onLoadMore={() => undefined}
        onOpenPayment={() => setDrawer({ type: 'details', payment: currentPayment })}
        onRegisterPayment={() => undefined}
        onUnitChange={() => undefined}
        selectedCurrency="USD"
        selectedUnitId="unit-1"
        unitLabels={new Map([['unit-1', 'Unidad A-101']])}
        unitOptions={[{ id: 'unit-1', label: 'Unidad A-101' }]}
      />
      <PaymentsDrawerHost
        buildingNameById={{}}
        condominiumId="condominium-1"
        drawer={drawer}
        methods={[
          {
            id: 'method-1',
            currency_code: 'USD',
            display_name: 'Transferencia bancaria',
            is_active: true,
            method_type: 'bank_transfer',
            requires_proof: true,
            requires_reference: true,
          },
        ]}
        onChanged={async () => undefined}
        onClose={() => setDrawer(null)}
        receivables={[
          {
            id: 'receivable-1',
            currency_code: 'USD',
            description: 'Cuota de octubre',
            outstanding_amount: '125.50',
            unit_id: 'unit-1',
          },
        ]}
        session={session}
        units={[{ building_id: null, code: 'A-101', id: 'unit-1' }]}
      />
    </>
  );
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('resident submitted payment details', () => {
  it.each([
    ['submitted', true],
    ['under_review', true],
    ['submitted', false],
    ['under_review', false],
  ] as const)(
    'opens %s payment details with saved proposal=%s after the resident clicks Ver detalle',
    async (status, hasProposal) => {
      api.mockResolvedValue({
        payment_id: `payment-${status}`,
        proposals: hasProposal
          ? [
              {
                payment_amount: '125.50',
                payment_currency_code: 'USD',
                receivable_amount: '125.50',
                receivable_currency_code: 'USD',
                receivable_item_id: 'receivable-1',
              },
            ]
          : null,
        updated_at: '2026-10-18T12:00:00.000Z',
      } as never);
      proof.mockResolvedValue(new Blob(['proof'], { type: 'image/png' }));
      const createObjectURL = vi.fn(() => 'blob:payment-proof');
      const revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });

      const host = document.createElement('div');
      const root = createRoot(host);
      document.body.append(host);
      act(() => {
        root.render(<ResidentPaymentDetailsHarness status={status} />);
      });

      await act(async () => {
        Array.from(host.querySelectorAll('button'))
          .find((button) => button.textContent === 'Ver detalle')
          ?.click();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Detalle del pago');
      expect(host.querySelector('.payments-drawer--centered')).not.toBeNull();
      expect(host.textContent).toContain('Unidad');
      expect(host.textContent).toContain('Transferencia bancaria');
      expect(host.textContent).toContain('Total enviado');
      if (hasProposal) {
        expect(host.querySelector('table thead')?.textContent).toContain('Pendiente actual');
        expect(host.querySelector('table thead')?.textContent).toContain('Propuesto');
      }
      if (hasProposal) {
        expect(host.textContent).toContain('Cuota de octubre');
      } else {
        expect(host.textContent).toContain(
          'Este pago no tiene una distribución propuesta registrada.',
        );
      }
      expect(host.querySelector('img[alt="Comprobante del pago"]')).not.toBeNull();
      expect(api).toHaveBeenCalledWith(
        `/v1/condominiums/condominium-1/payments/payment-${status}/allocation-intent`,
        session,
      );
      expect(proof).toHaveBeenCalledWith(
        `/v1/condominiums/condominium-1/payments/payment-${status}/proof`,
        session,
      );
      expect(host.textContent).not.toContain('Iniciar revisión');
      expect(host.textContent).not.toContain('Solicitar corrección');
      expect(host.textContent).not.toContain('Rechazar');
      expect(host.textContent).not.toContain('Aprobar');

      act(() => root.unmount());
    },
  );
});
