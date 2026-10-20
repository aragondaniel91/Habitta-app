import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useDialogBehavior } from '../components/Drawer';
import { PaymentsIcon } from '../components/icons';
import { Badge, Button, Field, Select } from '../components/ui';
import { paymentApi, paymentProof } from '../features/payments/api';
import { paymentProofFileError } from '../features/payments/proof-file';
import { PaymentAllocationEditor } from '../features/payments/components/PaymentAllocationEditor';
import { resolveResidentProposal } from '../features/payments/resident-proposal-approval';
import { moneyValueString } from '../features/payments/allocation-amounts';
import { PaymentProofPreview } from '../features/payments/components/PaymentProofPreview';
import { PaymentProofUploader } from '../features/payments/components/PaymentProofUploader';
import {
  paymentActorLabel,
  type AllocationInput,
  type AllocationPreview,
  type Payment,
  type PaymentAllocationIntent,
  type PaymentMethod,
  type PaymentReceipt,
  type Receivable,
} from '../features/payments/types';
import type { TreasuryAccount } from '../features/treasury/types';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import { paymentStatusLabels, paymentStatusTone } from '../lib/payments';
import { unitReferenceLabel } from '../lib/unit-domain';

export type PaymentsDrawerMode =
  | { type: 'create' }
  | { type: 'edit'; payment: Payment }
  | { type: 'review'; payment: Payment }
  | { type: 'details'; payment: Payment }
  | { type: 'receipt'; payment: Payment; receipt: PaymentReceipt }
  | { type: 'methods' }
  | null;

type Unit = { id: string; code: string; building_id: string | null };

type Props = {
  condominiumId: string;
  session: Session;
  units: Unit[];
  buildingNameById: Record<string, string>;
  methods: PaymentMethod[];
  receivables: Receivable[];
  drawer: PaymentsDrawerMode;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
};

