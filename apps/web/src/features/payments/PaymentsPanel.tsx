import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { paymentApi } from './api';
import type { Payment, PaymentMethod, PaymentReceipt, Receivable } from './types';
import { PaymentSubmissionForm } from './components/PaymentSubmissionForm';
import { PaymentHistory } from './components/PaymentHistory';
import { PaymentReviewQueue } from './components/PaymentReviewQueue';
import { PaymentReceiptView } from './components/PaymentReceiptView';
import { PaymentMethodsSettings } from './components/PaymentMethodsSettings';

export function PaymentsPanel({
  condominiumId,
  units,
  session,
}: {
  condominiumId: string;
  units: { id: string; code: string }[];
  session: Session;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [queue, setQueue] = useState<Payment[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [editing, setEditing] = useState<Payment>();
  const [receipt, setReceipt] = useState<{ payment: Payment; value: PaymentReceipt }>();
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    if (!condominiumId) return;
    try {
      const [paymentRows, methodRows, receivableRows] = await Promise.all([
        paymentApi<Payment[]>(`/v1/condominiums/${condominiumId}/payments`, session),
        paymentApi<PaymentMethod[]>(`/v1/condominiums/${condominiumId}/payment-methods`, session),
        paymentApi<Receivable[]>(`/v1/condominiums/${condominiumId}/receivables`, session).catch(
          () => [],
        ),
      ]);
      setPayments(paymentRows);
      setMethods(methodRows);
      setReceivables(receivableRows);
      setQueue(
        await paymentApi<Payment[]>(
          `/v1/condominiums/${condominiumId}/payments/review-queue`,
          session,
        ).catch(() => []),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pagos');
    }
  }, [condominiumId, session]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (values: Record<string, string>) => {
    const path = editing
      ? `/v1/condominiums/${condominiumId}/payments/${editing.id}`
      : `/v1/condominiums/${condominiumId}/payments`;
    await paymentApi(path, session, {
      method: editing ? 'PATCH' : 'POST',
      body: JSON.stringify({
        ...values,
        ...(editing ? {} : { idempotencyKey: crypto.randomUUID() }),
      }),
    });
    setEditing(undefined);
    setMessage(editing ? 'Pago actualizado.' : 'Borrador creado.');
    await load();
  };

  return (
    <section className="people-panel">
      <h2>Pagos</h2>
      {message && <p>{message}</p>}
      <PaymentMethodsSettings
        methods={methods}
        onCreate={async (value) => {
          await paymentApi(`/v1/condominiums/${condominiumId}/payment-methods`, session, {
            method: 'POST',
            body: JSON.stringify(value),
          });
          await load();
        }}
      />
      <h3>{editing ? 'Editar pago' : 'Registrar pago'}</h3>
      <PaymentSubmissionForm
        units={units}
        methods={methods}
        {...(editing ? { payment: editing } : {})}
        onSave={save}
      />
      <h3>Historial</h3>
      <PaymentHistory
        payments={payments}
        condominiumId={condominiumId}
        session={session}
        onEdit={setEditing}
        onAction={async (payment) => {
          await paymentApi(
            `/v1/condominiums/${condominiumId}/payments/${payment.id}/submit`,
            session,
            { method: 'POST' },
          );
          await load();
        }}
        onReceipt={(payment) =>
          void paymentApi<PaymentReceipt>(
            `/v1/condominiums/${condominiumId}/payments/${payment.id}/receipt`,
            session,
          ).then((value) => setReceipt({ payment, value }))
        }
      />
      {queue.length > 0 && (
        <PaymentReviewQueue
          condominiumId={condominiumId}
          payments={queue}
          receivables={receivables}
          session={session}
          reload={load}
        />
      )}
      {receipt && (
        <PaymentReceiptView
          payment={receipt.payment}
          receipt={receipt.value}
          onClose={() => setReceipt(undefined)}
        />
      )}
    </section>
  );
}
