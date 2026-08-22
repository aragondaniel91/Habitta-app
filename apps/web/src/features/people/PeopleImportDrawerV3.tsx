import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormSection } from '../../components/FormLayout';
import { InlineNotice } from '../../components/WorkspaceUi';
import { Badge, Button, Field } from '../../components/ui';
import { peopleApi } from './api';
import type { Preview } from './types';
import './people-v3-controller.css';

export function PeopleImportDrawerV3({
  condominiumId,
  session,
  onClose,
  onImported,
}: {
  condominiumId: string;
  session: Session;
  onClose: () => void;
  onImported: (message: string) => Promise<void> | void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | ''>('');
  const [error, setError] = useState('');

  const previewCsv = async () => {
    if (!file) return;
    setBusy('preview');
    setError('');
    try {
      setPreview(
        await peopleApi(`/v1/condominiums/${condominiumId}/people/import/preview`, session, {
          method: 'POST',
          body: JSON.stringify({ csv: await file.text() }),
        }),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo revisar el CSV.');
    } finally {
      setBusy('');
    }
  };

  const commitImport = async () => {
    if (!preview?.valid.length) return;
    setBusy('commit');
    setError('');
    try {
      await peopleApi(`/v1/condominiums/${condominiumId}/people/import/commit`, session, {
        method: 'POST',
        body: JSON.stringify({ rows: preview.valid, idempotencyKey: crypto.randomUUID() }),
      });
      await onImported('Importación de personas completada.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo importar el CSV.',
      );
    } finally {
      setBusy('');
    }
  };

  return (
    <Drawer
      description="Primero previsualiza y valida. Habitta no confirma filas hasta que revises el resultado."
      eyebrow="Carga masiva"
      onClose={onClose}
      prefix="people-v3"
      presentation="workspace"
      title="Importar personas por CSV"
      wide
    >
      <div className="ux-form people-v3-import">
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

        <FormSection
          description="Selecciona un archivo CSV y revisa las filas válidas y los errores antes de confirmar."
          title="Archivo y validación"
          variant="card"
        >
          <Field label="Archivo CSV">
            <input
              accept=".csv,text/csv"
              className="input"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setError('');
              }}
              type="file"
            />
          </Field>
          <FormActions>
            <Button
              disabled={!file || Boolean(busy)}
              onClick={() => void previewCsv()}
              type="button"
              variant="secondary"
            >
              {busy === 'preview' ? 'Revisando…' : 'Previsualizar CSV'}
            </Button>
          </FormActions>
        </FormSection>

        {preview ? (
          <FormSection
            description="Corrige cualquier fila con error antes de confirmar si necesitas una importación completa."
            title="Resultado de la previsualización"
            variant="card"
          >
            <div className="people-v3-import__summary">
              <Badge tone="success">{preview.valid.length} válidas</Badge>
              <Badge tone={preview.errors.length ? 'warning' : 'neutral'}>
                {preview.errors.length} errores
              </Badge>
            </div>
            {preview.errors.length ? (
              <div className="people-v3-import__errors" role="list">
                {preview.errors.slice(0, 12).map((item) => (
                  <p key={`${item.row}:${item.error}`} role="listitem">
                    <strong>Fila {item.row}:</strong> {item.error}
                  </p>
                ))}
                {preview.errors.length > 12 ? (
                  <small>Se muestran los primeros 12 errores de {preview.errors.length}.</small>
                ) : null}
              </div>
            ) : (
              <InlineNotice tone="success">
                No se detectaron errores en la previsualización.
              </InlineNotice>
            )}
          </FormSection>
        ) : null}

        <FormActions sticky>
          <Button disabled={Boolean(busy)} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={!preview?.valid.length || Boolean(busy)}
            onClick={() => void commitImport()}
            type="button"
          >
            {busy === 'commit' ? 'Importando…' : 'Confirmar importación'}
          </Button>
        </FormActions>
      </div>
    </Drawer>
  );
}
