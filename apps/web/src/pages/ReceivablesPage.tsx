import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  FeesIcon,
  ReportsIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { apiRequest } from '../lib/api';
import {
  formatDashboardAmount,
  formatDashboardDate,
} from '../lib/dashboard';
import type { ReceivableAging, ReceivableSummary } from '../lib/dashboard';
import {
  conceptCategoryLabels,
  filterReceivables,
  getAgingForCurrency,
  getAgingSegments,
  getConceptName,
  getOverdueAmount,
  getReceivableCurrencies,
  getReceivableDueState,
  getReceivableStatusCounts,
  getSummaryForCurrency,
  getUnitCode,
  isSettledReceivable,
  parseOpeningBalancesCsv,
  receivableStatusLabels,
  sortReceivables,
} from '../lib/receivables';
import type {
  ChargeConcept,
  ReceivableFilters,
  ReceivableItem,
  ReceivableUnit,
} from '../lib/receivables';

type StatementRow = {
  effective_date: string;
  description: string;
  debit?: string;
  credit?: string;
  running_balance: string;
  currency_code: string;
  entry_type: string;
};

type ReceivablesData = {
  units: ReceivableUnit[];
  concepts: ChargeConcept[];
  items: ReceivableItem[];
  summaries: ReceivableSummary[];
  aging: ReceivableAging[];
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

type BatchPreview = {
  total: string;
  currencyCode: string;
  count: number;
};

type BatchPreviewState = {
  payload: BatchPayload;
  result: BatchPreview;
};

type OpeningPreviewState = {
  rows: Record<string, string>[];
  valid: Record<string, string>[];
  errors: { row: number; error: string }[];
  idempotencyKey: string;
  filename: string;
};

type DrawerMode =
  | 'receivable'
  | 'manual'
  | 'batch'
  | 'concept'
  | 'statement'
  | 'opening'
  | null;

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const initialFilters: ReceivableFilters = {
  query: '',
  unitId: '',
  conceptId: '',
  currencyCode: '',
  status: '',
  due: '',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function CurrencyTabs({
  currencies,
  selected,
  onChange,
}: {
  currencies: string[];
  selected: string;
  onChange: (currency: string) => void;
}) {
  return (
    <div className="receivables-currency-tabs" aria-label="Seleccionar moneda">
      {currencies.map((currency) => (
        <button
          aria-pressed={selected === currency}
          data-active={selected === currency || undefined}
          key={currency}
          onClick={() => onChange(currency)}
          type="button"
        >
          {currency}
        </button>
      ))}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
}) {
  return (
    <Surface className="receivables-metric" data-tone={tone}>
      <div className="receivables-metric__heading">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function ReceivablesLoading() {
  return (
    <div className="receivables-page" aria-label="Cargando cuentas por cobrar">
      <div className="receivables-overview">
        <Skeleton className="skeleton--title" />
        <Skeleton className="skeleton--badge" />
      </div>
      <div className="receivables-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <div className="receivables-insights-grid">
        <Skeleton className="receivables-panel-skeleton" />
        <Skeleton className="receivables-panel-skeleton" />
      </div>
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

function ActionFeedback({ message }: { message: string }) {
  return message ? (
    <div className="receivables-action-feedback" role="status">
      {message}
    </div>
  ) : null;
}

export function ReceivablesPage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<ReceivablesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [filters, setFilters] = useState<ReceivableFilters>(initialFilters);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [showReverseForm, setShowReverseForm] = useState(false);
  const [batchPreview, setBatchPreview] = useState<BatchPreviewState | null>(null);
  const [statementUnitId, setStatementUnitId] = useState('');
  const [statement, setStatement] = useState<StatementRow[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);
  const [openingFile, setOpeningFile] = useState<File | null>(null);
  const [openingPreview, setOpeningPreview] = useState<OpeningPreviewState | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      try {
        const [units, concepts, items, summaries, aging] = await Promise.all([
          apiRequest<ReceivableUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          apiRequest<ChargeConcept[]>(
            `/v1/condominiums/${condominiumId}/charge-concepts`,
            session,
          ),
          apiRequest<ReceivableItem[]>(
            `/v1/condominiums/${condominiumId}/receivables`,
            session,
          ),
          apiRequest<ReceivableSummary[]>(
            `/v1/condominiums/${condominiumId}/receivables/summary`,
            session,
          ),
          apiRequest<ReceivableAging[]>(
            `/v1/condominiums/${condominiumId}/receivables/aging`,
            session,
          ),
        ]);
        setData({ units, concepts, items, summaries, aging });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudieron cargar las cuentas por cobrar.',
        );
      } finally {
        if (!background) setLoading(false);
      }
    },
    [condominiumId, session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDrawer(null);
    setFilters(initialFilters);
    setSelectedReceivableId('');
    setActionMessage('');
  }, [condominiumId]);

  useEffect(() => {
    if (!drawer) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawer]);

  const currencies = useMemo(
    () => (data ? getReceivableCurrencies(data.summaries, data.aging, data.items) : []),
    [data],
  );

  useEffect(() => {
    const nextCurrency = currencies[0] ?? '';
    if (!selectedCurrency || !currencies.includes(selectedCurrency)) {
      setSelectedCurrency(nextCurrency);
    }
  }, [currencies, selectedCurrency]);

  const visibleItems = useMemo(() => {
    if (!data) return [];
    return sortReceivables(
      filterReceivables(data.items, data.units, data.concepts, {
        ...filters,
        currencyCode: selectedCurrency,
      }),
    );
  }, [data, filters, selectedCurrency]);

  if (loading && !data) return <ReceivablesLoading />;

  if (error && !data) {
    return (
      <Surface className="receivables-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error}
          icon={<FeesIcon size={28} />}
          onAction={() => void load()}
          title="No pudimos cargar las cuotas"
        />
      </Surface>
    );
  }

  if (!data) return null;

  const summary = getSummaryForCurrency(data.summaries, selectedCurrency || 'USD');
  const aging = getAgingForCurrency(data.aging, selectedCurrency);
  const agingSegments = getAgingSegments(aging);
  const overdue = getOverdueAmount(aging);
  const statusCounts = getReceivableStatusCounts(data.items, selectedCurrency);
  const selectedReceivable = data.items.find((item) => item.id === selectedReceivableId);
  const selectedUnit = selectedReceivable
    ? getUnitCode(selectedReceivable.unit_id, data.units)
    : '';
  const selectedConcept = selectedReceivable
    ? getConceptName(selectedReceivable.concept_id, data.concepts)
    : '';
  const activeUnits = data.units.filter((unit) => unit.status !== 'inactive');

  const closeDrawer = () => {
    setDrawer(null);
    setActionMessage('');
    setReverseReason('');
    setShowReverseForm(false);
    setBatchPreview(null);
    setOpeningPreview(null);
  };

  const openDrawer = (mode: Exclude<DrawerMode, null>) => {
    setActionMessage('');
    setDrawer(mode);
  };

  const runAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    closeAfter = true,
  ) => {
    setActionLoading(true);
    setActionMessage('');
    try {
      await action();
      await load(true);
      setActionMessage(successMessage);
      if (closeAfter) closeDrawer();
      return true;
    } catch (actionError) {
      setActionMessage(
        actionError instanceof Error ? actionError.message : 'No se pudo completar la operación.',
      );
      return false;
    } finally {
      setActionLoading(false);
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
    void runAction(
      () =>
        apiRequest(`/v1/condominiums/${condominiumId}/receivables`, session, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      'La cuota fue creada correctamente.',
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

    setActionLoading(true);
    setActionMessage('');
    try {
      const result = await apiRequest<BatchPreview>(
        `/v1/condominiums/${condominiumId}/charge-batches/preview`,
        session,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      setBatchPreview({ payload, result });
    } catch (previewError) {
      setActionMessage(
        previewError instanceof Error ? previewError.message : 'No se pudo previsualizar el lote.',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const commitBatch = () => {
    if (!batchPreview) return;
    void runAction(
      () =>
        apiRequest(`/v1/condominiums/${condominiumId}/charge-batches/commit`, session, {
          method: 'POST',
          body: JSON.stringify(batchPreview.payload),
        }),
      'El lote fue publicado correctamente.',
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
    void runAction(
      () =>
        apiRequest(`/v1/condominiums/${condominiumId}/charge-concepts`, session, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      'El concepto fue creado correctamente.',
    );
  };

  const loadStatement = async (unitId: string) => {
    setStatementUnitId(unitId);
    setStatement([]);
    if (!unitId) return;
    setStatementLoading(true);
    setActionMessage('');
    try {
      setStatement(
        await apiRequest<StatementRow[]>(
          `/v1/condominiums/${condominiumId}/units/${unitId}/statement`,
          session,
        ),
      );
    } catch (statementError) {
      setActionMessage(
        statementError instanceof Error
          ? statementError.message
          : 'No se pudo cargar el estado de cuenta.',
      );
    } finally {
      setStatementLoading(false);
    }
  };

  const previewOpeningBalances = async () => {
    if (!openingFile) return;
    setActionLoading(true);
    setActionMessage('');
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
        rows,
        valid: result.valid,
        errors: result.errors,
        idempotencyKey,
        filename: openingFile.name,
      });
    } catch (previewError) {
      setActionMessage(
        previewError instanceof Error ? previewError.message : 'No se pudo revisar el archivo.',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const commitOpeningBalances = () => {
    if (!openingPreview || openingPreview.errors.length) return;
    void runAction(
      () =>
        apiRequest(`/v1/condominiums/${condominiumId}/opening-balances/commit`, session, {
          method: 'POST',
          body: JSON.stringify({
            rows: openingPreview.valid,
            idempotencyKey: openingPreview.idempotencyKey,
            filename: openingPreview.filename,
          }),
        }),
      'Los saldos iniciales fueron importados correctamente.',
    );
  };

  const reverseReceivable = () => {
    if (!selectedReceivable || reverseReason.trim().length < 3) return;
    void runAction(
      () =>
        apiRequest(
          `/v1/condominiums/${condominiumId}/receivables/${selectedReceivable.id}/reverse`,
          session,
          { method: 'POST', body: JSON.stringify({ reason: reverseReason.trim() }) },
        ),
      'El cargo fue reversado correctamente.',
    );
  };

  return (
    <div className="receivables-page">
      <header className="receivables-overview">
        <div>
          <span className="receivables-kicker">Control financiero</span>
          <h2>Cuotas y cuentas por cobrar</h2>
          <p>{condominiumName} · cartera separada por moneda y trazabilidad completa.</p>
        </div>
        <div className="receivables-overview__actions">
          <Button onClick={() => openDrawer('statement')} size="sm" variant="secondary">
            Estado de cuenta
          </Button>
          <Button onClick={() => openDrawer('batch')} size="sm" variant="secondary">
            Crear lote
          </Button>
          <Button onClick={() => openDrawer('manual')} size="sm">
            Nueva cuota
          </Button>
        </div>
      </header>

      {error ? (
        <div className="receivables-inline-alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}

      <div className="receivables-currency-row">
        <div>
          <strong>Vista financiera</strong>
          <span>Nunca se combinan valores de monedas diferentes.</span>
        </div>
        {currencies.length ? (
          <CurrencyTabs
            currencies={currencies}
            onChange={setSelectedCurrency}
            selected={selectedCurrency}
          />
        ) : null}
      </div>

      <section className="receivables-metrics-grid" aria-label="Indicadores de cartera">
        <MetricCard
          detail="Saldo neto aún pendiente de cobro."
          icon={<FeesIcon size={20} />}
          label="Saldo pendiente"
          tone="blue"
          value={formatDashboardAmount(summary.net_outstanding, selectedCurrency || 'USD')}
        />
        <MetricCard
          detail="Cargos registrados en el libro financiero."
          icon={<ReportsIcon size={20} />}
          label="Débitos acumulados"
          tone="navy"
          value={formatDashboardAmount(summary.total_debits, selectedCurrency || 'USD')}
        />
        <MetricCard
          detail="Pagos, créditos y ajustes aplicados."
          icon={<CheckCircleIcon size={20} />}
          label="Créditos aplicados"
          tone="green"
          value={formatDashboardAmount(summary.total_credits, selectedCurrency || 'USD')}
        />
        <MetricCard
          detail="Cartera con fecha de vencimiento superada."
          icon={<FeesIcon size={20} />}
          label="Saldo vencido"
          tone="red"
          value={formatDashboardAmount(overdue, selectedCurrency || 'USD')}
        />
      </section>

      <section className="receivables-insights-grid">
        <Surface className="receivables-panel receivables-aging-panel">
          <div className="receivables-section-heading">
            <div>
              <span className="receivables-kicker">Antigüedad</span>
              <h2>Edad de la cartera</h2>
              <p>Visualiza cuánto está al día y cuánto necesita gestión de cobranza.</p>
            </div>
            {selectedCurrency ? <Badge tone="info">{selectedCurrency}</Badge> : null}
          </div>
          <div className="receivables-aging-bar" aria-label="Distribución por antigüedad">
            {agingSegments.map((segment) => (
              <span
                data-bucket={segment.key}
                key={segment.key}
                style={{ width: `${segment.percentage}%` }}
                title={`${segment.label}: ${segment.percentage.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="receivables-aging-list">
            {agingSegments.map((segment) => (
              <div key={segment.key}>
                <span data-bucket={segment.key} />
                <div>
                  <strong>{segment.label}</strong>
                  <small>{segment.percentage.toFixed(1)}% de la cartera</small>
                </div>
                <b>{formatDashboardAmount(segment.amount, selectedCurrency || 'USD')}</b>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="receivables-panel receivables-status-panel">
          <div className="receivables-section-heading">
            <div>
              <span className="receivables-kicker">Estado</span>
              <h2>Composición de cargos</h2>
              <p>Volumen de obligaciones según su estado actual.</p>
            </div>
          </div>
          <div className="receivables-status-list">
            <button
              onClick={() => setFilters({ ...filters, status: 'open' })}
              type="button"
            >
              <span data-tone="blue"><FeesIcon size={18} /></span>
              <div><strong>Pendientes</strong><small>Sin pagos aplicados</small></div>
              <b>{statusCounts.open}</b>
            </button>
            <button
              onClick={() => setFilters({ ...filters, status: 'partially_paid' })}
              type="button"
            >
              <span data-tone="warning"><ReportsIcon size={18} /></span>
              <div><strong>Pagos parciales</strong><small>Con saldo restante</small></div>
              <b>{statusCounts.partiallyPaid}</b>
            </button>
            <button
              onClick={() => setFilters({ ...filters, status: 'settled' })}
              type="button"
            >
              <span data-tone="green"><CheckCircleIcon size={18} /></span>
              <div><strong>Saldados</strong><small>Pagados o cerrados</small></div>
              <b>{statusCounts.settled}</b>
            </button>
            <button
              onClick={() => setFilters({ ...filters, status: 'reversed' })}
              type="button"
            >
              <span data-tone="neutral"><FeesIcon size={18} /></span>
              <div><strong>Reversados</strong><small>Conservan su historial</small></div>
              <b>{statusCounts.reversed}</b>
            </button>
          </div>
        </Surface>
      </section>

      <Surface className="receivables-workspace">
        <div className="receivables-workspace__heading">
          <div>
            <span className="receivables-kicker">Cartera</span>
            <h2>Cargos registrados</h2>
            <p>{visibleItems.length} resultados en {selectedCurrency || 'la moneda seleccionada'}.</p>
          </div>
          <div className="receivables-tools-menu">
            <Button onClick={() => openDrawer('concept')} size="sm" variant="ghost">
              Nuevo concepto
            </Button>
            <Button onClick={() => openDrawer('opening')} size="sm" variant="ghost">
              Importar saldos
            </Button>
            <Button disabled={loading} onClick={() => void load()} size="sm" variant="ghost">
              {loading ? 'Actualizando…' : 'Actualizar'}
            </Button>
          </div>
        </div>

        <div className="receivables-filter-grid">
          <label className="receivables-search">
            <span>Buscar</span>
            <input
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              placeholder="Unidad, concepto o descripción"
              type="search"
              value={filters.query}
            />
          </label>
          <label>
            <span>Unidad</span>
            <Select
              onChange={(event) => setFilters({ ...filters, unitId: event.target.value })}
              value={filters.unitId}
            >
              <option value="">Todas</option>
              {data.units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.code}</option>
              ))}
            </Select>
          </label>
          <label>
            <span>Concepto</span>
            <Select
              onChange={(event) => setFilters({ ...filters, conceptId: event.target.value })}
              value={filters.conceptId}
            >
              <option value="">Todos</option>
              {data.concepts.map((concept) => (
                <option key={concept.id} value={concept.id}>{concept.name}</option>
              ))}
            </Select>
          </label>
          <label>
            <span>Estado</span>
            <Select
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              value={filters.status}
            >
              <option value="">Todos</option>
              <option value="open">Pendiente</option>
              <option value="partially_paid">Pago parcial</option>
              <option value="paid">Pagado</option>
              <option value="settled">Saldado</option>
              <option value="reversed">Reversado</option>
            </Select>
          </label>
          <label>
            <span>Vencimiento</span>
            <Select
              onChange={(event) =>
                setFilters({ ...filters, due: event.target.value as ReceivableFilters['due'] })
              }
              value={filters.due}
            >
              <option value="">Todos</option>
              <option value="overdue">Vencidos</option>
              <option value="upcoming">Vigentes</option>
              <option value="without_due_date">Sin fecha</option>
            </Select>
          </label>
          <Button
            disabled={Object.values(filters).every((value) => !value)}
            onClick={() => setFilters(initialFilters)}
            size="sm"
            variant="secondary"
          >
            Limpiar
          </Button>
        </div>

        {visibleItems.length ? (
          <div className="receivables-table-wrap">
            <table className="receivables-table">
              <thead>
                <tr>
                  <th>Cuota</th>
                  <th>Unidad</th>
                  <th>Emisión</th>
                  <th>Vencimiento</th>
                  <th>Saldo</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const dueState = getReceivableDueState(item);
                  return (
                    <tr key={item.id}>
                      <td data-label="Cuota">
                        <div className="receivables-item-name">
                          <span><FeesIcon size={18} /></span>
                          <div>
                            <strong>{item.description}</strong>
                            <small>{getConceptName(item.concept_id, data.concepts)}</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Unidad"><strong>{getUnitCode(item.unit_id, data.units)}</strong></td>
                      <td data-label="Emisión">{item.issue_date ? formatDashboardDate(item.issue_date) : '—'}</td>
                      <td data-label="Vencimiento">
                        <span className="receivables-due" data-state={dueState}>
                          {item.due_date ? formatDashboardDate(item.due_date) : 'Sin fecha'}
                        </span>
                      </td>
                      <td data-label="Saldo"><strong>{formatDashboardAmount(item.outstanding_amount, item.currency_code)}</strong></td>
                      <td data-label="Estado"><StatusBadge status={item.status} /></td>
                      <td>
                        <button
                          aria-label={`Ver ${item.description}`}
                          onClick={() => {
                            setSelectedReceivableId(item.id);
                            openDrawer('receivable');
                          }}
                          type="button"
                        >
                          <ArrowRightIcon size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            actionLabel="Limpiar filtros"
            description="Prueba otra búsqueda o registra una nueva cuota para comenzar."
            icon={<FeesIcon size={27} />}
            onAction={() => setFilters(initialFilters)}
            title="No hay cargos para esta vista"
          />
        )}
      </Surface>

      {drawer === 'receivable' && selectedReceivable ? (
        <Drawer eyebrow="Detalle de cuota" onClose={closeDrawer} title={selectedReceivable.description}>
          <ActionFeedback message={actionMessage} />
          <div className="receivables-detail-hero">
            <span><FeesIcon size={24} /></span>
            <div>
              <StatusBadge status={selectedReceivable.status} />
              <strong>{formatDashboardAmount(selectedReceivable.outstanding_amount, selectedReceivable.currency_code)}</strong>
              <small>Saldo pendiente</small>
            </div>
          </div>
          <dl className="receivables-detail-list">
            <div><dt>Unidad</dt><dd>{selectedUnit}</dd></div>
            <div><dt>Concepto</dt><dd>{selectedConcept}</dd></div>
            <div><dt>Moneda</dt><dd>{selectedReceivable.currency_code}</dd></div>
            <div><dt>Emitida</dt><dd>{selectedReceivable.issue_date ? formatDashboardDate(selectedReceivable.issue_date) : '—'}</dd></div>
            <div><dt>Vence</dt><dd>{selectedReceivable.due_date ? formatDashboardDate(selectedReceivable.due_date) : 'Sin fecha'}</dd></div>
            <div><dt>Estado</dt><dd>{receivableStatusLabels[selectedReceivable.status] ?? selectedReceivable.status}</dd></div>
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
                    <Button onClick={() => setShowReverseForm(false)} size="sm" variant="secondary">Cancelar</Button>
                    <Button
                      disabled={actionLoading || reverseReason.trim().length < 3}
                      onClick={reverseReceivable}
                      size="sm"
                      variant="danger"
                    >
                      {actionLoading ? 'Reversando…' : 'Confirmar reverso'}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </Drawer>
      ) : null}

      {drawer === 'manual' ? (
        <Drawer eyebrow="Nuevo registro" onClose={closeDrawer} title="Crear cuota manual">
          <ActionFeedback message={actionMessage} />
          <p className="receivables-drawer-intro">Registra una obligación individual sin mezclar monedas ni modificar saldos directamente.</p>
          <form className="receivables-form" onSubmit={submitManualCharge}>
            <Field label="Unidad">
              <Select name="unitId" required>
                <option value="">Selecciona una unidad</option>
                {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
              </Select>
            </Field>
            <Field label="Concepto" hint="Opcional para cargos excepcionales.">
              <Select name="conceptId">
                <option value="">Cargo manual</option>
                {data.concepts.filter((concept) => concept.is_active !== false).map((concept) => (
                  <option key={concept.id} value={concept.id}>{concept.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Descripción"><input name="description" placeholder="Ej. Cuota de mantenimiento agosto" required /></Field>
            <div className="receivables-form-grid">
              <Field label="Monto"><input inputMode="decimal" name="amount" pattern="^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$" placeholder="0.00" required /></Field>
              <Field label="Moneda"><Select defaultValue={selectedCurrency || 'USD'} name="currencyCode"><option value="USD">USD</option><option value="VES">VES</option></Select></Field>
            </div>
            <div className="receivables-form-grid">
              <Field label="Fecha de emisión"><input defaultValue={todayIso()} name="issueDate" required type="date" /></Field>
              <Field label="Fecha de vencimiento"><input name="dueDate" type="date" /></Field>
            </div>
            <Button disabled={actionLoading || !activeUnits.length} type="submit">{actionLoading ? 'Guardando…' : 'Crear cuota'}</Button>
          </form>
        </Drawer>
      ) : null}

      {drawer === 'batch' ? (
        <Drawer eyebrow="Cobranza masiva" onClose={closeDrawer} title="Crear lote de cuotas">
          <ActionFeedback message={actionMessage} />
          <p className="receivables-drawer-intro">Genera el mismo cargo para todas las unidades activas. Habitta exige una previsualización antes de publicarlo.</p>
          {!batchPreview ? (
            <form className="receivables-form" onSubmit={(event) => void previewBatch(event)}>
              <Field label="Concepto">
                <Select name="conceptId" required>
                  <option value="">Selecciona un concepto</option>
                  {data.concepts.filter((concept) => concept.is_active !== false).map((concept) => (
                    <option key={concept.id} value={concept.id}>{concept.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Nombre del lote"><input name="name" placeholder="Ej. Cuotas agosto 2026" required /></Field>
              <div className="receivables-form-grid">
                <Field label="Monto por unidad"><input inputMode="decimal" name="fixedAmount" placeholder="0.00" required /></Field>
                <Field label="Moneda"><Select defaultValue={selectedCurrency || 'USD'} name="currencyCode"><option value="USD">USD</option><option value="VES">VES</option></Select></Field>
              </div>
              <div className="receivables-form-grid">
                <Field label="Emisión"><input defaultValue={todayIso()} name="issueDate" required type="date" /></Field>
                <Field label="Vencimiento"><input name="dueDate" required type="date" /></Field>
              </div>
              <div className="receivables-batch-note"><UnitsIcon size={20} /><div><strong>{activeUnits.length} unidades activas</strong><span>El lote se aplicará una vez a cada unidad.</span></div></div>
              <Button disabled={actionLoading || !activeUnits.length} type="submit">{actionLoading ? 'Calculando…' : 'Previsualizar lote'}</Button>
            </form>
          ) : (
            <div className="receivables-preview-card">
              <span><CheckCircleIcon size={24} /></span>
              <div>
                <small>Previsualización lista</small>
                <strong>{batchPreview.result.count} cuotas</strong>
                <b>{formatDashboardAmount(batchPreview.result.total, batchPreview.result.currencyCode)}</b>
                <p>Concepto: {getConceptName(batchPreview.payload.conceptId, data.concepts)}</p>
              </div>
              <div className="receivables-preview-actions">
                <Button onClick={() => setBatchPreview(null)} size="sm" variant="secondary">Editar</Button>
                <Button disabled={actionLoading} onClick={commitBatch} size="sm">{actionLoading ? 'Publicando…' : 'Publicar lote'}</Button>
              </div>
            </div>
          )}
        </Drawer>
      ) : null}

      {drawer === 'concept' ? (
        <Drawer eyebrow="Catálogo" onClose={closeDrawer} title="Crear concepto de cobro">
          <ActionFeedback message={actionMessage} />
          <p className="receivables-drawer-intro">Los conceptos ayudan a clasificar cuotas y preparar lotes recurrentes de forma consistente.</p>
          <form className="receivables-form" onSubmit={submitConcept}>
            <div className="receivables-form-grid">
              <Field label="Código"><input maxLength={32} name="code" placeholder="MANT" required /></Field>
              <Field label="Categoría">
                <Select defaultValue="regular_dues" name="category">
                  {Object.entries(conceptCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Nombre"><input name="name" placeholder="Cuota de mantenimiento" required /></Field>
            <Field label="Descripción"><textarea name="description" placeholder="Uso interno y alcance del concepto" /></Field>
            <div className="receivables-form-grid">
              <Field label="Moneda sugerida"><Select defaultValue="" name="defaultCurrencyCode"><option value="">Sin valor predeterminado</option><option value="USD">USD</option><option value="VES">VES</option></Select></Field>
              <Field label="Monto sugerido"><input inputMode="decimal" name="defaultAmount" placeholder="Opcional" /></Field>
            </div>
            <Button disabled={actionLoading} type="submit">{actionLoading ? 'Guardando…' : 'Crear concepto'}</Button>
          </form>
        </Drawer>
      ) : null}

      {drawer === 'statement' ? (
        <Drawer eyebrow="Consulta" onClose={closeDrawer} title="Estado de cuenta por unidad">
          <ActionFeedback message={actionMessage} />
          <Field label="Unidad">
            <Select onChange={(event) => void loadStatement(event.target.value)} value={statementUnitId}>
              <option value="">Selecciona una unidad</option>
              {data.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
            </Select>
          </Field>
          {statementLoading ? <Skeleton className="receivables-statement-skeleton" /> : null}
          {!statementLoading && statementUnitId && !statement.length ? (
            <EmptyState description="Esta unidad todavía no tiene movimientos financieros." icon={<ReportsIcon size={26} />} title="Estado de cuenta vacío" />
          ) : null}
          {statement.length ? (
            <div className="receivables-statement-list">
              {statement.map((row, index) => (
                <article key={`${row.effective_date}-${row.entry_type}-${index}`}>
                  <div><strong>{row.description}</strong><span>{formatDashboardDate(row.effective_date)} · {row.entry_type}</span></div>
                  <div><small>{row.debit ? `Débito ${formatDashboardAmount(row.debit, row.currency_code)}` : row.credit ? `Crédito ${formatDashboardAmount(row.credit, row.currency_code)}` : 'Sin movimiento'}</small><b>{formatDashboardAmount(row.running_balance, row.currency_code)}</b></div>
                </article>
              ))}
            </div>
          ) : null}
        </Drawer>
      ) : null}

      {drawer === 'opening' ? (
        <Drawer eyebrow="Migración financiera" onClose={closeDrawer} title="Importar saldos iniciales">
          <ActionFeedback message={actionMessage} />
          <div className="receivables-upload-guide">
            <ReportsIcon size={24} />
            <div><strong>Archivo CSV controlado</strong><p>Usa los encabezados: unit_code, balance_type, amount, currency_code, effective_date, description.</p></div>
          </div>
          <Field label="Archivo CSV">
            <input accept=".csv,text/csv" onChange={(event) => { setOpeningFile(event.target.files?.[0] ?? null); setOpeningPreview(null); }} type="file" />
          </Field>
          {!openingPreview ? (
            <Button disabled={!openingFile || actionLoading} onClick={() => void previewOpeningBalances()}>{actionLoading ? 'Revisando…' : 'Previsualizar archivo'}</Button>
          ) : (
            <div className="receivables-opening-preview">
              <div><span data-tone="success"><CheckCircleIcon size={20} /></span><div><strong>{openingPreview.valid.length} filas válidas</strong><small>Listas para importar</small></div></div>
              <div><span data-tone={openingPreview.errors.length ? 'warning' : 'success'}><ReportsIcon size={20} /></span><div><strong>{openingPreview.errors.length} errores</strong><small>{openingPreview.errors.length ? 'Deben corregirse antes de continuar' : 'El archivo pasó la validación'}</small></div></div>
              {openingPreview.errors.length ? (
                <div className="receivables-opening-errors">{openingPreview.errors.map((item) => <p key={`${item.row}-${item.error}`}>Fila {item.row}: {item.error}</p>)}</div>
              ) : (
                <Button disabled={actionLoading} onClick={commitOpeningBalances}>{actionLoading ? 'Importando…' : 'Confirmar importación'}</Button>
              )}
            </div>
          )}
        </Drawer>
      ) : null}
    </div>
  );
}
