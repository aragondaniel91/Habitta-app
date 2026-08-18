import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, FeesIcon, ReportsIcon, UnitsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton } from '../components/ui';
import { apiRequest } from '../lib/api';
import { csvFileName, downloadCsv } from '../lib/csv-export';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import { createStatementCsv } from '../lib/reports';
import {
  conceptCategoryLabels,
  getConceptName,
  getUnitCode,
  isSettledReceivable,
  parseOpeningBalancesCsv,
  receivableStatusLabels,
} from '../lib/receivables';
import type { ChargeConcept, ReceivableItem, ReceivableUnit } from '../lib/receivables';

export type ReceivablesDrawerMode =
  'receivable' | 'manual' | 'batch' | 'concept' | 'statement' | 'opening' | null;

type StatementRow = {
  effective_date: string;
  description: string;
  debit?: string;
  credit?: string;
  running_balance: string;
  currency_code: string;
  entry_type: string;
};

type BatchPayload = {
  conceptId: string;
  name: string;
  currencyCode: string;
  issueDate: string;
  dueDate: string;
  distributionMethod: 'fixed_per_unit';
  fixedAmount: string;
  rows: { unitId: string }[];
  idempotencyKey: string;
};

type BatchPreviewState = {
  payload: BatchPayload;
  result: { total: string; currencyCode: string; count: number };
};

type OpeningPreviewState = {
  valid: Record<string, string>[];
  errors: { row: number; error: string }[];
  idempotencyKey: string;
  filename: string;
};

