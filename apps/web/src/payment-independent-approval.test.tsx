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
  submitted_by_user_id: 'registrar-1',
  actor_names: { 'registrar-1': 'MarÃ­a Registradora' },
};

const renderReview = (canApprove: boolean) =>
  renderToStaticMarkup(
    <ReviewPayment
      condominiumId="condominium-1"
      onChanged={async () => undefined}
      payment={{ ...payment, can_approve: canApprove }}
      receivables={[]}
      session={{ access_token: 'token', user: { id: 'reviewer-2' } } as never}
    />,
  );

describe('independent payment approval review DOM', () => {
  it('shows the independent-review explanation and omits approval controls for the submitter', () => {
    const html = renderReview(false);

    expect(html).toContain('Requiere aprobaci');
    expect(html).toContain('Este pago debe aprobarlo otro revisor.');
    expect(html).not.toContain('payments-review__allocation');
    expect(html).toContain('Solicitar correcci');
    expect(html).toContain('Rechazar');
    expect(html).toContain('Pagador');
    expect(html).toContain('Registrado por');
    expect(html).toContain('MarÃ­a Registradora');
    expect(html).toContain('Próximo paso: otro revisor debe validar y aprobar este pago.');
  });

  it('labels the authenticated registrar with their authoritative session name', () => {
    const html = renderToStaticMarkup(
      <ReviewPayment
        condominiumId="condominium-1"
        onChanged={async () => undefined}
        payment={{
          ...payment,
          can_approve: true,
          submitted_by_user_id: 'reviewer-2',
          actor_names: { 'reviewer-2': 'MarÃ­a Revisora' },
        }}
        receivables={[]}
        session={
          {
            access_token: 'token',
            user: { id: 'reviewer-2', user_metadata: { full_name: 'Ana Actual' } },
          } as never
        }
      />,
    );

    expect(html).toContain('Registrado por');
    expect(html).toContain('Ana Actual');
    expect(html).not.toContain('>ti<');
    expect(html).not.toContain('usuario autorizado');
    expect(html).not.toContain('Pago enviado a validación');
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
