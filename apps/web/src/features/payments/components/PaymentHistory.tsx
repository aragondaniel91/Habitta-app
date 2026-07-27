import type { Session } from '@supabase/supabase-js';
import type { Payment } from '../types';
import { PaymentProofUploader } from './PaymentProofUploader';

export function PaymentHistory({
  payments,
  condominiumId,
  session,
  onAction,
  onEdit,
  onReceipt,
}: {
  payments: Payment[];
  condominiumId: string;
  session: Session;
  onAction: (payment: Payment, action: 'submit') => Promise<void>;
  onEdit: (payment: Payment) => void;
  onReceipt: (payment: Payment) => void;
}) {
  if (!payments.length) return <p>Aún no hay pagos registrados.</p>;
  return (
    <div>
      {payments.map((payment) => (
        <article key={payment.id}>
          <strong>
            {payment.original_currency_code} {payment.original_amount}
          </strong>
          <span>
            {' '}
            · {payment.status} · {payment.payment_date}
          </span>
          <p>{payment.correction_reason ?? payment.rejection_reason ?? payment.reversal_reason}</p>
          {(payment.status === 'draft' || payment.status === 'correction_requested') && (
            <>
              <button onClick={() => onEdit(payment)}>Editar</button>
              <PaymentProofUploader
                condominiumId={condominiumId}
                paymentId={payment.id}
                session={session}
                onDone={() => undefined}
              />
              <button onClick={() => void onAction(payment, 'submit')}>Enviar</button>
            </>
          )}
          {(payment.status === 'approved' || payment.status === 'reversed') && (
            <button onClick={() => onReceipt(payment)}>Abrir recibo</button>
          )}
        </article>
      ))}
    </div>
  );
}
