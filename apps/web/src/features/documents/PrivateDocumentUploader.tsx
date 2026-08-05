import { useId, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button, Select } from '../../components/ui';
import { PRIVATE_DOCUMENT_ACCEPT, privateDocumentError, uploadPrivateDocument } from './api';

type DocumentTypeOption = { value: string; label: string };

type Props = {
  path: string;
  session: Session;
  title?: string;
  description?: string;
  documentTypes?: DocumentTypeOption[];
  defaultDocumentType?: string;
  visibility?: 'public' | 'internal';
  commentId?: string;
  disabled?: boolean;
  onUploaded: () => void | Promise<void>;
};

export function PrivateDocumentUploader({
  path,
  session,
  title = 'Agregar archivo',
  description = 'PDF, imágenes, Word, Excel o texto. Máximo 20 MB.',
  documentTypes,
  defaultDocumentType,
  visibility,
  commentId,
  disabled = false,
  onUploaded,
}: Props) {
  const inputId = useId();
  const [file, setFile] = useState<File>();
  const [documentType, setDocumentType] = useState(
    defaultDocumentType ?? documentTypes?.[0]?.value ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const upload = async () => {
    if (!file) return;
    const validationError = privateDocumentError(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const metadata: {
        documentType?: string;
        visibility?: 'public' | 'internal';
        commentId?: string;
      } = {};
      if (documentType) metadata.documentType = documentType;
      if (visibility) metadata.visibility = visibility;
      if (commentId) metadata.commentId = commentId;
      await uploadPrivateDocument(path, session, file, metadata);
      setFile(undefined);
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (input) input.value = '';
      setMessage('Documento guardado de forma privada.');
      await onUploaded();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'No se pudo guardar el documento.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="private-document-uploader">
      <div className="private-document-uploader__heading">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <span className="private-document-uploader__privacy">Privado</span>
      </div>
      {documentTypes?.length ? (
        <Select
          aria-label="Tipo de documento"
          disabled={disabled || saving}
          onChange={(event) => setDocumentType(event.target.value)}
          value={documentType}
        >
          {documentTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : null}
      <label className="private-document-uploader__file" htmlFor={inputId}>
        <input
          accept={PRIVATE_DOCUMENT_ACCEPT}
          disabled={disabled || saving}
          id={inputId}
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            setFile(nextFile);
            setError(nextFile ? privateDocumentError(nextFile) : '');
            setMessage('');
          }}
          type="file"
        />
        <span>{file?.name ?? 'Seleccionar archivo'}</span>
        <small>{file ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : 'Máximo 20 MB'}</small>
      </label>
      {error ? (
        <div className="private-document-message" data-tone="error">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="private-document-message" data-tone="success">
          {message}
        </div>
      ) : null}
      <Button
        disabled={disabled || saving || !file || Boolean(error)}
        onClick={() => void upload()}
        size="sm"
      >
        {saving ? 'Guardando…' : 'Cargar documento'}
      </Button>
    </div>
  );
}
