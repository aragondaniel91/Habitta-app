import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Payment } from './features/payments/types';
import { ReviewPayment } from './pages/PaymentsDrawersCore';

const payment: Payment = {
  id: 'payment-1',
  status: 'under_review',
  original_amount: '25.00',
  original_currency_code: 'USD',
  payment_date: '2026-10-06',
  payer_name: 'Pago de prueba',
  unit_id: 'unit-1',
  payment_method_id: 'method-1',
};

const renderReview = (canApprove: boolean) =>
  renderToStaticMarkup(
    <ReviewPayment
      condominiumId="condominium-1"
      onChanged={async () => undefined}
      payment={{ ...payment, can_approve: canApprove }}
      receivables={[]}
      session={{ access_token: 'token' } as never}
    />,
  );

describe('independent payment approval review DOM', () => {
  it('shows the independent-review explanation and omits approval controls for the submitter', () => {
    const html = renderReview(false);

    expect(html).toContain('Requiere aprobaci');
    expect(html).toContain('Este pago fue registrado por ti y debe aprobarlo otro revisor.');
    expect(html).not.toContain('payments-review__allocation');
    expect(html).toContain('Solicitar correcci');
    expect(html).toContain('Rechazar');
  });

  it('renders approval controls for a distinct payment reviewer', () => {
    const html = renderReview(true);

    expect(html).toContain('payments-review__allocation');
    expect(html).toContain('Previsualizar aplicaci');
    expect(html).not.toContain('Requiere aprobaci');
  });

  it('renders approval controls for the one-person flow when no reviewer is configured', () => {
    const html = renderReview(true);

    expect(html).toContain('payments-review__allocation');
    expect(html).toContain('Previsualizar aplicaci');
  });
});
