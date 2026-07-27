import type { Payment } from '../types';
export function PaymentReceiptView({ payment }: { payment: Payment }) {
  return (
    <article>
      <h2>Recibo Habitta</h2>
      <p>
        {payment.original_currency_code} {payment.original_amount}
      </p>
    </article>
  );
}
