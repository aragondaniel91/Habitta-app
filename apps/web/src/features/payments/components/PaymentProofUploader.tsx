import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { paymentProof } from '../api';

export function PaymentProofUploader({
  condominiumId,
  paymentId,
  session,
  onDone,
}: {
  condominiumId: string;
  paymentId: string;
  session: Session;
  onDone: (message: string) => void;
}) {
  const [file, setFile] = useState<File>();
  return (
    <div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(event) => setFile(event.target.files?.[0])}
      />
      <button
        disabled={!file}
        onClick={() =>
          file &&
          void paymentProof(
            `/v1/condominiums/${condominiumId}/payments/${paymentId}/proof`,
            session,
            file,
          )
            .then(() => onDone('Comprobante guardado.'))
            .catch((error: Error) => onDone(error.message))
        }
      >
        Cargar o reemplazar
      </button>
    </div>
  );
}
