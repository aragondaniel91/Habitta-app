import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useDialogBehavior } from '../components/Drawer';
import { PaymentsIcon } from '../components/icons';
import { Badge, Button, Field, Select } from '../components/ui';
import { paymentApi, paymentProof } from '../features/payments/api';
import { PaymentAllocationEditor } from '../features/payments/components/PaymentAllocationEditor';
import { PaymentProofUploader } from '../features/payments/components/PaymentProofUploader';
import type {
  AllocationInput,
  AllocationPreview,
  Payment,
  PaymentMethod,
  PaymentReceipt,
  Receivable,
} from '../features/payments/types';
import type { TreasuryAccount } from '../features/treasury/types';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import { paymentStatusLabels, paymentStatusTone } from '../lib/payments';
import { unitReferenceLabel } from '../lib/unit-domain';

export type PaymentsDrawerMode =
  | { type: 'create' }
  | { type: 'edit'; payment: Payment }
  | { type: 'review'; payment: Payment }
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
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useDialogBehavior(panel, onClose);

  return (
    <div className="payments-drawer-layer" role="presentation">
      <button
        aria-label="Cerrar panel"
        className="payments-drawer-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={title}
        aria-modal="true"
        className="payments-drawer"
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

function ReviewPayment({
  condominiumId,
  session,
  payment,
  receivables,
  onChanged,
}: {
  condominiumId: string;
  session: Session;
  payment: Payment;
  receivables: Receivable[];
  onChanged: (message: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccount[]>([]);
  const [treasuryLoading, setTreasuryLoading] = useState(true);
  const [selectedTreasuryAccountId, setSelectedTreasuryAccountId] = useState(
    payment.treasury_account_id ?? '',
  );
  const endpoint = `/v1/condominiums/${condominiumId}/payments/${payment.id}`;

  useEffect(() => {
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
    session,
  ]);

  const transition = async (action: string, nextMessage: string, includeReason = false) => {
    setMessage('');
    try {
      await paymentApi(`${endpoint}/${action}`, session, {
        method: 'POST',
        ...(includeReason ? { body: JSON.stringify({ reason }) } : {}),
      });
      await onChanged(nextMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el pago.');
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

  return (
    <div className="payments-review">
      <div className="payments-review__summary">
        <div>
          <span>Pagador</span>
          <strong>{payment.payer_name}</strong>
        </div>
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
      {payment.reference ? (
        <div className="payments-review__reference">
          <span>Referencia</span>
          <strong>{payment.reference}</strong>
        </div>
      ) : null}
      {message ? <div className="payments-form__message">{message}</div> : null}
      <div className="payments-review__actions">
        {payment.status === 'submitted' ? (
          <Button
            onClick={() => void transition('start-review', 'Revisión iniciada.')}
            variant="secondary"
          >
            Iniciar revisión
          </Button>
        ) : null}
        <Button
          onClick={() =>
            void paymentProof(`${endpoint}/proof`, session)
              .then((value) => {
                if (value instanceof Blob)
                  window.open(URL.createObjectURL(value), '_blank', 'noopener,noreferrer');
              })
              .catch((error: Error) => setMessage(error.message))
          }
          variant="secondary"
        >
          Ver comprobante
        </Button>
      </div>
      <div className="payments-review__decision">
        <Field label="Motivo para corrección, rechazo o reverso">
          <textarea
            className="payments-textarea"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </Field>
        <div>
          <Button
            disabled={!reason.trim()}
            onClick={() => void transition('request-correction', 'Corrección solicitada.', true)}
            variant="secondary"
          >
            Solicitar corrección
          </Button>
          <Button
            disabled={!reason.trim()}
            onClick={() => void transition('reject', 'Pago rechazado.', true)}
            variant="danger"
          >
            Rechazar
          </Button>
        </div>
      </div>
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
            disabled={treasuryLoading || treasuryAccounts.length === 0}
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
        <PaymentAllocationEditor
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
            (item) => item.unit_id === payment.unit_id && Number(item.outstanding_amount ?? 0) > 0,
          )}
        />
      </div>
      {payment.status === 'approved' ? (
        <Button
          disabled={!reason.trim()}
          onClick={() => void transition('reverse', 'Pago reversado.', true)}
          variant="danger"
        >
          Reversar pago aprobado
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
  // drawer modes with its own views before ever delegating to this host. Only null, 'create',
  // 'edit' and 'review' reach here.

  if (drawer.type === 'review') {
    return (
      <DrawerFrame
        description="Valida referencia, comprobante, tesorería y aplicación antes de aprobar."
        eyebrow="Control financiero"
        icon={<PaymentsIcon size={22} />}
        onClose={onClose}
        title="Revisar pago"
      >
        <ReviewPayment
          condominiumId={condominiumId}
          onChanged={onChanged}
          payment={drawer.payment}
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