function DrawerFrame({
  eyebrow,
  title,
  description,
  icon,
  onClose,
  centered = true,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  onClose: () => void;
  centered?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const [closeDisabled, setCloseDisabled] = useState(false);

  useEffect(() => {
    const element = panel.current;
    if (!element) return undefined;
    const updateBusy = () =>
      setCloseDisabled(Boolean(element.querySelector('[data-busy="true"],[aria-busy="true"]')));
    updateBusy();
    const observer = new MutationObserver(updateBusy);
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['aria-busy', 'data-busy'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  useDialogBehavior(panel, onClose, closeDisabled);

  return (
    <div
      className={`payments-drawer-layer${centered ? ' payments-drawer-layer--centered' : ''}`}
      role="presentation"
    >
      <button
        aria-label="Cerrar panel"
        className="payments-drawer-backdrop"
        disabled={closeDisabled}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={title}
        aria-modal="true"
        className={`payments-drawer${centered ? ' payments-drawer--centered' : ''}`}
        ref={panel}
        role="dialog"
        tabIndex={-1}
      >
        <header className="payments-drawer__header">
          <div className="payments-drawer__icon">{icon}</div>
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button
            aria-label="Cerrar"
            className="payments-drawer__close"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="payments-drawer__body">{children}</div>
      </aside>
    </div>
  );
}

function PaymentForm({
  condominiumId,
  session,
  units,
  buildingNameById,
  methods,
  payment,
  onChanged,
}: {
  condominiumId: string;
  session: Session;
  units: Unit[];
  buildingNameById: Record<string, string>;
  methods: PaymentMethod[];
  payment?: Payment;
  onChanged: (message: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState(
    payment?.payment_method_id ?? methods[0]?.id ?? '',
  );
  const selectedMethod = methods.find((method) => method.id === selectedMethodId);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<
        string,
        string
      >;
      const path = payment
        ? `/v1/condominiums/${condominiumId}/payments/${payment.id}`
        : `/v1/condominiums/${condominiumId}/payments`;
      await paymentApi(path, session, {
        method: payment ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...values,
          ...(payment ? {} : { idempotencyKey: crypto.randomUUID() }),
        }),
      });
      await onChanged(payment ? 'Pago actualizado.' : 'Borrador de pago creado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el pago.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="payments-form ux-form" onSubmit={(event) => void submit(event)}>
      {message ? <div className="payments-form__message">{message}</div> : null}
      {!methods.length ? (
        <div className="payments-form__notice">
          Crea un método de pago antes de registrar movimientos.
        </div>
      ) : null}
      {!payment ? (
        <Field label="Unidad">
          <Select name="unitId" required>
            <option value="">Seleccionar unidad</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unitReferenceLabel({
                  code: unit.code,
                  buildingName: unit.building_id
                    ? (buildingNameById[unit.building_id] ?? null)
                    : null,
                })}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Método de pago" hint={selectedMethod?.instructions}>
        <Select
          name="paymentMethodId"
          onChange={(event) => setSelectedMethodId(event.target.value)}
          required
          value={selectedMethodId}
        >
          <option value="">Seleccionar método</option>
          {methods
            .filter((method) => method.is_active)
            .map((method) => (
              <option key={method.id} value={method.id}>
                {method.display_name} · {method.currency_code}
              </option>
            ))}
        </Select>
      </Field>
      <div className="payments-form__grid">
        <Field label="Fecha del pago">
          <input
            className="input"
            defaultValue={payment?.payment_date}
            name="paymentDate"
            required
            type="date"
          />
        </Field>
        <Field label="Moneda">
          <Select
            defaultValue={payment?.original_currency_code ?? selectedMethod?.currency_code ?? 'USD'}
            name="originalCurrencyCode"
          >
            <option>USD</option>
            <option>VES</option>
          </Select>
        </Field>
      </div>
      <Field label="Monto">
        <input
          className="input"
          defaultValue={payment?.original_amount}
          inputMode="decimal"
          name="originalAmount"
          pattern="^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$"
          placeholder="0.00"
          required
        />
      </Field>
      <Field label="Nombre del pagador">
        <input
          className="input"
          defaultValue={payment?.payer_name}
          name="payerName"
          placeholder="Nombre y apellido"
          required
        />
      </Field>
      <Field
        label="Referencia"
        hint={selectedMethod?.requires_reference ? 'Obligatoria para este método.' : 'Opcional.'}
      >
        <input
          className="input"
          defaultValue={payment?.reference}
          name="reference"
          required={selectedMethod?.requires_reference}
        />
      </Field>
      <Field label="Notas internas">
        <textarea
          className="payments-textarea"
          defaultValue={payment?.notes}
          name="notes"
          placeholder="Contexto adicional para la revisión"
        />
      </Field>
      <footer className="payments-form__footer">
        <Button disabled={saving || !methods.length} type="submit">
          {saving ? 'Guardando…' : payment ? 'Guardar corrección' : 'Guardar borrador'}
        </Button>
      </footer>
    </form>
  );
}

export function ReviewPayment({
  condominiumId,
  session,
  payment,
  receivables,
  methods = [],
  onChanged,
  readOnly = false,
  unitLabel,
  onClose,
}: {
  condominiumId: string;
  session: Session;
  payment: Payment;
  receivables: Receivable[];
  methods?: PaymentMethod[];
  onChanged: (message: string) => Promise<void>;
  readOnly?: boolean;
  unitLabel?: string;
  onClose?: () => void;
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccount[]>([]);
  const [treasuryLoading, setTreasuryLoading] = useState(true);
  const [allocationIntent, setAllocationIntent] = useState<PaymentAllocationIntent | null>(null);
  const [allocationIntentLoading, setAllocationIntentLoading] = useState(true);
  const [allocationIntentError, setAllocationIntentError] = useState('');
  const [allocationIntentRetry, setAllocationIntentRetry] = useState(0);
  const [proofHistory, setProofHistory] = useState<
    Array<{
      id: string;
      original_filename: string;
      created_at: string;
      superseded_at: string | null;
    }>
  >([]);
  const [proofVersion, setProofVersion] = useState(0);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [replacementMessage, setReplacementMessage] = useState('');
  const [selectedTreasuryAccountId, setSelectedTreasuryAccountId] = useState(
    payment.treasury_account_id ?? '',
  );
  const endpoint = `/v1/condominiums/${condominiumId}/payments/${payment.id}`;
  const canApprove = payment.can_approve === true;
  const independentApprovalTitle = 'Requiere aprobaci\u00f3n de otro revisor';
  const method = methods.find((item) => item.id === payment.payment_method_id);
  const mayReplaceProof =
    readOnly &&
    payment.submitted_by_user_id === session.user.id &&
    ['submitted', 'under_review'].includes(payment.status);
  const replaceProof = async () => {
    if (!mayReplaceProof || !replacementFile || replacementBusy) return;
    setReplacementBusy(true);
    setReplacementMessage('');
    try {
      await paymentProof(`${endpoint}/proof`, session, replacementFile);
      setProofVersion((revision) => revision + 1);
      setReplacementFile(null);
      setReplacementMessage(
        'Comprobante actualizado. Se conservó la versión anterior en el historial.',
      );
    } catch (cause) {
      setReplacementMessage(
        cause instanceof Error ? cause.message : 'No se pudo reemplazar el comprobante.',
      );
    } finally {
      setReplacementBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    setProofHistory([]);
    paymentApi<typeof proofHistory>(`${endpoint}/proof/history`, session)
      .then((rows) => {
        if (active) setProofHistory(rows);
      })
      .catch(() => {
        if (active) setProofHistory([]);
      });
    return () => {
      active = false;
    };
  }, [endpoint, session, proofVersion]);

  useEffect(() => {
    let active = true;
    setAllocationIntentLoading(true);
    setAllocationIntentError('');
    setAllocationIntent(null);
    paymentApi<PaymentAllocationIntent | null>(
      `/v1/condominiums/${condominiumId}/payments/${payment.id}/allocation-intent`,
      session,
    )
      .then((intent) => {
        if (active) setAllocationIntent(intent);
      })
      .catch(() => {
        if (active) {
          setAllocationIntent(null);
          setAllocationIntentError(
            'No se pudo verificar la propuesta. No se permite la asignación manual sin comprobar si existe.',
          );
        }
      })
      .finally(() => {
        if (active) setAllocationIntentLoading(false);
      });
    return () => {
      active = false;
    };
  }, [condominiumId, payment.id, session, allocationIntentRetry]);

  useEffect(() => {
    // Residents only inspect a submitted payment here. Do not probe the treasury surface merely
    // to render a read-only proof/reference detail.
    if (readOnly) {
      setTreasuryLoading(false);
      return undefined;
    }
    let active = true;
    setTreasuryLoading(true);
    paymentApi<TreasuryAccount[]>(`/v1/condominiums/${condominiumId}/treasury/accounts`, session)
      .then((accounts) => {
        if (!active) return;
        const matching = accounts.filter(
          (account) =>
            account.is_active && account.currency_code === payment.original_currency_code,
        );
        setTreasuryAccounts(matching);
        setSelectedTreasuryAccountId((current) => {
          if (current && matching.some((account) => account.id === current)) return current;
          if (
            payment.treasury_account_id &&
            matching.some((account) => account.id === payment.treasury_account_id)
          ) {
            return payment.treasury_account_id;
          }
          return matching.length === 1 ? matching[0]!.id : '';
        });
      })
      .catch(() => {
        if (!active) return;
        setTreasuryAccounts([]);
        setMessage('No se pudieron cargar las cuentas de tesorería.');
      })
      .finally(() => {
        if (active) setTreasuryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    condominiumId,
    payment.id,
    payment.original_currency_code,
    payment.treasury_account_id,
    readOnly,
    session,
  ]);

  const transition = async (action: string, nextMessage: string, includeReason = false) => {
    if (processingAction) return;
    setProcessingAction(action);
    setMessage('');
    try {
      await paymentApi(`${endpoint}/${action}`, session, {
        method: 'POST',
        ...(includeReason ? { body: JSON.stringify({ reason }) } : {}),
      });
      await onChanged(nextMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el pago.');
    } finally {
      setProcessingAction(null);
    }
  };

  const selectTreasuryAccountBeforeApproval = async () => {
    if (treasuryLoading) throw new Error('Espera a que carguen las cuentas de tesorería.');
    if (treasuryAccounts.length > 0 && !selectedTreasuryAccountId) {
      throw new Error('Selecciona la cuenta de tesorería que recibirá este pago.');
    }
    if (!selectedTreasuryAccountId) return;
    await paymentApi(
      `/v1/condominiums/${condominiumId}/treasury/payments/${payment.id}/account`,
      session,
      {
        method: 'POST',
        body: JSON.stringify({ accountId: selectedTreasuryAccountId }),
      },
    );
  };

  const proposals = allocationIntent?.proposals ?? [];
  const resolvedProposal =
    !allocationIntentLoading && !allocationIntentError
      ? resolveResidentProposal({
          intent: allocationIntent,
          paymentId: payment.id,
          paymentAmount: payment.original_amount,
          paymentCurrency: payment.original_currency_code,
          receivables,
        })
      : null;
  const totalCents = proposals.reduce((total, proposal) => {
    const value = moneyValueString(proposal.payment_amount);
    if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) return total;
    const [whole, fraction = ''] = value.split('.');
    return total + BigInt(whole ?? 0) * 100n + BigInt(fraction.padEnd(2, '0'));
  }, 0n);
  const totalProposed = `${totalCents / 100n}.${(totalCents % 100n).toString().padStart(2, '0')}`;

  if (readOnly) {
    const summary = [
      { label: 'Unidad', value: unitLabel ?? 'Unidad registrada' },
      { label: 'Método', value: method?.display_name ?? 'Método registrado' },
      { label: 'Referencia', value: payment.reference || 'Sin referencia' },
      { label: 'Fecha', value: formatDashboardDate(payment.payment_date) },
      { label: 'Pagador', value: payment.payer_name },
      {
        label: 'Total enviado',
        value: formatDashboardAmount(payment.original_amount, payment.original_currency_code),
      },
    ];
    return (
      <div className="payments-detail">
        <div className="payments-detail__status">
          <Badge tone={paymentStatusTone(payment.status)}>
            {paymentStatusLabels[payment.status] ?? payment.status}
          </Badge>
        </div>
        <div className="payments-detail__summary">
          {summary.map((item) => (
            <div className="payments-detail__stat" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        {payment.notes?.trim() ? (
          <section className="payments-detail__section" aria-label="Información adicional del pago">
            <div className="payments-detail__heading">
              <h3>Información adicional</h3>
            </div>
            <p>{payment.notes}</p>
          </section>
        ) : null}
        <section className="payments-detail__section" aria-label="Propuesta del residente">
          <div className="payments-detail__heading">
            <h3>Propuesta del residente</h3>
            <p>Es una propuesta para revisión; los saldos no cambian hasta su aprobación.</p>
          </div>
          {allocationIntentLoading ? (
            <p role="status">Cargando propuesta…</p>
          ) : proposals.length ? (
            <div className="payments-detail__proposal">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Cuota</th>
                    <th scope="col">Pendiente actual</th>
                    <th scope="col">Propuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((proposal) => {
                    const charge = receivables.find(
                      (item) => item.id === proposal.receivable_item_id,
                    );
                    return (
                      <tr key={proposal.receivable_item_id}>
                        <td data-label="Cuota">{charge?.description ?? 'Cargo registrado'}</td>
                        <td data-label="Pendiente actual">
                          {charge?.outstanding_amount != null
                            ? formatDashboardAmount(charge.outstanding_amount, charge.currency_code)
                            : 'No disponible'}
                        </td>
                        <td data-label="Propuesto">
                          <strong>
                            {formatDashboardAmount(
                              proposal.payment_amount,
                              proposal.payment_currency_code,
                            )}
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="payments-detail__proposal-total">
                <span>{proposals.length} cuota(s)</span>
                <strong>
                  Total propuesto:{' '}
                  {formatDashboardAmount(totalProposed, payment.original_currency_code)}
                </strong>
              </div>
            </div>
          ) : (
            <p className="payments-detail__empty">
              Este pago no tiene una distribución propuesta registrada.
            </p>
          )}
        </section>
        <section className="payments-detail__section" aria-label="Comprobante del pago">
          <div className="payments-detail__heading">
            <h3>Comprobante</h3>
          </div>
          <PaymentProofPreview
            key={proofVersion}
            condominiumId={condominiumId}
            paymentId={payment.id}
            session={session}
          />
          {proofHistory.length > 1 ? (
            <p className="payments-detail__proof-version" role="status">
              Este comprobante se reemplazó {proofHistory.length - 1}{' '}
              {proofHistory.length === 2 ? 'vez' : 'veces'}. Se conserva el historial.
            </p>
          ) : null}
          {mayReplaceProof ? (
            <div className="payments-detail__proof-replace">
              <Field label="Reemplazar comprobante">
                <label className="payments-detail__proof-dropzone">
                  <input
                    aria-label="Nuevo comprobante"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      const error = file ? paymentProofFileError(file) : null;
                      setReplacementFile(error ? null : (file ?? null));
                      event.currentTarget.value = '';
                      setReplacementMessage(error ?? '');
                    }}
                  />
                  <span>
                    {replacementFile ? 'Cambiar archivo elegido' : 'Seleccionar imagen o PDF'}
                  </span>
                </label>
              </Field>
              {replacementFile ? <small>Nuevo archivo: {replacementFile.name}</small> : null}
              <Button
                disabled={!replacementFile || replacementBusy}
                onClick={() => void replaceProof()}
                type="button"
                variant="secondary"
              >
                {replacementBusy ? 'Guardando…' : 'Guardar nuevo comprobante'}
              </Button>
              <small>
                La versión anterior queda guardada para auditoría; el pago continúa pendiente de
                revisión.
              </small>
              {replacementMessage ? <p role="status">{replacementMessage}</p> : null}
            </div>
          ) : null}
        </section>
        <footer className="payments-detail__footer">
          <Button onClick={onClose} variant="secondary" type="button">
            Cerrar
          </Button>
        </footer>
      </div>
    );
  }

  return (
    <div className="payments-review">
      <div className="payments-review__summary">
        <div>
          <span>Pagador</span>
          <strong>{payment.payer_name}</strong>
        </div>
        <div>
          <span>Registrado por</span>
          <strong>{paymentActorLabel(payment.submitted_by_user_id, payment, session.user)}</strong>
        </div>
        {payment.reviewed_by ? (
          <div>
            <span>Revisado por</span>
            <strong>{paymentActorLabel(payment.reviewed_by, payment, session.user)}</strong>
          </div>
        ) : null}
        <div>
          <span>Monto</span>
          <strong>
            {formatDashboardAmount(payment.original_amount, payment.original_currency_code)}
          </strong>
        </div>
        <div>
          <span>Fecha</span>
          <strong>{formatDashboardDate(payment.payment_date)}</strong>
        </div>
        <div>
          <span>Estado</span>
          <Badge tone={paymentStatusTone(payment.status)}>
            {paymentStatusLabels[payment.status] ?? payment.status}
          </Badge>
        </div>
      </div>
      {payment.notes?.trim() ? (
        <div className="payments-review__reference">
          <span>Información adicional</span>
          <strong>{payment.notes}</strong>
        </div>
      ) : null}
      {payment.reference ? (
        <div className="payments-review__reference">
          <span>Referencia</span>
          <strong>{payment.reference}</strong>
        </div>
      ) : null}
      <div className="payments-review__reference">
        <span>Método</span>
        <strong>{method?.display_name ?? 'Método de pago registrado'}</strong>
      </div>
      <section
        className="payments-proof-section"
        aria-label="Propuesta de aplicación del residente"
      >
        <div className="payments-form__section-heading">
          <strong>Propuesta del residente</strong>
          <span>Es una guía para revisión; no ha aplicado ni registrado cargos.</span>
        </div>
        {allocationIntentLoading ? (
          <p>Cargando propuesta…</p>
        ) : allocationIntent?.proposals?.length ? (
          <div className="payments-detail__proposal payments-review__proposal">
            <table>
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Pendiente actual</th>
                  <th scope="col">Monto propuesto</th>
                </tr>
              </thead>
              <tbody>
                {allocationIntent.proposals.map((proposal) => {
                  const receivable = receivables.find(
                    (item) => item.id === proposal.receivable_item_id,
                  );
                  return (
                    <tr key={proposal.receivable_item_id}>
                      <td data-label="Concepto">{receivable?.description ?? 'Cargo publicado'}</td>
                      <td data-label="Pendiente actual">
                        {receivable?.outstanding_amount != null
                          ? formatDashboardAmount(
                              receivable.outstanding_amount,
                              receivable.currency_code,
                            )
                          : 'No disponible'}
                      </td>
                      <td data-label="Monto propuesto">
                        <strong>
                          {formatDashboardAmount(
                            proposal.payment_amount,
                            proposal.payment_currency_code,
                          )}
                        </strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="payments-detail__proposal-total">
              <span>{allocationIntent.proposals.length} cuotas seleccionadas</span>
              <strong>
                Total propuesto:{' '}
                {formatDashboardAmount(totalProposed, payment.original_currency_code)}
              </strong>
            </div>
          </div>
        ) : (
          <p>No se registró una propuesta de aplicación para este pago.</p>
        )}
      </section>
      {readOnly ? (
        <div className="payments-form__notice" role="status">
          Este pago está enviado a administración. Sus datos, comprobante y cualquier aplicación ya
          asociada se muestran solo para consulta hasta que cambie de estado.
        </div>
      ) : null}
      {message ? <div className="payments-form__message">{message}</div> : null}
      {!readOnly && !canApprove ? (
        <div className="payments-form__notice" role="status">
          Próximo paso: otro revisor debe validar y aprobar este pago. El registrador no puede
          aprobarlo cuando existe un revisor independiente.
        </div>
      ) : null}
      {!readOnly ? (
        <div className="payments-review__actions">
          {payment.status === 'submitted' ? (
            <Button
              disabled={processingAction !== null}
              onClick={() => void transition('start-review', 'Revisión iniciada.')}
              variant="secondary"
            >
              {processingAction === 'start-review' ? 'Procesando…' : 'Iniciar revisión'}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="payments-proof-section">
        <div className="payments-form__section-heading">
          <strong>Comprobante</strong>
          <span>Verifica que monto, fecha y referencia coincidan con el comprobante.</span>
        </div>
        <PaymentProofPreview
          condominiumId={condominiumId}
          missingHint="Si el método exige comprobante, usa «Solicitar corrección» e indica que falta adjuntarlo."
          paymentId={payment.id}
          session={session}
        />
        {proofHistory.length > 1 ? (
          <details className="payments-detail__history">
            <summary>Comprobante reemplazado · {proofHistory.length} versiones registradas</summary>
            <ol>
              {proofHistory.map((entry) => (
                <li key={entry.id}>
                  {entry.original_filename} · {formatDashboardDate(entry.created_at)}
                  {entry.superseded_at ? ' · Reemplazado' : ' · Actual'}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
      {!readOnly ? (
        <div className="payments-review__decision">
          <Field label="Motivo para corrección, rechazo o reverso">
            <textarea
              className="payments-textarea"
              disabled={processingAction !== null}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </Field>
          <div>
            <Button
              disabled={!reason.trim() || processingAction !== null}
              onClick={() => void transition('request-correction', 'Corrección solicitada.', true)}
              variant="secondary"
            >
              {processingAction === 'request-correction' ? 'Procesando…' : 'Solicitar corrección'}
            </Button>
            <Button
              disabled={!reason.trim() || processingAction !== null}
              onClick={() => void transition('reject', 'Pago rechazado.', true)}
              variant="danger"
            >
              {processingAction === 'reject' ? 'Procesando…' : 'Rechazar'}
            </Button>
          </div>
        </div>
      ) : null}
      {!readOnly && !canApprove ? (
        <div className="payments-form__message" role="status">
          <strong>{independentApprovalTitle}</strong>
          <br />
          Este pago debe aprobarlo otro revisor.
        </div>
      ) : null}
      {!readOnly && canApprove ? (
        <div className="payments-review__allocation">
          <div className="payments-form__section-heading">
            <strong>Aplicación del pago</strong>
            <span>
              Previsualiza la distribución antes de aprobar. Las monedas nunca se mezclan sin tasa
              explícita.
            </span>
          </div>
          <Field
            label="Cuenta de tesorería"
            hint={
              treasuryAccounts.length === 0 && !treasuryLoading
                ? `No hay cuentas activas en ${payment.original_currency_code}; Habitta creará una cuenta transitoria claramente identificada.`
                : 'El pago aprobado ingresará a esta cuenta.'
            }
          >
            <Select
              disabled={
                treasuryLoading || treasuryAccounts.length === 0 || processingAction !== null
              }
              onChange={(event) => setSelectedTreasuryAccountId(event.target.value)}
              required={treasuryAccounts.length > 1}
              value={selectedTreasuryAccountId}
            >
              <option value="">
                {treasuryLoading
                  ? 'Cargando cuentas…'
                  : treasuryAccounts.length === 0
                    ? 'Cuenta transitoria automática'
                    : 'Seleccionar cuenta'}
              </option>
              {treasuryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency_code}
                </option>
              ))}
            </Select>
          </Field>
          {allocationIntentLoading ? (
            <p role="status">Cargando la distribución registrada por el residente…</p>
          ) : allocationIntentError ? (
            <div className="payments-allocation-editor__problem" role="alert">
              <p>{allocationIntentError}</p>
              <Button
                onClick={() => setAllocationIntentRetry((attempt) => attempt + 1)}
                size="sm"
                type="button"
                variant="secondary"
              >
                Reintentar consulta de propuesta
              </Button>
            </div>
          ) : resolvedProposal?.kind === 'invalid' ? (
            <p className="payments-allocation-editor__problem" role="alert">
              {resolvedProposal.reason} No se cambiará la distribución automáticamente.
            </p>
          ) : resolvedProposal ? (
            <PaymentAllocationEditor
              key={allocationIntent?.updated_at ?? 'legacy-manual'}
              proposedAllocations={
                resolvedProposal.kind === 'resident-proposal'
                  ? resolvedProposal.allocations
                  : undefined
              }
              onApprove={async (allocations: AllocationInput[]) => {
                setMessage('');
                try {
                  await selectTreasuryAccountBeforeApproval();
                  await paymentApi(`${endpoint}/approve`, session, {
                    method: 'POST',
                    body: JSON.stringify({ allocations }),
                  });
                  await onChanged('Pago aprobado, aplicado y registrado en tesorería.');
                } catch (error) {
                  const nextMessage =
                    error instanceof Error ? error.message : 'No se pudo aprobar el pago.';
                  setMessage(nextMessage);
                  throw error;
                }
              }}
              onPreview={(allocations) =>
                paymentApi<AllocationPreview>(`${endpoint}/allocation-preview`, session, {
                  method: 'POST',
                  body: JSON.stringify({ allocations }),
                })
              }
              paymentCurrency={payment.original_currency_code}
              receivables={receivables.filter(
                (item) =>
                  item.unit_id === payment.unit_id && Number(item.outstanding_amount ?? 0) > 0,
              )}
            />
          ) : null}
        </div>
      ) : null}
      {!readOnly && payment.status === 'approved' ? (
        <Button
          disabled={!reason.trim() || processingAction !== null}
          onClick={() => void transition('reverse', 'Pago reversado.', true)}
          variant="danger"
        >
          {processingAction === 'reverse' ? 'Procesando…' : 'Reversar pago aprobado'}
        </Button>
      ) : null}
    </div>
  );
}

export function PaymentsDrawerHost({
  condominiumId,
  session,
  units,
  buildingNameById,
  methods,
  receivables,
  drawer,
  onClose,
  onChanged,
}: Props) {
  if (!drawer) return null;

  // 'methods' and 'receipt' are handled upstream by PaymentsDrawers.tsx, which intercepts those
  // drawer modes with its own views before ever delegating to this host. Create, edit, review and
  // resident read-only details reach this shared host.

  if (drawer.type === 'review' || drawer.type === 'details') {
    const readOnly = drawer.type === 'details';
    return (
      <DrawerFrame
        description={
          readOnly
            ? 'Consulta los datos enviados sin modificar el pago.'
            : 'Valida referencia, comprobante, tesorería y aplicación antes de aprobar.'
        }
        eyebrow={readOnly ? 'Seguimiento de pago' : 'Control financiero'}
        icon={<PaymentsIcon size={22} />}
        onClose={onClose}
        centered
        title={readOnly ? 'Detalle del pago' : 'Revisar pago'}
      >
        <ReviewPayment
          condominiumId={condominiumId}
          methods={methods}
          onChanged={onChanged}
          payment={drawer.payment}
          readOnly={readOnly}
          unitLabel={
            units.find((unit) => unit.id === drawer.payment.unit_id)?.code ?? 'Unidad registrada'
          }
          onClose={onClose}
          receivables={receivables}
          session={session}
        />
      </DrawerFrame>
    );
  }

  const payment = drawer.type === 'edit' ? drawer.payment : undefined;
  return (
    <DrawerFrame
      description={
        payment
          ? 'Corrige los datos solicitados antes de reenviar.'
          : 'Registra el movimiento como borrador y adjunta su comprobante.'
      }
      eyebrow="Captura guiada"
      icon={<PaymentsIcon size={22} />}
      onClose={onClose}
      title={payment ? 'Corregir pago' : 'Registrar pago'}
    >
      <PaymentForm
        {...(payment ? { payment } : {})}
        buildingNameById={buildingNameById}
        condominiumId={condominiumId}
        methods={methods}
        onChanged={onChanged}
        session={session}
        units={units}
      />
      {payment ? (
        <div className="payments-proof-section">
          <div className="payments-form__section-heading">
            <strong>Comprobante</strong>
            <span>JPEG, PNG, WebP o PDF. Máximo 10 MB.</span>
          </div>
          <PaymentProofUploader
            condominiumId={condominiumId}
            onDone={(nextMessage) => void onChanged(nextMessage)}
            paymentId={payment.id}
            session={session}
          />
        </div>
      ) : null}
    </DrawerFrame>
  );
}
