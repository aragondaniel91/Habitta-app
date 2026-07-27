import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { paymentApi } from './api';
import type { Payment, PaymentMethod } from './types';
export function PaymentsPanel({
  condominiumId,
  units,
  session,
}: {
  condominiumId: string;
  units: { id: string; code: string }[];
  session: Session;
}) {
  const [payments, setPayments] = useState<Payment[]>([]),
    [methods, setMethods] = useState<PaymentMethod[]>([]),
    [message, setMessage] = useState('');
  const load = async () => {
    if (!condominiumId) return;
    const [p, m] = await Promise.all([
      paymentApi<Payment[]>(`/v1/condominiums/${condominiumId}/payments`, session),
      paymentApi<PaymentMethod[]>(`/v1/condominiums/${condominiumId}/payment-methods`, session),
    ]);
    setPayments(p);
    setMethods(m);
  };
  useEffect(() => {
    void load();
  }, [condominiumId, session.access_token]);
  return (
    <section className="people-panel">
      <h2>Pagos</h2>
      <p>{message}</p>
      <h3>Registrar pago</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await paymentApi(`/v1/condominiums/${condominiumId}/payments`, session, {
              method: 'POST',
              body: JSON.stringify({
                ...d,
                originalAmount: d.originalAmount,
                originalCurrencyCode: d.originalCurrencyCode,
                idempotencyKey: crypto.randomUUID(),
              }),
            });
            setMessage('Borrador creado.');
            await load();
          } catch (x) {
            setMessage(x instanceof Error ? x.message : 'Error');
          }
        }}
      >
        <select name="unitId">
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code}
            </option>
          ))}
        </select>
        <select name="paymentMethodId">
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name} · {m.currency_code}
            </option>
          ))}
        </select>
        <input name="paymentDate" type="date" required />
        <input
          name="originalAmount"
          inputMode="decimal"
          pattern="^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$"
          placeholder="0.00"
          required
        />
        <select name="originalCurrencyCode">
          <option>USD</option>
          <option>VES</option>
        </select>
        <input name="payerName" placeholder="Pagador" required />
        <input name="reference" placeholder="Referencia" />
        <textarea name="notes" placeholder="Notas" />
        <button>Guardar borrador</button>
      </form>
      <h3>Historial</h3>
      {payments.map((p) => (
        <article key={p.id}>
          <b>
            {p.original_currency_code} {p.original_amount}
          </b>{' '}
          · {p.status} · {p.payment_date}
          <p>{p.correction_reason ?? p.rejection_reason ?? p.reversal_reason}</p>
          {(p.status === 'draft' || p.status === 'correction_requested') && (
            <button
              onClick={() =>
                void paymentApi(
                  `/v1/condominiums/${condominiumId}/payments/${p.id}/submit`,
                  session,
                  { method: 'POST' },
                ).then(load)
              }
            >
              Enviar a revisión
            </button>
          )}
          {p.status === 'approved' && (
            <button
              onClick={() =>
                void paymentApi(
                  `/v1/condominiums/${condominiumId}/payments/${p.id}/receipt`,
                  session,
                ).then((x) => window.print())
              }
            >
              Ver recibo imprimible
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
