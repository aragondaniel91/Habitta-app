import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import type { ImportKind } from '../help/module-help';
import {
  IMPORT_DEFINITIONS,
  downloadTemplate,
  parseCsv,
  validateImportRows,
  type ParsedCsv,
  type ValidatedImportRow,
} from './csv';

type Props = {
  condominiumId: string;
  kind: ImportKind;
  session: Session;
  onImported?: () => void;
};

type ImportResult = {
  count?: number;
  created?: number;
  created_buildings?: number;
  reused?: number;
  rejected?: number;
  imported?: number;
  message?: string;
};

type RemoteIssue = { row: number; error: string };
type PreviewResponse = { errors?: RemoteIssue[] };
type Stage = 'file' | 'preview' | 'complete';

const remoteErrorLabels: Record<string, string> = {
  'Unknown unit': 'La unidad no existe en Habitta',
  'Missing name': 'Falta el nombre o apellido',
  'Duplicate email': 'El correo está duplicado dentro del archivo',
  'Invalid email': 'El correo no es válido',
  'Invalid relationship': 'La relación con la unidad no es válida',
  'Invalid ownership percentage': 'El porcentaje de propiedad no es válido',
  'Ownership percentage only applies to owners':
    'El porcentaje de propiedad solo aplica a propietarios',
  'unit already exists': 'La unidad ya existe en Habitta',
  'unit_code is duplicated in the file': 'El código de unidad está duplicado en el archivo',
  'invalid unit_type': 'El tipo de unidad no es válido',
  'invalid status': 'El estado no es válido',
  'invalid ownership_percentage': 'El porcentaje de propiedad no es válido',
  'Invalid balance type': 'El tipo de saldo no es válido',
  'Invalid currency': 'La moneda no es válida',
  'Invalid amount': 'El monto no es válido',
  'Invalid date': 'La fecha no es válida',
  'Invalid due date': 'La fecha de deuda o vencimiento no es válida',
  'Conflicting debt dates': 'due_date y debt_date deben coincidir si se incluyen ambos',
};

const normalizedOpeningBalance = (row: Record<string, string>) => ({
  unit_code: row.unit_code?.trim() ?? '',
  balance_type: row.balance_type?.trim() ?? '',
  amount: row.amount?.trim() ?? '',
  currency_code: row.currency_code?.trim().toUpperCase() ?? '',
  effective_date: row.effective_date?.trim() ?? '',
  due_date: row.due_date?.trim() || row.debt_date?.trim() || undefined,
  description: row.description?.trim() || undefined,
});

const mergeRemoteIssues = (rows: ValidatedImportRow[], issues: RemoteIssue[]) => {
  const byRow = new Map<number, string[]>();
  issues.forEach((issue) => {
    const label = remoteErrorLabels[issue.error] ?? issue.error;
    byRow.set(issue.row, [...(byRow.get(issue.row) ?? []), label]);
  });
  return rows.map((row) => ({
    ...row,
    errors: [...new Set([...row.errors, ...(byRow.get(row.rowNumber) ?? [])])],
  }));
};

