import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../../../components/ui';
import { paymentProof } from '../api';
import './payment-proof-uploader.css';

type ProofState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; contentType: string }
  | { status: 'missing'; message: string };

/**
 * Shows the active payment proof inline so a reviewer can verify it without leaving the payment.
 * `refreshKey` lets the caller reload it after a new upload replaces the active proof.
 */
export function PaymentProofPreview({
  condominiumId,
  paymentId,
  session,
  refreshKey = 0,
  missingHint,
}: {
  condominiumId: string;
  paymentId: string;
  session: Session;
  refreshKey?: number;
  missingHint?: string;
}) {
  const [state, setState] = useState<ProofState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    let url = '';
    setState({ status: 'loading' });
    paymentProof(`/v1/condominiums/${condominiumId}/payments/${paymentId}/proof`, session)
      .then((value) => {
        if (!active || !(value instanceof Blob)) return;
        url = URL.createObjectURL(value);
        setState({ status: 'ready', url, contentType: value.type });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: 'missing',
          message:
            error instanceof Error ? error.message : 'No se pudo cargar el comprobante del pago.',
        });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [condominiumId, paymentId, session, refreshKey]);

  if (state.status === 'loading') {
    return (
      <div className="payments-proof-preview" role="status">
        Cargando comprobante…
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="payments-proof-preview" data-state="missing" role="status">
        <strong>{state.message}</strong>
        {missingHint ? <span>{missingHint}</span> : null}
      </div>
    );
  }

  const isPdf = state.contentType === 'application/pdf';
  return (
    <div className="payments-proof-preview" data-state="ready">
      {isPdf ? (
        <object
          aria-label="Comprobante del pago (PDF)"
          className="payments-proof-preview__frame"
          data={state.url}
          type="application/pdf"
        >
          <span>Tu navegador no muestra PDF aquí. Ábrelo en una pestaña nueva.</span>
        </object>
      ) : (
        <img alt="Comprobante del pago" className="payments-proof-preview__image" src={state.url} />
      )}
      <div className="payments-proof-uploader__actions">
        <Button
          onClick={() => window.open(state.url, '_blank', 'noopener,noreferrer')}
          size="sm"
          type="button"
          variant="secondary"
        >
          Abrir en pestaña nueva
        </Button>
      </div>
    </div>
  );
}
