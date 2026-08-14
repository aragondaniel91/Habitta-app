import { useId, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../../../components/ui';
import { paymentProof } from '../api';
import './payment-proof-uploader.css';

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const ACCEPTED_PROOF_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const proofError = (file: File) => {
  if (!ACCEPTED_PROOF_TYPES.has(file.type)) return 'Usa JPEG, PNG, WebP o PDF.';
  if (file.size > MAX_PROOF_BYTES) return 'El comprobante no puede superar 10 MB.';
  return '';
};

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
  const inputId = useId();
  const [file, setFile] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const upload = async () => {
    if (!file) return;
    const validationError = proofError(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await paymentProof(
        `/v1/condominiums/${condominiumId}/payments/${paymentId}/proof`,
        session,
        file,
      );
      setSaved(true);
      onDone('Comprobante guardado.');
    } catch (uploadError) {
      const nextError =
        uploadError instanceof Error ? uploadError.message : 'No se pudo guardar el comprobante.';
      setError(nextError);
      onDone(nextError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="payments-proof-uploader">
      <label className="payments-proof-uploader__file" htmlFor={inputId}>
        <input
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={saving}
          id={inputId}
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            setFile(nextFile);
            setSaved(false);
            setError(nextFile ? proofError(nextFile) : '');
          }}
          type="file"
        />
        <span>
          <strong>{file?.name ?? 'Seleccionar comprobante'}</strong>
          <small>
            {file
              ? `${Math.max(1, Math.ceil(file.size / 1024))} KB`
              : 'JPEG, PNG, WebP o PDF · máximo 10 MB'}
          </small>
        </span>
      </label>

      {error ? (
        <div className="payments-form__message" data-tone="error" role="alert">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="payments-form__message" data-tone="success" role="status">
          Comprobante guardado de forma privada. Puedes reemplazarlo antes de enviar el pago.
        </div>
      ) : null}

      <div className="payments-proof-uploader__actions">
        {file ? (
          <Button
            disabled={saving}
            onClick={() => {
              setFile(undefined);
              setError('');
              setSaved(false);
              const input = document.getElementById(inputId) as HTMLInputElement | null;
              if (input) input.value = '';
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            Quitar
          </Button>
        ) : null}
        <Button
          disabled={!file || Boolean(error) || saving}
          onClick={() => void upload()}
          size="sm"
          type="button"
        >
          {saving ? 'Guardando…' : saved ? 'Reemplazar comprobante' : 'Guardar comprobante'}
        </Button>
      </div>
    </div>
  );
}
