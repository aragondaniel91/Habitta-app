import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../../components/Drawer';
import { Button, Field, Select } from '../../../components/ui';
import { paymentApi } from '../api';
import type { Payment, PaymentMethod } from '../types';
import { PaymentProofUploader } from './PaymentProofUploader';

export function PaymentCaptureDrawer({
  condominiumId,
  session,
  units,
  methods,
  onClose,
  onDraftCreated,
  onComplete,
}: {
  condominiumId: string;
  session: Session;
  units: { id: string; code: string }[];
  methods: PaymentMethod[];
  onClose: () => void;
  onDraftCreated: () => Promise<void>;
  onComplete: (message: string) => Promise<void>;
}) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [createdPayment, setCreatedPayment] = useState<Payment>();
  const [proofSaved, setProofSaved] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState(
    methods.find((item) => item.is_active)?.id ?? '',
  );
  const selectedMethod = methods.find((item) => item.id === selectedMethodId);
  const requiresProof = Boolean(selectedMethod?.requires_proof);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createdPayment) return;
    setSaving(true);
    setMessage('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<
        string,
        string
      >;
      const payment = await paymentApi<Payment>(
        `/v1/condominiums/${condominiumId}/payments`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ ...values, idempotencyKey: idempotencyKey.current }),
        },
      );
      setCreatedPayment(payment);
      setMessage('Borrador creado. Ahora adjunta el comprobante antes de terminar.');
      await onDraftCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el pago.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer eyebrow="Captura guiada" onClose={onClose} prefix="payments" title="Registrar pago">
      {!createdPayment ? (
        <form className="payments-form" onSubmit={(event) => void submit(event)}>
          {message ? <div className="payments-form__message">{message}</div> : null}
          {!methods.some((item) => item.is_active) ? (
            <div className="payments-form__notice">
              Crea un método de pago antes de registrar movimientos.
            </div>
          ) : null}
          <div aria-label="Progreso de captura" className="financial-capture-progress">
            <strong>1. Datos</strong>
            <span>2. Comprobante</span>
          </div>
          <Field label="Unidad">
            <Select name="unitId" required>
              <option value="">Seleccionar unidad</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code}
                </option>
              ))}
            </Select>
          </Field>
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
              <input className="input" name="paymentDate" required type="date" />
            </Field>
            <Field label="Moneda">
              <input
                className="input"
                name="originalCurrencyCode"
                readOnly
                value={selectedMethod?.currency_code ?? 'USD'}
              />
            </Field>
          </div>
          <Field label="Monto">
            <input
              className="input"
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
              name="payerName"
              placeholder="Nombre y apellido"
              required
            />
          </Field>
          <Field
            hint={
              selectedMethod?.requires_reference
                ? 'Obligatoria para este método.'
                : 'Opcional.'
            }
            label="Referencia"
          >
            <input
              className="input"
              name="reference"
              required={selectedMethod?.requires_reference}
            />
          </Field>
          <Field label="Notas internas">
            <textarea
              className="payments-textarea"
              name="notes"
              placeholder="Contexto adicional para la revisión"
            />
          </Field>
          <footer className="payments-form__footer financial-capture-footer">
            <Button disabled={saving || !selectedMethodId} type="submit">
              {saving ? 'Guardando…' : 'Continuar al comprobante'}
            </Button>
          </footer>
        </form>
      ) : (
        <div className="payments-form financial-capture-proof-step">
          <div aria-label="Progreso de captura" className="financial-capture-progress">
            <span>1. Datos</span>
            <strong>2. Comprobante</strong>
          </div>
          {message ? <div className="payments-form__message">{message}</div> : null}
          <div className="financial-capture-summary">
            <span>Borrador creado</span>
            <strong>{createdPayment.payer_name}</strong>
            <small>
              {createdPayment.original_amount} {createdPayment.original_currency_code}
            </small>
          </div>
          <div className="payments-proof-section">
            <div className="payments-form__section-heading">
              <strong>Comprobante {requiresProof ? 'obligatorio' : 'opcional'}</strong>
              <span>JPEG, PNG, WebP o PDF. Máximo 10 MB.</span>
            </div>
            <PaymentProofUploader
              condominiumId={condominiumId}
              onDone={(nextMessage) => {
                setMessage(nextMessage);
                if (nextMessage === 'Comprobante guardado.') setProofSaved(true);
              }}
              paymentId={createdPayment.id}
              session={session}
            />
          </div>
          <footer className="payments-form__footer financial-capture-footer">
            <Button
              disabled={requiresProof && !proofSaved}
              onClick={() =>
                void onComplete(
                  proofSaved ? 'Pago y comprobante guardados.' : 'Borrador de pago guardado.',
                )
              }
              type="button"
            >
              Finalizar registro
            </Button>
          </footer>
        </div>
      )}
    </Drawer>
  );
}
