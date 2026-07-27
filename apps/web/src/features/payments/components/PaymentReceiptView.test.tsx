import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PaymentReceiptView } from './PaymentReceiptView';
import type { Payment, PaymentReceipt } from '../types';

const payment = {
  id: 'p',
  status: 'approved',
  original_amount: '100.00',
  original_currency_code: 'USD',
  payment_date: '2026-07-27',
  payer_name: 'Ada',
  unit_id: 'u',
  payment_method_id: 'm',
} as Payment;
const receipt = {
  receipt_number: 'REC-2026-000001',
  issued_at: '2026-07-27T00:00:00Z',
  snapshot: {
    condominium: { id: 'c', name: 'Habitta Norte' },
    unit: { id: 'u', code: 'A-1' },
    method: { display_name: 'Banco', currency_code: 'USD' },
    payment: { payer: 'Ada', amount: '100.00', currency_code: 'USD', date: '2026-07-27' },
    approval: { allocations: [], unapplied_credit: '100.00' },
  },
} as PaymentReceipt;

describe('PaymentReceiptView', () => {
  it('renders a normal printable receipt', () => {
    const html = renderToStaticMarkup(
      <PaymentReceiptView payment={payment} receipt={receipt} onClose={() => undefined} />,
    );
    expect(html).toContain('REC-2026-000001');
    expect(html).not.toContain('PAGO REVERSADO');
  });
  it('marks reversed payments clearly', () => {
    const html = renderToStaticMarkup(
      <PaymentReceiptView
        payment={{ ...payment, status: 'reversed' }}
        receipt={receipt}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain('PAGO REVERSADO');
  });
});
