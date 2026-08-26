import type { FormEvent } from 'react';
import type { PaymentMethod } from '../types';

export function PaymentMethodsSettings({
  methods,
  onCreate,
}: {
  methods: PaymentMethod[];
  onCreate: (value: Record<string, string | boolean>) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await onCreate({
      methodType: String(values.methodType),
      displayName: String(values.displayName),
      currencyCode: String(values.currencyCode),
      instructions: String(values.instructions ?? ''),
      requiresReference: values.requiresReference === 'on',
      requiresProof: values.requiresProof === 'on',
    });
    event.currentTarget.reset();
  };
  return (
    <details>
      <summary>Métodos de pago</summary>
      {methods.map((method) => (
        <p key={method.id}>
          {method.display_name} · {method.currency_code}
          <br />
          {method.instructions}
        </p>
      ))}
      <form className="ux-form" onSubmit={(event) => void submit(event)}>
        <select name="methodType">
          <option value="bank_transfer">Transferencia bancaria</option>
          <option value="pago_movil">Pago Móvil</option>
          <option value="zelle">Zelle</option>
          <option value="cash">Efectivo</option>
          <option value="other">Otro</option>
        </select>
        <input name="displayName" placeholder="Nombre visible" required />
        <select name="currencyCode">
          <option>USD</option>
          <option>VES</option>
        </select>
        <textarea name="instructions" placeholder="Instrucciones" />
        <label>
          <input name="requiresReference" type="checkbox" /> Exige referencia
        </label>
        <label>
          <input name="requiresProof" type="checkbox" /> Exige comprobante
        </label>
        <button>Crear método</button>
      </form>
    </details>
  );
}
