import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../../components/Drawer';
import { FormActions, FormGrid } from '../../../components/FormLayout';
import { Button, Field, Select } from '../../../components/ui';
import '../../../financial-capture.css';
import { paymentApi } from '../api';
import { unitReferenceLabel } from '../../../lib/unit-domain';
import type { Payment, PaymentMethod } from '../types';
import { PaymentProofUploader } from './PaymentProofUploader';

export function PaymentCaptureDrawer({
  condominiumId,
  session,
  units,
  buildingNameById,
  methods,
  payment,
  submitOnComplete = false,
  onClose,
  onDraftCreated,
  onComplete,
}: {
  condominiumId: string;
  session: Session;
  units: { id: string; code: string; building_id?: string | null }[];
  buildingNameById: Record<string, string>;
  methods: PaymentMethod[];
  payment?: Payment;
  submitOnComplete?: boolean;
  onClose: () => void;
  onDraftCreated: () => Promise<void>;
  onComplete: (message: string) => Promise<void>;
}) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [savedPayment, setSavedPayment] = useState<Payment>();
  const [proofSaved, setProofSaved] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState(
    payment?.payment_method_id ?? methods.find((item) => item.is_active)?.id ?? '',
  );
  const selectedMethod = methods.find((item) => item.id === selectedMethodId);
  const requiresProof = Boolean(selectedMethod?.requires_proof);
  const editing = Boolean(payment);

  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savedPayment) return;
    setSaving(true);
    setMessage('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<
        string,
        string
      >;
      const nextPayment = await paymentApi<Payment>(
        payment
          ? `/v1/condominiums/${condominiumId}/payments/${payment.id}`
          : `/v1/condominiums/${condominiumId}/payments`,
        session,
        {
          method: payment ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...values,
            ...(payment ? {} : { idempotencyKey: idempotencyKey.current }),
          }),
        },
      );
      setSavedPayment(nextPayment);
      setMessage(
        payment
          ? 'Corrección guardada. Puedes reemplazar el comprobante antes de volver a enviar.'
          : 'Datos guardados. Adjunta el comprobante antes de terminar.',
      );
      await onDraftCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el pago.');
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!savedPayment || saving) return;
    if (!submitOnComplete) {
      await onComplete(proofSaved ? 'Pago y comprobante guardados.' : 'Borrador de pago guardado.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await paymentApi(
        `/v1/condominiums/${condominiumId}/payments/${savedPayment.id}/submit`,
        session,
        { method: 'POST' },
      );
      await onComplete('Pago enviado a validación.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar el pago. Verifica la referencia y el comprobante requerido.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      eyebrow={editing ? 'Corrección de pago' : 'Registro guiado'}
      onClose={onClose}
      prefix="payments"
      title={editing ? 'Corregir pago' : 'Registrar pago'}
    >
      {!savedPayment ? (
        <form className="payments-form ux-form" onSubmit={(event) => void saveDetails(event)}>
          {message ? <div className="payments-form__message">{message}</div> : null}
          {payment?.correction_reason ? (
            <div className="payments-form__notice">
              <strong>La administración solicitó una corrección:</strong>{' '}
              {payment.correction_reason}
            </div>
          ) : null}
          {!methods.some((item) => item.is_active) ? (
            <div className="payments-form__notice">
              No hay un método de pago activo disponible en este momento.
            </div>
          ) : null}
          <div aria-label="Progreso de captura" className="financial-capture-progress">
            <strong>1. Datos</strong>
            <span>2. Comprobante</span>
          </div>
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
                .filter((method) => method.is_active || method.id === payment?.payment_method_id)
                .map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.display_name} · {method.currency_code}
                  </option>
                ))}
            </Select>
          </Field>
          <FormGrid>
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
              <input
                className="input"
                name="originalCurrencyCode"
                readOnly
                value={selectedMethod?.currency_code ?? payment?.original_currency_code ?? 'USD'}
              />
            </Field>
          </FormGrid>
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
            hint={
              selectedMethod?.requires_reference ? 'Obligatoria para este método.' : 'Opcional.'
            }
            label="Referencia"
          >
            <input
              className="input"
              defaultValue={payment?.reference}
              name="reference"
              required={selectedMethod?.requires_reference}
            />
          </Field>
          <Field
            label="Información adicional"
            hint="Opcional. La administración podrá verla al revisar."
          >
            <textarea
              className="payments-textarea"
              defaultValue={payment?.notes}
              name="notes"
              placeholder="Dato útil para identificar o revisar el pago"
            />
          </Field>
          <FormActions className="financial-capture-footer" sticky>
            <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={saving || !selectedMethodId} type="submit">
              {saving ? 'Guardando…' : 'Continuar al comprobante'}
            </Button>
          </FormActions>
        </form>
      ) : (
        <div className="payments-form financial-capture-proof-step">
          <div aria-label="Progreso de captura" className="financial-capture-progress">
            <span>1. Datos</span>
            <strong>2. Comprobante</strong>
          </div>
          {message ? <div className="payments-form__message">{message}</div> : null}
          <div className="financial-capture-summary">
            <span>{editing ? 'Corrección guardada' : 'Datos del pago'}</span>
            <strong>{savedPayment.payer_name}</strong>
            <small>
              {savedPayment.original_amount} {savedPayment.original_currency_code}
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
              paymentId={savedPayment.id}
              session={session}
            />
          </div>
          <FormActions className="financial-capture-footer" sticky>
            <Button
              disabled={saving || (requiresProof && !proofSaved && !editing)}
              onClick={() => void finish()}
              type="button"
            >
              {saving
                ? submitOnComplete
                  ? 'Enviando…'
                  : 'Guardando…'
                : submitOnComplete
                  ? 'Enviar a validación'
                  : 'Finalizar registro'}
            </Button>
          </FormActions>
        </div>
      )}
    </Drawer>
  );
}
