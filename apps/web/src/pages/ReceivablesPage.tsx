import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRightIcon, CheckCircleIcon, FeesIcon, ReportsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { canManage, useCondominiumRoles } from '../lib/roles';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import type { ReceivableAging, ReceivableSummary } from '../lib/dashboard';
import {
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
  receivableStatusLabels,
  sortReceivables,
} from '../lib/receivables';
import type {
  ChargeConcept,
  ReceivableFilters,
  ReceivableItem,
  ReceivableUnit,
} from '../lib/receivables';
import { ReceivablesDrawerHost, type ReceivablesDrawerMode } from './ReceivablesDrawers';
import { LateFeeSettingsDrawer } from '../features/receivables/LateFeeSettingsDrawer';
import { RecurringDuesWorkspace } from '../features/receivables/RecurringDuesWorkspace';
import '../receivables.css';
import '../receivables-core.css';
import '../receivables-drawers.css';
import '../receivables-responsive.css';
import '../recurring-dues.css';

type ReceivablesData = {
  units: ReceivableUnit[];
  concepts: ChargeConcept[];
  items: ReceivableItem[];
  summaries: ReceivableSummary[];
  aging: ReceivableAging[];
};

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

function StatusBadge({ status }: { status: string }) {
  const tone = ['paid', 'settled'].includes(status)
    ? 'success'
    : ['open', 'partially_paid'].includes(status)
      ? 'info'
      : 'neutral';
  return <Badge tone={tone}>{receivableStatusLabels[status] ?? status}</Badge>;
}

function ReceivablesLoading() {
  return (
    <div className="receivables-page" aria-label="Cargando cuentas por cobrar">
      <PageHeader eyebrow="Control financiero" title="Cuotas y cuentas por cobrar" />
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

export function ReceivablesPage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const [data, setData] = useState<ReceivablesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [filters, setFilters] = useState<ReceivableFilters>(initialFilters);
  const [drawer, setDrawer] = useState<ReceivablesDrawerMode>(null);
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [lateFeeDrawerOpen, setLateFeeDrawerOpen] = useState(false);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      try {
        const [units, concepts, items, summaries, aging] = await Promise.all([
          apiRequest<ReceivableUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          apiRequest<ChargeConcept[]>(`/v1/condominiums/${condominiumId}/charge-concepts`, session),
          apiRequest<ReceivableItem[]>(`/v1/condominiums/${condominiumId}/receivables`, session),
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
  }, [condominiumId]);

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

  const openDrawer = (mode: Exclude<ReceivablesDrawerMode, null>) => setDrawer(mode);

  return (
    <div className="receivables-page">
      <PageHeader
        actions={
          <>
            <Button onClick={() => openDrawer('statement')} size="sm" variant="secondary">
              Estado de cuenta
            </Button>
            {manage ? (
              <>
                <Button onClick={() => setLateFeeDrawerOpen(true)} size="sm" variant="secondary">
                  Recargos por mora
                </Button>
                <Button onClick={() => openDrawer('batch')} size="sm" variant="secondary">
                  Crear lote
                </Button>
                <Button onClick={() => openDrawer('manual')} size="sm">
                  Nueva cuota manual
                </Button>
              </>
            ) : null}
          </>
        }
        description={`${condominiumName} · cartera separada por moneda y trazabilidad completa.`}
        eyebrow="Control financiero"
        title="Cuotas y cuentas por cobrar"
      />

      {error ? (
        <div className="receivables-inline-alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}

      <RecurringDuesWorkspace
        canManage={manage}
        concepts={data.concepts}
        condominiumId={condominiumId}
        onLedgerChanged={() => void load(true)}
        session={session}
      />

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
            <button onClick={() => setFilters({ ...filters, status: 'open' })} type="button">
              <span data-tone="blue">
                <FeesIcon size={18} />
              </span>
              <div>
                <strong>Pendientes</strong>
                <small>Sin pagos aplicados</small>
              </div>
              <b>{statusCounts.open}</b>
            </button>
            <button
              onClick={() => setFilters({ ...filters, status: 'partially_paid' })}
              type="button"
            >
              <span data-tone="warning">
                <ReportsIcon size={18} />
              </span>
              <div>
                <strong>Pagos parciales</strong>
                <small>Con saldo restante</small>
              </div>
              <b>{statusCounts.partiallyPaid}</b>
            </button>
            <button onClick={() => setFilters({ ...filters, status: 'settled' })} type="button">
              <span data-tone="green">
                <CheckCircleIcon size={18} />
              </span>
              <div>
                <strong>Saldados</strong>
                <small>Pagados o cerrados</small>
              </div>
              <b>{statusCounts.settled}</b>
            </button>
            <button onClick={() => setFilters({ ...filters, status: 'reversed' })} type="button">
              <span data-tone="neutral">
                <FeesIcon size={18} />
              </span>
              <div>
                <strong>Reversados</strong>
                <small>Conservan su historial</small>
              </div>
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
            <p>
              {visibleItems.length} resultados en {selectedCurrency || 'la moneda seleccionada'}.
            </p>
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
                <option key={unit.id} value={unit.id}>
                  {unit.code}
                </option>
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
                <option key={concept.id} value={concept.id}>
                  {concept.name}
                </option>
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
                          <span>
                            <FeesIcon size={18} />
                          </span>
                          <div>
                            <strong>{item.description}</strong>
                            <small>{getConceptName(item.concept_id, data.concepts)}</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Unidad">
                        <strong>{getUnitCode(item.unit_id, data.units)}</strong>
                      </td>
                      <td data-label="Emisión">
                        {item.issue_date ? formatDashboardDate(item.issue_date) : '—'}
                      </td>
                      <td data-label="Vencimiento">
                        <span className="receivables-due" data-state={dueState}>
                          {item.due_date ? formatDashboardDate(item.due_date) : 'Sin fecha'}
                        </span>
                      </td>
                      <td data-label="Saldo">
                        <strong>
                          {formatDashboardAmount(item.outstanding_amount, item.currency_code)}
                        </strong>
                      </td>
                      <td data-label="Estado">
                        <StatusBadge status={item.status} />
                      </td>
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

      <ReceivablesDrawerHost
        concepts={data.concepts}
        condominiumId={condominiumId}
        mode={drawer}
        onClose={() => setDrawer(null)}
        onRefresh={() => load(true)}
        selectedCurrency={selectedCurrency}
        selectedReceivable={selectedReceivable}
        session={session}
        units={data.units}
      />

      {lateFeeDrawerOpen ? (
        <LateFeeSettingsDrawer
          canManage={manage}
          condominiumId={condominiumId}
          onClose={() => setLateFeeDrawerOpen(false)}
          session={session}
        />
      ) : null}
    </div>
  );
}
