import type { FormEvent } from 'react';
import type { Payment, PaymentMethod } from '../types';

export function PaymentSubmissionForm({
  units,
  methods,
  payment,
  onSave,
}: {
  units: { id: string; code: string }[];
  methods: PaymentMethod[];
  payment?: Payment;
  onSave: (value: Record<string, string>) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>);
  };
  return (
    <form className="ux-form" onSubmit={(event) => void submit(event)}>
      {!payment && (
        <select name="unitId" required>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.code}
            </option>
          ))}
        </select>
      )}
      <select name="paymentMethodId" defaultValue={payment?.payment_method_id} required>
        {methods.map((method) => (
          <option key={method.id} value={method.id}>
            {method.display_name} · {method.currency_code}
          </option>
        ))}
      </select>
      <input name="paymentDate" type="date" defaultValue={payment?.payment_date} required />
      <input
        name="originalAmount"
        inputMode="decimal"
        pattern="^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$"
        defaultValue={payment?.original_amount}
        placeholder="0.00"
        required
      />
      <select name="originalCurrencyCode" defaultValue={payment?.original_currency_code ?? 'USD'}>
        <option>USD</option>
        <option>VES</option>
      </select>
      <input name="payerName" defaultValue={payment?.payer_name} placeholder="Pagador" required />
      <input name="reference" defaultValue={payment?.reference} placeholder="Referencia" />
      <textarea name="notes" defaultValue={payment?.notes} placeholder="Notas" />
      <button>{payment ? 'Guardar corrección' : 'Guardar borrador'}</button>
    </form>
  );
}
