import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../../../components/Dialog';
import { Button } from '../../../components/ui';
import {
  allocationReceivableAmount,
  isPositiveAllocationRate,
  isPositiveMoneyAmount,
  moneyExceeds,
  moneyValueString,
} from '../allocation-amounts';
import {
  approvalAllocations,
  previewIsCurrent,
  snapshotForLatestPreview,
  type AllocationPreviewSnapshot,
} from '../allocation-preview-state';
import type { AllocationInput, AllocationPreview, Receivable } from '../types';
import './PaymentAllocationEditor.css';

export function PaymentAllocationEditor({
  receivables,
  paymentCurrency,
  onPreview,
  onApprove,
  proposedAllocations,
}: {
  receivables: Receivable[];
  paymentCurrency: string;
  onPreview: (allocations: AllocationInput[]) => Promise<AllocationPreview>;
  onApprove: (allocations: AllocationInput[]) => Promise<void>;
  /** Immutable, resident-selected distribution. Manual editor is legacy-only. */
  proposedAllocations?: AllocationInput[] | undefined;
}) {
  const [allocations, setAllocations] = useState<AllocationInput[]>(
    () => proposedAllocations?.map((item) => ({ ...item })) ?? [],
  );
  const proposalMode = proposedAllocations !== undefined;
  const autoPreviewStarted = useRef(false);
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [previewSnapshot, setPreviewSnapshot] = useState<AllocationPreviewSnapshot>();
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const latestPreviewRequest = useRef(0);
  const receivableById = useMemo(
    () =>
      new Map(
        receivables.map((receivable) => [
          receivable.id,
          { ...receivable, outstanding_amount: moneyValueString(receivable.outstanding_amount) },
        ]),
      ),
    [receivables],
  );
  const currentPreviewIsCurrent = previewIsCurrent(previewSnapshot, allocations, paymentCurrency);
  const preview = currentPreviewIsCurrent ? previewSnapshot?.value : undefined;
  const previewIsStale = Boolean(previewSnapshot && !currentPreviewIsCurrent);

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

  const updatePaymentAmount = (index: number, paymentAmount: string) => {
    setPreviewError('');
    setApprovalError('');
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
  };

  const updateRate = (index: number, receivablePerPaymentRate: string) => {
    setPreviewError('');
    setApprovalError('');
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
  };

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
    if (previewing || saving) return;
    const requestId = ++latestPreviewRequest.current;
    const requestedAllocations = allocations.map((allocation) => ({ ...allocation }));
    setPreviewing(true);
    setPreviewError('');
    setApprovalError('');
    try {
      const value = await onPreview(requestedAllocations);
      const snapshot = snapshotForLatestPreview({
        latestRequestId: latestPreviewRequest.current,
        requestId,
        allocations: requestedAllocations,
        paymentCurrency,
        value,
      });
      if (snapshot) setPreviewSnapshot(snapshot);
    } catch (error) {
      if (requestId !== latestPreviewRequest.current) return;
      setPreviewError(
        error instanceof Error ? error.message : 'No se pudo previsualizar la aplicación.',
      );
    } finally {
      if (requestId === latestPreviewRequest.current) setPreviewing(false);
    }
  };

  // The resident already supplied the allocations: verify with the authoritative server
  // automatically, and never let an administrator change them silently.
  useEffect(() => {
    if (!proposalMode || autoPreviewStarted.current) return;
    autoPreviewStarted.current = true;
    if (readyForPreview) void runPreview();
  }, [proposalMode, readyForPreview]); // The editor is keyed by payment + intent version.

  const approve = async () => {
    if (saving || previewing) return;
    const previewedAllocations = approvalAllocations(previewSnapshot, allocations, paymentCurrency);
    if (!previewedAllocations) {
      setConfirmingApproval(false);
      setApprovalError(
        'La previsualización ya no coincide con la aplicación actual. Vuelve a previsualizar.',
      );
      return;
    }
    setSaving(true);
    setApprovalError('');
    try {
      await onApprove(previewedAllocations);
      setConfirmingApproval(false);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'No se pudo aprobar el pago.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="payments-allocation-editor">
      {!proposalMode ? (
        <label>
          Obligación
          <select
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedReceivableId(nextId);
              const value = receivableById.get(nextId);
              if (value && !allocations.some((item) => item.receivableItemId === value.id)) {
                setPreviewError('');
                setApprovalError('');
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
      ) : (
        <p className="payments-allocation-editor__empty" role="status">
          Distribución indicada por el residente. Habitta la comprueba con los saldos actuales; no
          tienes que seleccionar las obligaciones otra vez.
        </p>
      )}
      {!receivables.length && !proposalMode ? (
        <p className="payments-allocation-editor__empty">
          Esta unidad no tiene obligaciones pendientes disponibles para aplicar.
        </p>
      ) : null}
      {allocations.map((allocation, index) => {
        const receivable = receivableById.get(allocation.receivableItemId);
        const crossCurrency = allocation.receivableCurrencyCode !== paymentCurrency;
        const problem = allocationProblem(allocation);
        if (proposalMode) {
          return (
            <div className="payments-allocation-editor__derived" key={allocation.receivableItemId}>
              <strong>{receivable?.description ?? 'Obligación registrada'}</strong>
              <span>
                Pendiente actual: {receivable?.outstanding_amount ?? '—'}{' '}
                {receivable?.currency_code ?? allocation.receivableCurrencyCode}
              </span>
              <output>
                Aplicar {allocation.paymentAmount} {allocation.paymentCurrencyCode}
              </output>
              {problem ? (
                <p className="payments-allocation-editor__problem" role="alert">
                  {problem}
                </p>
              ) : null}
            </div>
          );
        }
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
            <Button
              className="payments-allocation-editor__remove"
              disabled={previewing || saving}
              onClick={() => {
                setPreviewError('');
                setApprovalError('');
                setAllocations((current) => current.filter((_, position) => position !== index));
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Quitar obligación
            </Button>
          </fieldset>
        );
      })}
      <Button
        disabled={!readyForPreview || previewing || saving}
        onClick={() => void runPreview()}
        type="button"
        variant="secondary"
      >
        {previewing
          ? 'Verificando propuesta…'
          : proposalMode
            ? 'Verificar nuevamente'
            : 'Previsualizar aplicación'}
      </Button>
      {proposalMode && previewing ? (
        <p role="status">Validando automáticamente los importes propuestos…</p>
      ) : null}
      {previewIsStale ? (
        <p role="status">Los cambios requieren una nueva previsualización antes de aprobar.</p>
      ) : null}
      {previewError ? (
        <p className="payments-allocation-editor__problem" role="alert">
          {previewError}
        </p>
      ) : null}
      {approvalError ? (
        <p className="payments-allocation-editor__problem" role="alert">
          {approvalError}
        </p>
      ) : null}
      {preview && (
        <div>
          <p>Usado: {preview.total_used}</p>
          <p>Remanente: {preview.remaining}</p>
          {preview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {preview.errors.map((error) => (
            <p key={error} role="alert">
              {error}
            </p>
          ))}
          <Button
            disabled={preview.errors.length > 0 || saving || previewing}
            onClick={() => setConfirmingApproval(true)}
            type="button"
          >
            {saving ? 'Aprobando…' : 'Aprobar pago'}
          </Button>
        </div>
      )}
      {confirmingApproval && preview ? (
        <ConfirmDialog
          busy={saving}
          busyLabel="Aprobando…"
          confirmLabel="Confirmar aprobación"
          description="Se registrará la aplicación previsualizada y cualquier remanente como crédito no aplicado."
          onCancel={() => setConfirmingApproval(false)}
          onConfirm={() => void approve()}
          title="Confirmar aprobación del pago"
        >
          <p>Usado: {preview.total_used}</p>
          <p>Remanente: {preview.remaining}</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
