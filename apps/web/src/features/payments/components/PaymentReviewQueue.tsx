import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Payment, Receivable } from '../types';
import { PaymentReviewDetail } from './PaymentReviewDetail';

export function PaymentReviewQueue({
  condominiumId,
  payments,
  receivables,
  session,
  reload,
}: {
  condominiumId: string;
  payments: Payment[];
  receivables: Receivable[];
  session: Session;
  reload: () => Promise<void>;
}) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Payment>();
  const visible = payments.filter(
    (payment) =>
      !filter ||
      payment.status.includes(filter) ||
      payment.original_currency_code.includes(filter.toUpperCase()),
  );
  return (
    <section>
      <h3>Cola de revisión</h3>
      <input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filtrar por estado o moneda"
      />
      {visible.map((payment) => (
        <button key={payment.id} onClick={() => setSelected(payment)}>
          {payment.payer_name} · {payment.status} · {payment.original_currency_code}{' '}
          {payment.original_amount}
        </button>
      ))}
      {selected && (
        <PaymentReviewDetail
          condominiumId={condominiumId}
          payment={selected}
          receivables={receivables}
          session={session}
          reload={reload}
        />
      )}
    </section>
  );
}
