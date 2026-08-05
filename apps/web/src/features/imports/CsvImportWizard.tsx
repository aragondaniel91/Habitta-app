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
  created?: number;
  reused?: number;
  rejected?: number;
  imported?: number;
  message?: string;
};

type RemoteIssue = { row: number; error: string };
type Building = { id: string; name: string };
type Unit = { id: string; code: string };

type Stage = 'file' | 'preview' | 'complete';

const escapeCsv = (value: string) =>
  /[",\n\r;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const canonicalCsv = (kind: ImportKind, parsed: ParsedCsv) => {
  const headers = IMPORT_DEFINITIONS[kind].headers;
  return [
    headers.join(','),
    ...parsed.rows.map((row) => headers.map((header) => escapeCsv(row[header] ?? '')).join(',')),
  ].join('\n');
};

const normalizedOpeningBalance = (row: Record<string, string>) => ({
  unit_code: row.unit_code.trim(),
  balance_type: row.balance_type.trim(),
  amount: row.amount.trim(),
  currency_code: row.currency_code.trim().toUpperCase(),
  effective_date: row.effective_date.trim(),
  description: row.description.trim() || undefined,
});

const mergeRemoteIssues = (rows: ValidatedImportRow[], issues: RemoteIssue[]) => {
  const byRow = new Map<number, string[]>();
  issues.forEach((issue) => {
    byRow.set(issue.row, [...(byRow.get(issue.row) ?? []), issue.error]);
  });
  return rows.map((row) => ({
    ...row,
    errors: [...row.errors, ...(byRow.get(row.rowNumber) ?? [])],
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
      if (nextRows.length > 1000) throw new Error('La importación permite hasta 1.000 filas por archivo.');
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
      let nextRows = rows;
      if (kind === 'units') {
        const [buildings, units] = await Promise.all([
          apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
          apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
        ]);
        const existingCodes = new Set(units.map((unit) => unit.code.toLocaleLowerCase('en-US')));
        const buildingNames = new Set(
          buildings.map((building) => building.name.toLocaleLowerCase('es')),
        );
        nextRows = rows.map((row) => {
          const issues = [...row.errors];
          if (existingCodes.has(row.data.unit_code.toLocaleLowerCase('en-US')))
            issues.push('La unidad ya existe en Habitta');
          if (!row.data.building_name && buildingNames.size > 0)
            issues.push('building_name está vacío; la unidad se creará sin torre');
          return { ...row, errors: issues };
        });
      }
      if (kind === 'people') {
        const response = await apiRequest<{ errors?: RemoteIssue[] }>(
          `/v1/condominiums/${condominiumId}/people/import/preview`,
          session,
          { method: 'POST', body: JSON.stringify({ csv: canonicalCsv(kind, parsed) }) },
        );
        nextRows = mergeRemoteIssues(rows, response.errors ?? []);
      }
      if (kind === 'opening_balances') {
        const response = await apiRequest<{ errors?: RemoteIssue[] }>(
          `/v1/condominiums/${condominiumId}/opening-balances/preview`,
          session,
          {
            method: 'POST',
            body: JSON.stringify({
              rows: rows.filter((row) => row.errors.length === 0).map((row) => normalizedOpeningBalance(row.data)),
              idempotencyKey: `preview-${crypto.randomUUID()}`,
              filename: fileName,
            }),
          },
        );
        nextRows = mergeRemoteIssues(rows, response.errors ?? []);
      }
      setRows(nextRows);
      setStage('preview');
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : 'No se pudo validar la importación.',
      );
    } finally {
      setBusy(false);
    }
  };

  const importUnits = async () => {
    const [existingBuildings] = await Promise.all([
      apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
    ]);
    const buildings = new Map(
      existingBuildings.map((building) => [building.name.toLocaleLowerCase('es'), building]),
    );
    let imported = 0;
    let rejected = 0;

    for (const row of validRows) {
      try {
        let buildingId: string | undefined;
        const buildingName = row.data.building_name.trim();
        if (buildingName) {
          const key = buildingName.toLocaleLowerCase('es');
          let building = buildings.get(key);
          if (!building) {
            const created = await apiRequest<Building[] | Building>(
              `/v1/condominiums/${condominiumId}/buildings`,
              session,
              { method: 'POST', body: JSON.stringify({ name: buildingName }) },
            );
            building = Array.isArray(created) ? created[0] : created;
            if (!building?.id) throw new Error('No se pudo crear la torre.');
            buildings.set(key, building);
          }
          buildingId = building.id;
        }
        await apiRequest(`/v1/condominiums/${condominiumId}/units`, session, {
          method: 'POST',
          body: JSON.stringify({
            buildingId,
            code: row.data.unit_code.trim(),
            type: row.data.unit_type.trim(),
            floor: row.data.floor.trim() || undefined,
            ownershipPercentage: row.data.ownership_percentage
              ? Number(row.data.ownership_percentage)
              : undefined,
            status: row.data.status.trim() || 'active',
          }),
        });
        imported += 1;
      } catch {
        rejected += 1;
      }
    }
    return { imported, rejected };
  };

  const commit = async () => {
    if (!validRows.length || invalidRows.length) return;
    setBusy(true);
    setError('');
    try {
      let nextResult: ImportResult;
      if (kind === 'units') {
        nextResult = await importUnits();
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
      setError(commitError instanceof Error ? commitError.message : 'No se pudo importar el archivo.');
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
    return (
      <div className="csv-import csv-import--complete">
        <span className="csv-import__success">✓</span>
        <h3>Importación finalizada</h3>
        <p>Habitta procesó el archivo {fileName}.</p>
        <div className="csv-import__result">
          <div><strong>{result?.imported ?? result?.created ?? 0}</strong><span>Creados</span></div>
          <div><strong>{result?.reused ?? 0}</strong><span>Reutilizados</span></div>
          <div><strong>{result?.rejected ?? 0}</strong><span>Rechazados</span></div>
        </div>
        <Button onClick={reset} variant="secondary">Importar otro archivo</Button>
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

      <ol className="csv-import__instructions">
        {definition.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
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
              <span>{rows.length} filas detectadas</span>
              <Badge tone={rows.some((row) => row.errors.length) ? 'warning' : 'success'}>
                {rows.filter((row) => row.errors.length).length} errores locales
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
            <div><strong>{rows.length}</strong><span>Total de filas</span></div>
            <div data-tone="success"><strong>{validRows.length}</strong><span>Listas para importar</span></div>
            <div data-tone="danger"><strong>{invalidRows.length}</strong><span>Requieren corrección</span></div>
          </div>
          <div className="csv-import__table-wrap">
            <table className="csv-import__table">
              <thead>
                <tr><th>Fila</th><th>Referencia</th><th>Estado</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.data.unit_code || row.data.first_name || '—'}</td>
                    <td><Badge tone={row.errors.length ? 'warning' : 'success'}>{row.errors.length ? 'Corregir' : 'Válida'}</Badge></td>
                    <td>{row.errors.join(' · ') || 'Lista para importar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 ? <p className="csv-import__note">Se muestran las primeras 100 filas.</p> : null}
          <div className="csv-import__actions">
            <Button onClick={() => setStage('file')} variant="secondary">Cambiar archivo</Button>
            <Button disabled={busy || invalidRows.length > 0 || validRows.length === 0} onClick={() => void commit()}>
              {busy ? 'Importando…' : `Importar ${validRows.length} filas`}
            </Button>
          </div>
          {invalidRows.length ? <p className="csv-import__note">Corrige el archivo y vuelve a validarlo. Habitta no importará parcialmente una vista previa con errores.</p> : null}
        </>
      )}
    </div>
  );
}
