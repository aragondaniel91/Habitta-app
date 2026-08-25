import { useRef, useState } from 'react';
import type { ComponentProps, FormEvent, ReactNode } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { Drawer, useDialogBehavior } from '../components/Drawer';
import { CheckCircleIcon } from '../components/icons';
import { Badge, Button, Field, Select } from '../components/ui';
import { paymentApi } from '../features/payments/api';
import type { Payment, PaymentMethod, PaymentReceipt } from '../features/payments/types';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import { canManage, useCondominiumRoles } from '../lib/roles';
import {
  PaymentsDrawerHost as CorePaymentsDrawerHost,
  type PaymentsDrawerMode,
} from './PaymentsDrawersCore';

export type { PaymentsDrawerMode } from './PaymentsDrawersCore';

type Props = ComponentProps<typeof CorePaymentsDrawerHost>;

function ReceiptDrawerFrame({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
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
          <div className="payments-drawer__icon">
            <CheckCircleIcon size={22} />
          </div>
          <div>
            <span>Trazabilidad</span>
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

function PaymentMethodsView({
  condominiumId,
  session,
  methods,
  onChanged,
}: {
  condominiumId: string;
  session: Props['session'];
  methods: PaymentMethod[];
  onChanged: Props['onChanged'];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setSaving(true);
    setMessage('');
    try {
      await paymentApi(`/v1/condominiums/${condominiumId}/payment-methods`, session, {
        method: 'POST',
        body: JSON.stringify({
          methodType: String(values.methodType),
          displayName: String(values.displayName),
          currencyCode: String(values.currencyCode),
          accountHolder: String(values.accountHolder ?? ''),
          bankName: String(values.bankName ?? ''),
          accountIdentifierMasked: String(values.accountIdentifierMasked ?? ''),
          phoneMasked: String(values.phoneMasked ?? ''),
          emailMasked: String(values.emailMasked ?? ''),
          instructions: String(values.instructions ?? ''),
          requiresReference: values.requiresReference === 'on',
          requiresProof: values.requiresProof === 'on',
          isActive: true,
        }),
      });
      form.reset();
      await onChanged('Método de pago creado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el método.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="payments-methods-workspace">
      <div className="payments-method-list">
        {methods.map((method) => (
          <article key={method.id}>
            <div>
              <strong>{method.display_name}</strong>
              <span>
                {method.method_type.replaceAll('_', ' ')} · {method.currency_code}
              </span>
            </div>
            <div>
              {method.requires_reference ? <Badge tone="info">Referencia</Badge> : null}
              {method.requires_proof ? <Badge tone="warning">Comprobante</Badge> : null}
              <Badge tone={method.is_active ? 'success' : 'neutral'}>
                {method.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
          </article>
        ))}
      </div>
      <form className="payments-form payments-method-form" onSubmit={(event) => void submit(event)}>
        <div className="payments-form__section-heading">
          <strong>Agregar método</strong>
          <span>Publica instrucciones claras para residentes y administradores.</span>
        </div>
        {message ? <div className="payments-form__message">{message}</div> : null}
        <div className="payments-form__grid">
          <Field label="Tipo">
            <Select name="methodType">
              <option value="bank_transfer">Transferencia bancaria</option>
              <option value="pago_movil">Pago Móvil</option>
              <option value="zelle">Zelle</option>
              <option value="cash">Efectivo</option>
              <option value="other">Otro</option>
            </Select>
          </Field>
          <Field label="Moneda">
            <Select name="currencyCode">
              <option>USD</option>
              <option>VES</option>
            </Select>
          </Field>
        </div>
        <Field label="Nombre visible">
          <input className="input" name="displayName" required />
        </Field>
        <div className="payments-form__grid">
          <Field label="Titular">
            <input className="input" name="accountHolder" />
          </Field>
          <Field label="Banco">
            <input className="input" name="bankName" />
          </Field>
        </div>
        <div className="payments-form__grid">
          <Field label="Cuenta enmascarada">
            <input className="input" name="accountIdentifierMasked" placeholder="****1234" />
          </Field>
          <Field label="Teléfono enmascarado">
            <input className="input" name="phoneMasked" placeholder="****5678" />
          </Field>
        </div>
        <Field label="Correo enmascarado">
          <input className="input" name="emailMasked" placeholder="a***@correo.com" />
        </Field>
        <Field label="Instrucciones">
          <textarea className="payments-textarea" name="instructions" />
        </Field>
        <div className="payments-checkbox-row">
          <label>
            <input name="requiresReference" type="checkbox" /> Exigir referencia
          </label>
          <label>
            <input name="requiresProof" type="checkbox" /> Exigir comprobante
          </label>
        </div>
        <Button disabled={saving} type="submit">
          {saving ? 'Creando…' : 'Crear método'}
        </Button>
      </form>
    </div>
  );
}

function ReceiptView({
  condominiumId,
  session,
  payment,
  receipt,
  onChanged,
}: {
  condominiumId: string;
  session: Props['session'];
  payment: Payment;
  receipt: PaymentReceipt;
  onChanged: Props['onChanged'];
}) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [message, setMessage] = useState('');

  const closeReverse = () => {
    if (reversing) return;
    setReverseOpen(false);
    setReason('');
    setMessage('');
  };

  const reversePayment = async () => {
    if (!reason.trim() || reversing) return;
    setReversing(true);
    setMessage('');
    try {
      await paymentApi(
        `/v1/condominiums/${condominiumId}/payments/${payment.id}/reverse`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      setReverseOpen(false);
      setReason('');
      await onChanged('Pago reversado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reversar el pago.');
    } finally {
      setReversing(false);
    }
  };

  return (
    <>
      <article className="payments-receipt-card">
        {payment.status === 'reversed' ? (
          <div className="payments-receipt-card__reversed">PAGO REVERSADO</div>
        ) : null}
        <div className="payments-receipt-card__brand">
          <span>
            <CheckCircleIcon size={22} />
          </span>
          <div>
            <strong>Habitta</strong>
            <small>Recibo de pago</small>
          </div>
        </div>
        <div className="payments-receipt-card__number">
          <span>Número de recibo</span>
          <strong>{receipt.receipt_number}</strong>
        </div>
        <div className="payments-receipt-card__amount">
          <span>Monto confirmado</span>
          <strong>
            {formatDashboardAmount(
              receipt.snapshot.payment.amount,
              receipt.snapshot.payment.currency_code,
            )}
          </strong>
        </div>
        <div className="payments-receipt-card__details">
          <div>
            <span>Condominio</span>
            <strong>{receipt.snapshot.condominium.name}</strong>
          </div>
          <div>
            <span>Unidad</span>
            <strong>{receipt.snapshot.unit.code}</strong>
          </div>
          <div>
            <span>Pagador</span>
            <strong>{receipt.snapshot.payment.payer}</strong>
          </div>
          <div>
            <span>Fecha</span>
            <strong>{formatDashboardDate(receipt.snapshot.payment.date)}</strong>
          </div>
          <div>
            <span>Método</span>
            <strong>{receipt.snapshot.method.display_name}</strong>
          </div>
          <div>
            <span>Emitido</span>
            <strong>{formatDashboardDate(receipt.issued_at)}</strong>
          </div>
        </div>
        {message ? <div className="payments-form__message">{message}</div> : null}
        <div className="payments-review__actions">
          <Button onClick={() => window.print()} variant="secondary">
            Imprimir recibo
          </Button>
          {payment.status === 'approved' && manage ? (
            <Button
              onClick={() => {
                setMessage('');
                setReason('');
                setReverseOpen(true);
              }}
              variant="danger"
            >
              Reversar pago aprobado
            </Button>
          ) : null}
        </div>
      </article>

      {reverseOpen ? (
        <ConfirmDialog
          busy={reversing}
          busyLabel="Reversando pago…"
          confirmLabel="Reversar pago"
          description="Habitta registrará un reverso trazable del pago aprobado y conservará su historial. Indica el motivo antes de confirmar."
          destructive
          onCancel={closeReverse}
          onConfirm={() => void reversePayment()}
          title="Reversar pago aprobado"
        >
          <Field
            hint="El motivo quedará asociado permanentemente al historial del pago."
            label="Motivo del reverso"
          >
            <textarea
              autoFocus
              className="payments-textarea"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              required
              rows={4}
              value={reason}
            />
          </Field>
          {!reason.trim() ? (
            <small>Escribe un motivo antes de confirmar la reversión.</small>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function PaymentsDrawerHost(props: Props) {
  const drawer: PaymentsDrawerMode = props.drawer;
  if (!drawer) return <CorePaymentsDrawerHost {...props} />;

  if (drawer.type === 'methods') {
    return (
      <Drawer
        description="Configura métodos de pago visibles para residentes y administradores."
        eyebrow="Configuración financiera"
        onClose={props.onClose}
        prefix="payments"
        title="Métodos de pago"
        wide
      >
        <PaymentMethodsView
          condominiumId={props.condominiumId}
          methods={props.methods}
          onChanged={props.onChanged}
          session={props.session}
        />
      </Drawer>
    );
  }

  if (drawer.type !== 'receipt') return <CorePaymentsDrawerHost {...props} />;

  return (
    <ReceiptDrawerFrame
      description="Documento generado a partir del pago aprobado y sus aplicaciones."
      onClose={props.onClose}
      title="Recibo de pago"
    >
      <ReceiptView
        condominiumId={props.condominiumId}
        onChanged={props.onChanged}
        payment={drawer.payment}
        receipt={drawer.receipt}
        session={props.session}
      />
    </ReceiptDrawerFrame>
  );
}
