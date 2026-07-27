import { useState } from 'react';
import type { AllocationInput, AllocationPreview, Receivable } from '../types';

export function PaymentAllocationEditor({
  receivables,
  paymentCurrency,
  onPreview,
  onApprove,
}: {
  receivables: Receivable[];
  paymentCurrency: string;
  onPreview: (allocations: AllocationInput[]) => Promise<AllocationPreview>;
  onApprove: (allocations: AllocationInput[]) => Promise<void>;
}) {
  const [allocations, setAllocations] = useState<AllocationInput[]>([]);
  const [preview, setPreview] = useState<AllocationPreview>();
  const add = (receivable: Receivable) =>
    setAllocations((current) => [
      ...current,
      {
        receivableItemId: receivable.id,
        paymentAmount: '',
        receivableAmount: '',
        paymentCurrencyCode: paymentCurrency,
        receivableCurrencyCode: receivable.currency_code,
      },
    ]);
  return (
    <div>
      <label>
        Obligación
        <select
          defaultValue=""
          onChange={(event) => {
            const value = receivables.find((item) => item.id === event.target.value);
            if (value && !allocations.some((item) => item.receivableItemId === value.id))
              add(value);
          }}
        >
          <option value="">Seleccionar</option>
          {receivables.map((item) => (
            <option key={item.id} value={item.id}>
              {item.description} · {item.currency_code}
            </option>
          ))}
        </select>
      </label>
      {allocations.map((allocation, index) => (
        <fieldset key={allocation.receivableItemId}>
          <input
            placeholder={`Monto ${paymentCurrency}`}
            value={allocation.paymentAmount}
            onChange={(event) =>
              setAllocations((current) =>
                current.map((item, position) =>
                  position === index ? { ...item, paymentAmount: event.target.value } : item,
                ),
              )
            }
          />
          <input
            placeholder={`Monto ${allocation.receivableCurrencyCode}`}
            value={allocation.receivableAmount}
            onChange={(event) =>
              setAllocations((current) =>
                current.map((item, position) =>
                  position === index ? { ...item, receivableAmount: event.target.value } : item,
                ),
              )
            }
          />
          {allocation.receivableCurrencyCode !== paymentCurrency && (
            <input
              placeholder="Tasa (10 decimales)"
              value={allocation.receivablePerPaymentRate ?? ''}
              onChange={(event) =>
                setAllocations((current) =>
                  current.map((item, position) =>
                    position === index
                      ? { ...item, receivablePerPaymentRate: event.target.value }
                      : item,
                  ),
                )
              }
            />
          )}
        </fieldset>
      ))}
      <button onClick={() => void onPreview(allocations).then(setPreview)}>Ejecutar preview</button>
      {preview && (
        <div>
          <p>Usado: {preview.total_used}</p>
          <p>Remanente: {preview.remaining}</p>
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {preview.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
          <button disabled={preview.errors.length > 0} onClick={() => void onApprove(allocations)}>
            Aprobar pago
          </button>
        </div>
      )}
    </div>
  );
}