export function CsvImportWizard({ condominiumId, kind, session, onImported }: Props) {
  const definition = IMPORT_DEFINITIONS[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('file');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [rows, setRows] = useState<ValidatedImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const validRows = useMemo(() => rows.filter((row) => row.errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter((row) => row.errors.length > 0), [rows]);

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    try {
      if (file.size > 2_000_000) throw new Error('El archivo supera el límite de 2 MB.');
      const text = await file.text();
      const nextParsed = parseCsv(text);
      const nextRows = validateImportRows(kind, nextParsed);
      if (nextRows.length > 1000)
        throw new Error('La importación permite hasta 1.000 filas por archivo.');
      setFileName(file.name);
      setParsed(nextParsed);
      setRows(nextRows);
      setStage('file');
    } catch (fileError) {
      setFileName('');
      setParsed(null);
      setRows([]);
      setError(fileError instanceof Error ? fileError.message : 'No se pudo leer el archivo.');
    }
  };

  const preview = async () => {
    if (!parsed || !rows.length) return;
    setBusy(true);
    setError('');
    try {
      if (rows.some((row) => row.errors.length > 0)) {
        setStage('preview');
        return;
      }

      let response: PreviewResponse;
      if (kind === 'units') {
        response = await apiRequest<PreviewResponse>(
          `/v1/condominiums/${condominiumId}/imports/units/preview`,
          session,
          { method: 'POST', body: JSON.stringify({ rows: parsed.rows }) },
        );
      } else if (kind === 'people') {
        response = await apiRequest<PreviewResponse>(
          `/v1/condominiums/${condominiumId}/imports/people/preview`,
          session,
          { method: 'POST', body: JSON.stringify({ rows: parsed.rows }) },
        );
      } else {
        response = await apiRequest<PreviewResponse>(
          `/v1/condominiums/${condominiumId}/opening-balances/preview`,
          session,
          {
            method: 'POST',
            body: JSON.stringify({
              rows: rows.map((row) => normalizedOpeningBalance(row.data)),
              idempotencyKey: `preview-${crypto.randomUUID()}`,
              filename: fileName,
            }),
          },
        );
      }

      setRows(mergeRemoteIssues(rows, response.errors ?? []));
      setStage('preview');
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : 'No se pudo validar la importación.',
      );
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!validRows.length || invalidRows.length) return;
    setBusy(true);
    setError('');
    try {
      let nextResult: ImportResult;
      if (kind === 'units') {
        nextResult = await apiRequest<ImportResult>(
          `/v1/condominiums/${condominiumId}/imports/units/commit`,
          session,
          {
            method: 'POST',
            body: JSON.stringify({
              rows: validRows.map((row) => row.data),
              idempotencyKey: crypto.randomUUID(),
              filename: fileName,
            }),
          },
        );
      } else if (kind === 'people') {
        nextResult = await apiRequest<ImportResult>(
          `/v1/condominiums/${condominiumId}/people/import/commit`,
          session,
          {
            method: 'POST',
            body: JSON.stringify({
              rows: validRows.map((row) => row.data),
              idempotencyKey: crypto.randomUUID(),
            }),
          },
        );
      } else {
        nextResult = await apiRequest<ImportResult>(
          `/v1/condominiums/${condominiumId}/opening-balances/commit`,
          session,
          {
            method: 'POST',
            body: JSON.stringify({
              rows: validRows.map((row) => normalizedOpeningBalance(row.data)),
              idempotencyKey: crypto.randomUUID(),
              filename: fileName,
            }),
          },
        );
      }
      setResult(nextResult);
      setStage('complete');
      onImported?.();
    } catch (commitError) {
      setError(
        commitError instanceof Error ? commitError.message : 'No se pudo importar el archivo.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStage('file');
    setFileName('');
    setParsed(null);
    setRows([]);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  if (stage === 'complete') {
    const created = result?.imported ?? result?.created ?? result?.count ?? 0;
    return (
      <div className="csv-import csv-import--complete">
        <span className="csv-import__success">✓</span>
        <h3>Importación finalizada</h3>
        <p>Habitta procesó el archivo {fileName}.</p>
        <div className="csv-import__result">
          <div>
            <strong>{created}</strong>
            <span>{created === 1 ? 'Registro creado' : 'Registros creados'}</span>
          </div>
          <div>
            <strong>{result?.reused ?? result?.created_buildings ?? 0}</strong>
            <span>{kind === 'units' ? 'Torres creadas' : 'Reutilizados'}</span>
          </div>
          <div>
            <strong>{result?.rejected ?? 0}</strong>
            <span>Rechazados</span>
          </div>
        </div>
        <Button onClick={reset} variant="secondary">
          Importar otro archivo
        </Button>
      </div>
    );
  }

  return (
    <div className="csv-import">
      <div className="csv-import__intro">
        <div>
          <span className="help-kicker">Importación guiada</span>
          <h3>{definition.title}</h3>
          <p>{definition.description}</p>
        </div>
        <Button onClick={() => downloadTemplate(kind)} size="sm" variant="secondary">
          Descargar plantilla CSV
        </Button>
      </div>

      <div className="csv-import__spreadsheet-note">
        <strong>Puedes trabajar la plantilla en Excel o Google Sheets</strong>
        <span>
          Conserva los nombres de las columnas y guarda el archivo como CSV UTF-8 antes de subirlo.
        </span>
      </div>

      <ol className="csv-import__instructions">
        {definition.instructions.map((instruction) => (
          <li key={instruction}>{instruction}</li>
        ))}
      </ol>

      {error ? <div className="csv-import__alert">{error}</div> : null}

      {stage === 'file' ? (
        <>
          <label className="csv-import__dropzone">
            <input
              accept=".csv,text/csv,text/plain"
              onChange={(event) => void readFile(event)}
              ref={inputRef}
              type="file"
            />
            <strong>{fileName || 'Selecciona o arrastra un archivo CSV'}</strong>
            <span>Máximo 1.000 filas y 2 MB.</span>
          </label>
          {rows.length ? (
            <div className="csv-import__file-summary">
              <span>
                {rows.length} {rows.length === 1 ? 'fila detectada' : 'filas detectadas'}
              </span>
              <Badge tone={rows.some((row) => row.errors.length) ? 'warning' : 'success'}>
                {rows.filter((row) => row.errors.length).length}{' '}
                {rows.filter((row) => row.errors.length).length === 1
                  ? 'error local'
                  : 'errores locales'}
              </Badge>
            </div>
          ) : null}
          <div className="csv-import__actions">
            <Button disabled={!parsed || busy} onClick={() => void preview()}>
              {busy ? 'Validando…' : 'Validar y previsualizar'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="csv-import__summary-grid">
            <div>
              <strong>{rows.length}</strong>
              <span>{rows.length === 1 ? 'Fila en el archivo' : 'Filas en el archivo'}</span>
            </div>
            <div data-tone="success">
              <strong>{validRows.length}</strong>
              <span>{validRows.length === 1 ? 'Lista para importar' : 'Listas para importar'}</span>
            </div>
            <div data-tone="danger">
              <strong>{invalidRows.length}</strong>
              <span>
                {invalidRows.length === 1 ? 'Requiere corrección' : 'Requieren corrección'}
              </span>
            </div>
          </div>
          <div className="csv-import__table-wrap">
            <table className="csv-import__table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Referencia</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.data.unit_code || row.data.first_name || '—'}</td>
                    <td>
                      <Badge tone={row.errors.length ? 'warning' : 'success'}>
                        {row.errors.length ? 'Corregir' : 'Válida'}
                      </Badge>
                    </td>
                    <td>{row.errors.join(' · ') || 'Lista para importar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 ? (
            <p className="csv-import__note">Se muestran las primeras 100 filas.</p>
          ) : null}
          <div className="csv-import__actions">
            <Button onClick={() => setStage('file')} variant="secondary">
              Cambiar archivo
            </Button>
            <Button
              disabled={busy || invalidRows.length > 0 || validRows.length === 0}
              onClick={() => void commit()}
            >
              {busy
                ? 'Importando…'
                : `Importar ${validRows.length} ${validRows.length === 1 ? 'fila' : 'filas'}`}
            </Button>
          </div>
          {invalidRows.length ? (
            <p className="csv-import__note">
              Corrige el archivo y vuelve a validarlo. Habitta no guardará ninguna fila mientras
              existan errores en la vista previa.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
