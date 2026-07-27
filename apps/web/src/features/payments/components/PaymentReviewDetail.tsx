import type { Session } from '@supabase/supabase-js';
import { paymentApi, paymentProof } from '../api';
import type { AllocationInput, AllocationPreview, Payment, Receivable } from '../types';
import { PaymentAllocationEditor } from './PaymentAllocationEditor';

export function PaymentReviewDetail({
  condominiumId,
  payment,
  receivables,
  session,
  reload,
}: {
  condominiumId: string;
  payment: Payment;
  receivables: Receivable[];
  session: Session;
  reload: () => Promise<void>;
}) {
  const endpoint = `/v1/condominiums/${condominiumId}/payments/${payment.id}`;
  const transition = async (action: string, reason?: string) => {
    await paymentApi(`${endpoint}/${action}`, session, {
      method: 'POST',
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    });
    await reload();
  };
  return (
    <section>
      <h4>
        {payment.payer_name} · {payment.original_currency_code} {payment.original_amount}
      </h4>
      <button onClick={() => void transition('start-review')}>Iniciar revisión</button>
      <button
        onClick={() =>
          void paymentProof(`${endpoint}/proof`, session).then((blob) => {
            if (blob instanceof Blob) window.open(URL.createObjectURL(blob), '_blank');
          })
        }
      >
        Ver comprobante
      </button>
      <button
        onClick={() => {
          const reason = window.prompt('Motivo de corrección');
          if (reason) void transition('request-correction', reason);
        }}
      >
        Solicitar corrección
      </button>
      <button
        onClick={() => {
          const reason = window.prompt('Motivo de rechazo');
          if (reason) void transition('reject', reason);
        }}
      >
        Rechazar
      </button>
      <PaymentAllocationEditor
        receivables={receivables}
        paymentCurrency={payment.original_currency_code}
        onPreview={(allocations) =>
          paymentApi<AllocationPreview>(`${endpoint}/allocation-preview`, session, {
            method: 'POST',
            body: JSON.stringify({ allocations }),
          })
        }
        onApprove={async (allocations: AllocationInput[]) => {
          await paymentApi(`${endpoint}/approve`, session, {
            method: 'POST',
            body: JSON.stringify({ allocations }),
          });
          await reload();
        }}
      />
      {payment.status === 'approved' && (
        <button
          onClick={() => {
            const reason = window.prompt('Motivo del reverso');
            if (reason) void transition('reverse', reason);
          }}
        >
          Reversar
        </button>
      )}
    </section>
  );
}
