import { useMemo, useRef, useState } from 'react';
import {
  allocationReceivableAmount,
  isPositiveAllocationRate,
  isPositiveMoneyAmount,
  moneyExceeds,
} from '../allocation-amounts';
import { allocationPreviewFingerprint } from '../allocation-preview';
import type { AllocationInput, AllocationPreview, Receivable } from '../types';
import './PaymentAllocationEditor.css';

type PreviewSnapshot = {
  fingerprint: string;
  value: AllocationPreview;
};

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
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot>();
  const latestPreviewRequest = useRef(0);
  const receivableById = useMemo(
    () => new Map(receivables.map((receivable) => [receivable.id, receivable])),
    [receivables],
  );
  const currentFingerprint = useMemo(
    () => allocationPreviewFingerprint(allocations, paymentCurrency),
    [allocations, paymentCurrency],
  );
  const previewIsCurrent = previewSnapshot?.fingerprint === currentFingerprint;
  const preview = previewIsCurrent ? previewSnapshot?.value : undefined;
  const previewIsStale = Boolean(previewSnapshot && !previewIsCurrent);

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

  const updatePaymentAmount = (index: number, paymentAmount: string) =>
    setAllocations((current) =>
      current.map((item, position) =>
        position === index
          ? {
              ...item,
              paymentAmount,
              receivableAmount: allocationReceivableAmount({
                paymentAmount,
                paymentCurrency,
                receivableCurrency: item.receivableCurrencyCode,
                rate: item.receivablePerPaymentRate ?? '',
              }),
            }
          : item,
      ),
    );

  const updateRate = (index: number, receivablePerPaymentRate: string) =>
    setAllocations((current) =>
      current.map((item, position) =>
        position === index
          ? {
              ...item,
              receivablePerPaymentRate,
              receivableAmount: allocationReceivableAmount({
                paymentAmount: item.paymentAmount,
                paymentCurrency,
                receivableCurrency: item.receivableCurrencyCode,
                rate: receivablePerPaymentRate,
              }),
            }
          : item,
      ),
    );

  const allocationProblem = (allocation: AllocationInput): string | null => {
    const receivable = receivableById.get(allocation.receivableItemId);
    if (!receivable) return 'La obligación ya no está disponible.';
    if (!isPositiveMoneyAmount(allocation.paymentAmount)) {
      return `Ingresa un monto válido en ${paymentCurrency} con máximo 2 decimales.`;
    }
    if (
      allocation.receivableCurrencyCode !== paymentCurrency &&
      !isPositiveAllocationRate(allocation.receivablePerPaymentRate ?? '')
    ) {
      return `Ingresa una tasa válida: 1 ${paymentCurrency} = X ${allocation.receivableCurrencyCode}.`;
    }
    if (!isPositiveMoneyAmount(allocation.receivableAmount)) {
      return 'No se pudo derivar un monto válido para la obligación.';
    }
    if (
      receivable.outstanding_amount &&
      moneyExceeds(allocation.receivableAmount, receivable.outstanding_amount)
    ) {
      return `El monto aplicado supera el pendiente de ${receivable.outstanding_amount} ${receivable.currency_code}.`;
    }
    return null;
  };

  const readyForPreview =
    allocations.length > 0 && allocations.every((allocation) => !allocationProblem(allocation));

  const runPreview = async () => {
    const requestId = ++latestPreviewRequest.current;
    const requestedAllocations = allocations.map((allocation) => ({ ...allocation }));
    const requestedFingerprint = allocationPreviewFingerprint(
      requestedAllocations,
      paymentCurrency,
    );
    const value = await onPreview(requestedAllocations);
    if (requestId !== latestPreviewRequest.current) return;
    setPreviewSnapshot({ fingerprint: requestedFingerprint, value });
  };

  return (
    <div className="payments-allocation-editor">
      <label>
        Obligación
        <select
          onChange={(event) => {
            const nextId = event.target.value;
            setSelectedReceivableId(nextId);
            const value = receivableById.get(nextId);
            if (value && !allocations.some((item) => item.receivableItemId === value.id)) {
              add(value);
              setSelectedReceivableId('');
            }
          }}
          value={selectedReceivableId}
        >
          <option value="">Seleccionar obligación</option>
          {receivables.map((item) => (
            <option key={item.id} value={item.id}>
              {item.description} · Pendiente {item.outstanding_amount ?? '0.00'}{' '}
              {item.currency_code}
            </option>
          ))}
        </select>
      </label>
      {!receivables.length ? (
        <p className="payments-allocation-editor__empty">
          Esta unidad no tiene obligaciones pendientes disponibles para aplicar.
        </p>
      ) : null}
      {allocations.map((allocation, index) => {
        const receivable = receivableById.get(allocation.receivableItemId);
        const crossCurrency = allocation.receivableCurrencyCode !== paymentCurrency;
        const problem = allocationProblem(allocation);
        return (
          <fieldset key={allocation.receivableItemId}>
            <legend>
              <strong>{receivable?.description ?? 'Obligación'}</strong>
              <span>
                Pendiente {receivable?.outstanding_amount ?? '—'}{' '}
                {receivable?.currency_code ?? allocation.receivableCurrencyCode}
              </span>
            </legend>
            <label>
              Monto del pago ({paymentCurrency})
              <input
                inputMode="decimal"
                onChange={(event) => updatePaymentAmount(index, event.target.value)}
                pattern="^(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$"
                placeholder="0.00"
                value={allocation.paymentAmount}
              />
            </label>
            {crossCurrency ? (
              <label>
                Tasa de aplicación
                <span className="payments-allocation-editor__hint">
                  1 {paymentCurrency} = X {allocation.receivableCurrencyCode}
                </span>
                <input
                  inputMode="decimal"
                  onChange={(event) => updateRate(index, event.target.value)}
                  pattern="^(0|[1-9][0-9]{0,15})([.][0-9]{1,10})?$"
                  placeholder={`1 ${paymentCurrency} = … ${allocation.receivableCurrencyCode}`}
                  value={allocation.receivablePerPaymentRate ?? ''}
                />
              </label>
            ) : null}
            <div className="payments-allocation-editor__derived">
              <span>Monto que se aplicará ({allocation.receivableCurrencyCode})</span>
              <output aria-live="polite">{allocation.receivableAmount || '—'}</output>
              <small>
                {crossCurrency
                  ? 'Calculado automáticamente con la tasa indicada.'
                  : 'La misma moneda se aplica 1 a 1.'}
              </small>
            </div>
            {problem ? (
              <p className="payments-allocation-editor__problem" role="status">
                {problem}
              </p>
            ) : null}
            <button
              className="payments-allocation-editor__remove"
              onClick={() =>
                setAllocations((current) => current.filter((_, position) => position !== index))
              }
              type="button"
            >
              Quitar obligación
            </button>
          </fieldset>
        );
      })}
      <button disabled={!readyForPreview} onClick={() => void runPreview()} type="button">
        Previsualizar aplicación
      </button>
      {previewIsStale ? (
        <p role="status">Los cambios requieren una nueva previsualización antes de aprobar.</p>
      ) : null}
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
          <button
            disabled={preview.errors.length > 0}
            onClick={() => void onApprove(allocations)}
            type="button"
          >
            Aprobar pago
          </button>
        </div>
      )}
    </div>
  );
}