type Props = {
  condominiumId: string;
  session: Session;
  mode: ReceivablesDrawerMode;
  selectedCurrency: string;
  selectedReceivable?: ReceivableItem;
  units: ReceivableUnit[];
  buildingNameById: Record<string, string>;
  concepts: ChargeConcept[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function Drawer({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="receivables-drawer-layer">
      <button
        aria-label="Cerrar panel"
        className="receivables-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside aria-label={title} aria-modal="true" className="receivables-drawer" role="dialog">
        <header className="receivables-drawer__header">
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button aria-label="Cerrar" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="receivables-drawer__content">{children}</div>
      </aside>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = ['paid', 'settled'].includes(status)
    ? 'success'
    : ['open', 'partially_paid'].includes(status)
      ? 'info'
      : 'neutral';
  return <Badge tone={tone}>{receivableStatusLabels[status] ?? status}</Badge>;
}

function Feedback({ message }: { message: string }) {
  return message ? (
    <div className="receivables-action-feedback" role="status">
      {message}
    </div>
  ) : null;
}

export function ReceivablesDrawerHost({
  condominiumId,
  session,
  mode,
  selectedCurrency,
  selectedReceivable,
  units,
  concepts,
  onClose,
  onRefresh,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [showReverseForm, setShowReverseForm] = useState(false);
  const [batchPreview, setBatchPreview] = useState<BatchPreviewState | null>(null);
  const [statementUnitId, setStatementUnitId] = useState('');
  const [statement, setStatement] = useState<StatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);
  const [openingFile, setOpeningFile] = useState<File | null>(null);
  const [openingPreview, setOpeningPreview] = useState<OpeningPreviewState | null>(null);

  useEffect(() => {
    setMessage('');
    setReverseReason('');
    setShowReverseForm(false);
    setBatchPreview(null);
    setStatementUnitId('');
    setStatement([]);
    setOpeningFile(null);
    setOpeningPreview(null);
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mode, onClose]);

  const activeUnits = units.filter((unit) => unit.status !== 'inactive');
  const activeConcepts = concepts.filter((concept) => concept.is_active !== false);

  const runAction = async (action: () => Promise<unknown>) => {
    setLoading(true);
    setMessage('');
    try {
      await action();
      await onRefresh();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.');
    } finally {
      setLoading(false);
    }
  };

  const submitManualCharge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const conceptId = String(values.get('conceptId') ?? '');
    const dueDate = String(values.get('dueDate') ?? '');
    const payload = {
      unitId: String(values.get('unitId') ?? ''),
      ...(conceptId ? { conceptId } : {}),
      description: String(values.get('description') ?? ''),
      amount: String(values.get('amount') ?? ''),
      currencyCode: String(values.get('currencyCode') ?? ''),
      issueDate: String(values.get('issueDate') ?? ''),
      ...(dueDate ? { dueDate } : {}),
    };
    void runAction(() =>
      apiRequest(`/v1/condominiums/${condominiumId}/receivables`, session, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  };

  const previewBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload: BatchPayload = {
      conceptId: String(values.get('conceptId') ?? ''),
      name: String(values.get('name') ?? ''),
      currencyCode: String(values.get('currencyCode') ?? ''),
      issueDate: String(values.get('issueDate') ?? ''),
      dueDate: String(values.get('dueDate') ?? ''),
      distributionMethod: 'fixed_per_unit',
      fixedAmount: String(values.get('fixedAmount') ?? ''),
      rows: activeUnits.map((unit) => ({ unitId: unit.id })),
      idempotencyKey: crypto.randomUUID(),
    };

    setLoading(true);
    setMessage('');
    try {
      const result = await apiRequest<BatchPreviewState['result']>(
        `/v1/condominiums/${condominiumId}/charge-batches/preview`,
        session,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      setBatchPreview({ payload, result });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo previsualizar el lote.');
    } finally {
      setLoading(false);
    }
  };

  const commitBatch = () => {
    if (!batchPreview) return;
    void runAction(() =>
      apiRequest(`/v1/condominiums/${condominiumId}/charge-batches/commit`, session, {
        method: 'POST',
        body: JSON.stringify(batchPreview.payload),
      }),
    );
  };

  const submitConcept = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const defaultAmount = String(values.get('defaultAmount') ?? '');
    const defaultCurrencyCode = String(values.get('defaultCurrencyCode') ?? '');
    const description = String(values.get('description') ?? '');
    const payload = {
      code: String(values.get('code') ?? ''),
      name: String(values.get('name') ?? ''),
      category: String(values.get('category') ?? ''),
      ...(description ? { description } : {}),
      ...(defaultCurrencyCode ? { defaultCurrencyCode } : {}),
      ...(defaultAmount ? { defaultAmount } : {}),
      isActive: true,
    };
    void runAction(() =>
      apiRequest(`/v1/condominiums/${condominiumId}/charge-concepts`, session, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  };

  const reverseReceivable = () => {
    if (!selectedReceivable || reverseReason.trim().length < 3) return;
    void runAction(() =>
      apiRequest(
        `/v1/condominiums/${condominiumId}/receivables/${selectedReceivable.id}/reverse`,
        session,
        { method: 'POST', body: JSON.stringify({ reason: reverseReason.trim() }) },
      ),
    );
  };

  const loadStatement = async (unitId: string) => {
    setStatementUnitId(unitId);
    setStatement([]);
    if (!unitId) return;
    setStatementLoading(true);
    setMessage('');
    try {
      setStatement(
        await apiRequest<StatementRow[]>(
          `/v1/condominiums/${condominiumId}/units/${unitId}/statement`,
          session,
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el estado de cuenta.');
    } finally {
      setStatementLoading(false);
    }
  };

  const previewOpeningBalances = async () => {
    if (!openingFile) return;
    setLoading(true);
    setMessage('');
    try {
      const rows = parseOpeningBalancesCsv(await openingFile.text());
      const idempotencyKey = crypto.randomUUID();
      const result = await apiRequest<{
        valid: Record<string, string>[];
        errors: { row: number; error: string }[];
      }>(`/v1/condominiums/${condominiumId}/opening-balances/preview`, session, {
        method: 'POST',
        body: JSON.stringify({ rows, idempotencyKey, filename: openingFile.name }),
      });
      setOpeningPreview({
        valid: result.valid,
        errors: result.errors,
        idempotencyKey,
        filename: openingFile.name,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo revisar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const commitOpeningBalances = () => {
    if (!openingPreview || openingPreview.errors.length) return;
    void runAction(() =>
      apiRequest(`/v1/condominiums/${condominiumId}/opening-balances/commit`, session, {
        method: 'POST',
        body: JSON.stringify({
          rows: openingPreview.valid,
          idempotencyKey: openingPreview.idempotencyKey,
          filename: openingPreview.filename,
        }),
      }),
    );
  };

  if (!mode) return null;

  if (mode === 'receivable' && selectedReceivable) {
    return (
      <Drawer eyebrow="Detalle de cuota" onClose={onClose} title={selectedReceivable.description}>
        <Feedback message={message} />
        <div className="receivables-detail-hero">
          <span>
            <FeesIcon size={24} />
          </span>
          <div>
            <StatusBadge status={selectedReceivable.status} />
            <strong>
              {formatDashboardAmount(
                selectedReceivable.outstanding_amount,
                selectedReceivable.currency_code,
              )}
            </strong>
            <small>Saldo pendiente</small>
          </div>
        </div>
        <dl className="receivables-detail-list">
          <div>
            <dt>Unidad</dt>
            <dd>{getUnitCode(selectedReceivable.unit_id, units)}</dd>
          </div>
          <div>
            <dt>Concepto</dt>
            <dd>{getConceptName(selectedReceivable.concept_id, concepts)}</dd>
          </div>
          <div>
            <dt>Moneda</dt>
            <dd>{selectedReceivable.currency_code}</dd>
          </div>
          <div>
            <dt>Emitida</dt>
            <dd>
              {selectedReceivable.issue_date
                ? formatDashboardDate(selectedReceivable.issue_date)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Vence</dt>
            <dd>
              {selectedReceivable.due_date
                ? formatDashboardDate(selectedReceivable.due_date)
                : 'Sin fecha'}
            </dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              {receivableStatusLabels[selectedReceivable.status] ?? selectedReceivable.status}
            </dd>
          </div>
        </dl>
        {!isSettledReceivable(selectedReceivable) ? (
          <section className="receivables-danger-zone">
            <div>
              <strong>Reversar cargo</strong>
              <p>El registro permanece en el historial y se exige un motivo.</p>
            </div>
            {!showReverseForm ? (
              <Button onClick={() => setShowReverseForm(true)} size="sm" variant="danger">
                Reversar
              </Button>
            ) : (
              <div className="receivables-reverse-form">
                <Field label="Motivo del reverso">
                  <textarea
                    minLength={3}
                    onChange={(event) => setReverseReason(event.target.value)}
                    placeholder="Explica por qué se reversa este cargo"
                    required
                    value={reverseReason}
                  />
                </Field>
                <div>
                  <Button onClick={() => setShowReverseForm(false)} size="sm" variant="secondary">
                    Cancelar
                  </Button>
                  <Button
                    disabled={loading || reverseReason.trim().length < 3}
                    onClick={reverseReceivable}
                    size="sm"
                    variant="danger"
                  >
                    {loading ? 'Reversando…' : 'Confirmar reverso'}
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </Drawer>
    );
  }

  if (mode === 'manual') {
    return (
      <Drawer eyebrow="Nuevo registro" onClose={onClose} title="Crear cuota manual">
        <Feedback message={message} />
        <p className="receivables-drawer-intro">
          Registra una obligación individual sin mezclar monedas ni modificar saldos directamente.
        </p>
        <form className="receivables-form" onSubmit={submitManualCharge}>
          <Field label="Unidad">
            <Select name="unitId" required>
              <option value="">Selecciona una unidad</option>
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Concepto" hint="Opcional para cargos excepcionales.">
            <Select name="conceptId">
              <option value="">Cargo manual</option>
              {activeConcepts.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descripción">
            <input name="description" placeholder="Ej. Cuota de mantenimiento agosto" required />
          </Field>
          <div className="receivables-form-grid">
            <Field label="Monto">
              <input
                inputMode="decimal"
                name="amount"
                pattern="^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$"
                placeholder="0.00"
                required
              />
            </Field>
            <Field label="Moneda">
              <Select defaultValue={selectedCurrency || 'USD'} name="currencyCode">
                <option value="USD">USD</option>
                <option value="VES">VES</option>
              </Select>
            </Field>
          </div>
          <div className="receivables-form-grid">
            <Field label="Fecha de emisión">
              <input defaultValue={todayIso()} name="issueDate" required type="date" />
            </Field>
            <Field label="Fecha de vencimiento">
              <input name="dueDate" type="date" />
            </Field>
          </div>
          <Button disabled={loading || !activeUnits.length} type="submit">
            {loading ? 'Guardando…' : 'Crear cuota'}
          </Button>
        </form>
      </Drawer>
    );
  }

  if (mode === 'batch') {
    return (
      <Drawer eyebrow="Cobranza masiva" onClose={onClose} title="Crear lote de cuotas">
        <Feedback message={message} />
        <p className="receivables-drawer-intro">
          Genera el mismo cargo para todas las unidades activas. Habitta exige una previsualización
          antes de publicarlo.
        </p>
        {!batchPreview ? (
          <form className="receivables-form" onSubmit={(event) => void previewBatch(event)}>
            <Field label="Concepto">
              <Select name="conceptId" required>
                <option value="">Selecciona un concepto</option>
                {activeConcepts.map((concept) => (
                  <option key={concept.id} value={concept.id}>
                    {concept.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre del lote">
              <input name="name" placeholder="Ej. Cuotas agosto 2026" required />
            </Field>
            <div className="receivables-form-grid">
              <Field label="Monto por unidad">
                <input inputMode="decimal" name="fixedAmount" placeholder="0.00" required />
              </Field>
              <Field label="Moneda">
                <Select defaultValue={selectedCurrency || 'USD'} name="currencyCode">
                  <option value="USD">USD</option>
                  <option value="VES">VES</option>
                </Select>
              </Field>
            </div>
            <div className="receivables-form-grid">
              <Field label="Emisión">
                <input defaultValue={todayIso()} name="issueDate" required type="date" />
              </Field>
              <Field label="Vencimiento">
                <input name="dueDate" required type="date" />
              </Field>
            </div>
            <div className="receivables-batch-note">
              <UnitsIcon size={20} />
              <div>
                <strong>{activeUnits.length} unidades activas</strong>
                <span>El lote se aplicará una vez a cada unidad.</span>
              </div>
            </div>
            <Button disabled={loading || !activeUnits.length} type="submit">
              {loading ? 'Calculando…' : 'Previsualizar lote'}
            </Button>
          </form>
        ) : (
          <div className="receivables-preview-card">
            <span>
              <CheckCircleIcon size={24} />
            </span>
            <div>
              <small>Previsualización lista</small>
              <strong>{batchPreview.result.count} cuotas</strong>
              <b>
                {formatDashboardAmount(batchPreview.result.total, batchPreview.result.currencyCode)}
              </b>
              <p>Concepto: {getConceptName(batchPreview.payload.conceptId, concepts)}</p>
            </div>
            <div className="receivables-preview-actions">
              <Button onClick={() => setBatchPreview(null)} size="sm" variant="secondary">
                Editar
              </Button>
              <Button disabled={loading} onClick={commitBatch} size="sm">
                {loading ? 'Publicando…' : 'Publicar lote'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    );
  }

  if (mode === 'concept') {
    return (
      <Drawer eyebrow="Catálogo" onClose={onClose} title="Crear concepto de cobro">
        <Feedback message={message} />
        <p className="receivables-drawer-intro">
          Los conceptos ayudan a clasificar cuotas y preparar lotes recurrentes de forma
          consistente.
        </p>
        <form className="receivables-form" onSubmit={submitConcept}>
          <div className="receivables-form-grid">
            <Field label="Código">
              <input maxLength={32} name="code" placeholder="MANT" required />
            </Field>
            <Field label="Categoría">
              <Select defaultValue="regular_dues" name="category">
                {Object.entries(conceptCategoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Nombre">
            <input name="name" placeholder="Cuota de mantenimiento" required />
          </Field>
          <Field label="Descripción">
            <textarea name="description" placeholder="Uso interno y alcance del concepto" />
          </Field>
          <div className="receivables-form-grid">
            <Field label="Moneda sugerida">
              <Select defaultValue="" name="defaultCurrencyCode">
                <option value="">Sin valor predeterminado</option>
                <option value="USD">USD</option>
                <option value="VES">VES</option>
              </Select>
            </Field>
            <Field label="Monto sugerido">
              <input inputMode="decimal" name="defaultAmount" placeholder="Opcional" />
            </Field>
          </div>
          <Button disabled={loading} type="submit">
            {loading ? 'Guardando…' : 'Crear concepto'}
          </Button>
        </form>
      </Drawer>
    );
  }

  if (mode === 'statement') {
    const statementUnitCode = units.find((unit) => unit.id === statementUnitId)?.code ?? 'unidad';
    return (
      <Drawer eyebrow="Consulta" onClose={onClose} title="Estado de cuenta por unidad">
        <Feedback message={message} />
        <Field label="Unidad">
          <Select
            onChange={(event) => void loadStatement(event.target.value)}
            value={statementUnitId}
          >
            <option value="">Selecciona una unidad</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code}
              </option>
            ))}
          </Select>
        </Field>
        {statementLoading ? <Skeleton className="receivables-statement-skeleton" /> : null}
        {!statementLoading && statementUnitId && !statement.length ? (
          <EmptyState
            description="Esta unidad todavía no tiene movimientos financieros."
            icon={<ReportsIcon size={26} />}
            title="Estado de cuenta vacío"
          />
        ) : null}
        {statement.length ? (
          <div className="receivables-statement-actions">
            <Button
              onClick={() =>
                downloadCsv(
                  csvFileName('estado-de-cuenta', statementUnitCode),
                  createStatementCsv(statement, statementUnitCode),
                )
              }
              size="sm"
              variant="secondary"
            >
              Descargar CSV
            </Button>
            {/* The browser's print dialog saves to PDF, so a statement reaches an owner without
                pulling a PDF library into the Worker. */}
            <Button onClick={() => window.print()} size="sm" variant="secondary">
              Imprimir o guardar PDF
            </Button>
          </div>
        ) : null}
        {statement.length ? (
          <div className="receivables-statement-list">
            {statement.map((row, index) => (
              <article key={`${row.effective_date}-${row.entry_type}-${index}`}>
                <div>
                  <strong>{row.description}</strong>
                  <span>
                    {formatDashboardDate(row.effective_date)} · {row.entry_type}
                  </span>
                </div>
                <div>
                  <small>
                    {row.debit
                      ? `Débito ${formatDashboardAmount(row.debit, row.currency_code)}`
                      : row.credit
                        ? `Crédito ${formatDashboardAmount(row.credit, row.currency_code)}`
                        : 'Sin movimiento'}
                  </small>
                  <b>{formatDashboardAmount(row.running_balance, row.currency_code)}</b>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </Drawer>
    );
  }

  return (
    <Drawer eyebrow="Migración financiera" onClose={onClose} title="Importar saldos iniciales">
      <Feedback message={message} />
      <div className="receivables-upload-guide">
        <ReportsIcon size={24} />
        <div>
          <strong>Archivo CSV controlado</strong>
          <p>
            Usa unit_code, balance_type, amount, currency_code, effective_date, description. Si el
            código se repite entre edificios, usa building_name antes de unit_code.
          </p>
        </div>
      </div>
      <Field label="Archivo CSV">
        <input
          accept=".csv,text/csv"
          onChange={(event) => {
            setOpeningFile(event.target.files?.[0] ?? null);
            setOpeningPreview(null);
          }}
          type="file"
        />
      </Field>
      {!openingPreview ? (
        <Button disabled={!openingFile || loading} onClick={() => void previewOpeningBalances()}>
          {loading ? 'Revisando…' : 'Previsualizar archivo'}
        </Button>
      ) : (
        <div className="receivables-opening-preview">
          <div>
            <span data-tone="success">
              <CheckCircleIcon size={20} />
            </span>
            <div>
              <strong>{openingPreview.valid.length} filas válidas</strong>
              <small>Listas para importar</small>
            </div>
          </div>
          <div>
            <span data-tone={openingPreview.errors.length ? 'warning' : 'success'}>
              <ReportsIcon size={20} />
            </span>
            <div>
              <strong>{openingPreview.errors.length} errores</strong>
              <small>
                {openingPreview.errors.length
                  ? 'Deben corregirse antes de continuar'
                  : 'El archivo pasó la validación'}
              </small>
            </div>
          </div>
          {openingPreview.errors.length ? (
            <div className="receivables-opening-errors">
              {openingPreview.errors.map((item) => (
                <p key={`${item.row}-${item.error}`}>
                  Fila {item.row}: {item.error}
                </p>
              ))}
            </div>
          ) : (
            <Button disabled={loading} onClick={commitOpeningBalances}>
              {loading ? 'Importando…' : 'Confirmar importación'}
            </Button>
          )}
        </div>
      )}
    </Drawer>
  );
}
