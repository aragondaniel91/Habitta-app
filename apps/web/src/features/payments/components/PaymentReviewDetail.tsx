import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Dialog, DialogBody, DialogFooter } from '../../../components/Dialog';
import { Button, Field } from '../../../components/ui';
import { paymentApi, paymentProof } from '../api';
import type { AllocationInput, AllocationPreview, Payment, Receivable } from '../types';
import { PaymentAllocationEditor } from './PaymentAllocationEditor';

type ReasonAction = 'request-correction' | 'reject' | 'reverse';

const reasonDialogCopy: Record<
  ReasonAction,
  { title: string; description: string; label: string; confirm: string; destructive: boolean }
> = {
  'request-correction': {
    title: 'Solicitar corrección',
    description: 'Explica qué debe corregir el residente antes de volver a enviar este pago.',
    label: 'Motivo de corrección',
    confirm: 'Solicitar corrección',
    destructive: false,
  },
  reject: {
    title: 'Rechazar pago',
    description: 'El pago quedará rechazado y el motivo se conservará en su historial.',
    label: 'Motivo de rechazo',
    confirm: 'Rechazar pago',
    destructive: true,
  },
  reverse: {
    title: 'Reversar pago aprobado',
    description: 'Habitta registrará un reverso trazable del pago aprobado. Indica el motivo.',
    label: 'Motivo del reverso',
    confirm: 'Reversar pago',
    destructive: true,
  },
};

export function PaymentReviewDetail({
  condominiumId,
  payment,
  receivables,
  session,
  reload,
}: {
  condominiumId: string;
  payment: Payment;
  receivables: Receivable[];
  session: Session;
  reload: () => Promise<void>;
}) {
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState('');
  const [reasonBusy, setReasonBusy] = useState(false);
  const endpoint = `/v1/condominiums/${condominiumId}/payments/${payment.id}`;

  const transition = async (action: string, transitionReason?: string) => {
    await paymentApi(`${endpoint}/${action}`, session, {
      method: 'POST',
      ...(transitionReason ? { body: JSON.stringify({ reason: transitionReason }) } : {}),
    });
    await reload();
  };

  const openReasonDialog = (action: ReasonAction) => {
    setReason('');
    setReasonAction(action);
  };

  const closeReasonDialog = () => {
    if (reasonBusy) return;
    setReasonAction(null);
    setReason('');
  };

  const submitReasonAction = async () => {
    if (!reasonAction || !reason.trim() || reasonBusy) return;
    setReasonBusy(true);
    try {
      await transition(reasonAction, reason.trim());
      setReasonAction(null);
      setReason('');
    } finally {
      setReasonBusy(false);
    }
  };

  const reasonCopy = reasonAction ? reasonDialogCopy[reasonAction] : null;

  return (
    <>
      <section>
        <h4>
          {payment.payer_name} · {payment.original_currency_code} {payment.original_amount}
        </h4>
        <Button onClick={() => void transition('start-review')} size="sm" type="button">
          Iniciar revisión
        </Button>
        <Button
          onClick={() =>
            void paymentProof(`${endpoint}/proof`, session).then((blob) => {
              if (blob instanceof Blob) window.open(URL.createObjectURL(blob), '_blank');
            })
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          Ver comprobante
        </Button>
        <Button
          onClick={() => openReasonDialog('request-correction')}
          size="sm"
          type="button"
          variant="secondary"
        >
          Solicitar corrección
        </Button>
        <Button onClick={() => openReasonDialog('reject')} size="sm" type="button" variant="danger">
          Rechazar
        </Button>
        <PaymentAllocationEditor
          receivables={receivables}
          paymentCurrency={payment.original_currency_code}
          onPreview={(allocations) =>
            paymentApi<AllocationPreview>(`${endpoint}/allocation-preview`, session, {
              method: 'POST',
              body: JSON.stringify({ allocations }),
            })
          }
          onApprove={async (allocations: AllocationInput[]) => {
            await paymentApi(`${endpoint}/approve`, session, {
              method: 'POST',
              body: JSON.stringify({ allocations }),
            });
            await reload();
          }}
        />
        {payment.status === 'approved' ? (
          <Button
            onClick={() => openReasonDialog('reverse')}
            size="sm"
            type="button"
            variant="danger"
          >
            Reversar
          </Button>
        ) : null}
      </section>

      {reasonCopy ? (
        <Dialog
          closeDisabled={reasonBusy}
          description={reasonCopy.description}
          {...(reasonCopy.destructive ? { eyebrow: 'Acción sensible' } : {})}
          onClose={closeReasonDialog}
          size="sm"
          title={reasonCopy.title}
        >
          <DialogBody>
            <Field
              hint="Este motivo quedará asociado al historial del pago."
              label={reasonCopy.label}
            >
              <textarea
                autoFocus
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                required
                rows={4}
                value={reason}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={reasonBusy}
              onClick={closeReasonDialog}
              type="button"
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              disabled={!reason.trim() || reasonBusy}
              onClick={() => void submitReasonAction()}
              type="button"
              variant={reasonCopy.destructive ? 'danger' : 'primary'}
            >
              {reasonBusy ? 'Procesando…' : reasonCopy.confirm}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  );
}
