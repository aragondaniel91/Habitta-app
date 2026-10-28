import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRightIcon, CheckCircleIcon, FeesIcon, ReportsIcon } from '../components/icons';
import { FinancialPagination } from '../components/FinancialPagination';
import { Badge, Button, EmptyState, InfoHint, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { canManage, useCondominiumRoles } from '../lib/roles';
import { unitReferenceLabel } from '../lib/unit-domain';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import type { ReceivableAging, ReceivableSummary, UnitCreditBalance } from '../lib/dashboard';
import { collectAllPages, financialPagePath, mergePageItems, pageInfo } from '../lib/pagination';
import type { PageInfo, PaginatedResponse } from '../lib/pagination';
import {
  filterReceivables,
  filterUnitCreditBalances,
  getAgingForCurrency,
  getAgingSegments,
  getConceptName,
  getOverdueAmount,
  getReceivableCurrencies,
  getReceivableDueState,
  getReceivableStatusCounts,
  getSummaryForCurrency,
  getTotalCreditBalance,
  receivableStatusLabels,
  sortReceivables,
  sortUnitCreditBalances,
} from '../lib/receivables';
import type {
  ChargeConcept,
  ReceivableFilters,
  ReceivableItem,
  ReceivableUnit,
} from '../lib/receivables';
import { ReceivablesDrawerHost, type ReceivablesDrawerMode } from './ReceivablesDrawers';
import { consumeDeepLinkParams, readReceivablesDeepLink } from '../lib/dashboard-deep-links';
import { ChargeCreationChooser } from '../features/receivables/ChargeCreationChooser';
import { ChargeInstallmentPlanDrawer } from '../features/receivables/ChargeInstallmentPlanDrawer';
import { LateFeeSettingsDrawer } from '../features/receivables/LateFeeSettingsDrawer';
import { RecurringDuesWorkspace } from '../features/receivables/RecurringDuesWorkspace';
import { PaymentAgreementsPanel } from '../features/payment-agreements/PaymentAgreementsPanel';
import '../receivables.css';
import '../receivables-core.css';
import '../receivables-drawers.css';
import '../receivables-responsive.css';
import '../recurring-dues.css';

type ReceivablesData = {
  units: ReceivableUnit[];
  buildings: Building[];
  concepts: ChargeConcept[];
  items: ReceivableItem[];
  itemsPage: PageInfo;
  summaries: ReceivableSummary[];
  aging: ReceivableAging[];
  creditBalances: UnitCreditBalance[];
};
type Building = { id: string; name: string };

type Props = {
  condominiumId: string;
  condominiumName: string;
  onOpenUnit?: ((unitId: string) => void) | undefined;
  session: Session;
};

const RECEIVABLES_PAGE_SIZE = 50;
const REFERENCE_PAGE_SIZE = 100;

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

export function ReceivablesPage({ condominiumId, condominiumName, onOpenUnit, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  // A dashboard KPI deep link (currency/status/due/unit) is read once on first mount; the
  // reset-on-condominium-change effect below must not stomp it before it has been applied.
  const deepLinkRef = useRef(readReceivablesDeepLink(window.location.search));
  const isInitialFiltersMount = useRef(true);
  const [data, setData] = useState<ReceivablesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMoreItems, setLoadingMoreItems] = useState(false);
  const [error, setError] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState(deepLinkRef.current.currencyCode ?? '');
  const [filters, setFilters] = useState<ReceivableFilters>(() => ({
    ...initialFilters,
    status: deepLinkRef.current.status ?? '',
    due: deepLinkRef.current.due ?? '',
    unitId: deepLinkRef.current.unitId ?? '',
  }));
  const [drawer, setDrawer] = useState<ReceivablesDrawerMode>(null);
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [statementUnitId, setStatementUnitId] = useState('');
  const [creditQuery, setCreditQuery] = useState('');
  const [lateFeeDrawerOpen, setLateFeeDrawerOpen] = useState(false);
  const [chargeChooserOpen, setChargeChooserOpen] = useState(false);
  const [chargePlanOpen, setChargePlanOpen] = useState(false);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      try {
        const conceptsPromise = collectAllPages((page) =>
          apiRequest<PaginatedResponse<ChargeConcept>>(
            financialPagePath(
              `/v1/condominiums/${condominiumId}/charge-concepts`,
              page,
              REFERENCE_PAGE_SIZE,
            ),
            session,
          ),
        );
        const [units, buildings, concepts, itemsPage, summaries, aging, creditBalances] =
          await Promise.all([
            apiRequest<ReceivableUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
            apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
            conceptsPromise,
            apiRequest<PaginatedResponse<ReceivableItem>>(
              financialPagePath(
                `/v1/condominiums/${condominiumId}/receivables`,
                1,
                RECEIVABLES_PAGE_SIZE,
              ),
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
            apiRequest<UnitCreditBalance[]>(
              `/v1/condominiums/${condominiumId}/receivables/credit-balances`,
              session,
            ),
          ]);
        setData({
          units,
          buildings,
          concepts,
          items: itemsPage.items,
          itemsPage: pageInfo(itemsPage),
          summaries,
          aging,
          creditBalances,
        });
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
    // The first run applies the deep link seeded above; only a later condominium switch clears it.
    if (isInitialFiltersMount.current) {
      isInitialFiltersMount.current = false;
    } else {
      setFilters(initialFilters);
    }
    setSelectedReceivableId('');
    setStatementUnitId('');
    setCreditQuery('');
    setChargeChooserOpen(false);
    setLoadingMoreItems(false);
  }, [condominiumId]);

  useEffect(() => {
    const deepLink = deepLinkRef.current;
    if (!deepLink.status && !deepLink.currencyCode && !deepLink.due && !deepLink.unitId) return;
    deepLinkRef.current = {};
    consumeDeepLinkParams(['status', 'currency', 'due', 'unit']);
  }, []);

  const currencies = useMemo(
    () => (data ? getReceivableCurrencies(data.summaries, data.aging, data.items) : []),
    [data],
  );
  const buildingNameById = useMemo(
    () =>
      Object.fromEntries((data?.buildings ?? []).map((building) => [building.id, building.name])),
    [data?.buildings],
  );
  const unitLabel = useCallback(
    (unitId: string) => {
      const unit = data?.units.find((item) => item.id === unitId);
      return unit
        ? unitReferenceLabel({
            code: unit.code,
            buildingName: unit.building_id ? (buildingNameById[unit.building_id] ?? null) : null,
          })
        : unitId;
    },
    [buildingNameById, data?.units],
  );

  useEffect(() => {
    // Before the first load resolves, currencies is empty — don't clobber a deep-linked
    // currency selection while waiting for the data that will validate it.
    if (!currencies.length) return;
    if (!selectedCurrency || !currencies.includes(selectedCurrency)) {
      setSelectedCurrency(currencies[0] ?? '');
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

  const visibleCreditBalances = useMemo(() => {
    if (!data) return [];
    return sortUnitCreditBalances(
      filterUnitCreditBalances(data.creditBalances, data.units, creditQuery, selectedCurrency),
    );
  }, [data, creditQuery, selectedCurrency]);

  const openUnitStatement = useCallback((unitId: string) => {
    setStatementUnitId(unitId);
    setDrawer('statement');
  }, []);

  const loadMoreItems = useCallback(async () => {
    if (!data?.itemsPage.hasNextPage || loadingMoreItems) return;
    setLoadingMoreItems(true);
    setError('');
    try {
      const next = await apiRequest<PaginatedResponse<ReceivableItem>>(
        financialPagePath(
          `/v1/condominiums/${condominiumId}/receivables`,
          data.itemsPage.page + 1,
          data.itemsPage.pageSize,
        ),
        session,
      );
      setData((current) =>
        current
          ? {
              ...current,
              items: mergePageItems(current.items, next.items),
              itemsPage: pageInfo(next),
            }
          : current,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar más historial de cuentas por cobrar.',
      );
    } finally {
      setLoadingMoreItems(false);
    }
  }, [condominiumId, data?.itemsPage, loadingMoreItems, session]);

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
  const chooseOrdinaryCharge = () => {
    setChargeChooserOpen(false);
    requestAnimationFrame(() => {
      document.querySelector('.recurring-dues-workspace')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };
  const openPaymentAgreements = () => {
    setChargeChooserOpen(false);
    requestAnimationFrame(() => {
      document.querySelector('#payment-agreements-workspace')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <div className="receivables-page">
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => {
                setStatementUnitId('');
                openDrawer('statement');
              }}
              size="sm"
              variant="secondary"
            >
              Estado de cuenta
            </Button>
            {manage ? (
              <>
                <Button onClick={() => openDrawer('administration')} size="sm" variant="secondary">
                  Administración financiera
                </Button>
                <Button onClick={() => setLateFeeDrawerOpen(true)} size="sm" variant="secondary">
                  Recargos por mora
                </Button>
                <Button onClick={() => setChargeChooserOpen(true)} size="sm">
                  Nueva cuota
                </Button>
              </>
            ) : null}
            <Button onClick={openPaymentAgreements} size="sm" variant="secondary">
              Acuerdos de pago
            </Button>
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
      {data.items.length < data.itemsPage.total ? (
        <div className="receivables-inline-alert" role="status">
          Los saldos y la antigüedad usan los agregados completos del servidor. La composición por
          estado, búsquedas y tabla usan {data.items.length} de {data.itemsPage.total} cargos
          cargados; “Cargar más” amplía el historial sin traerlo completo de una vez.
        </div>
      ) : null}

      <RecurringDuesWorkspace
        canManage={manage}
        concepts={data.concepts}
        condominiumId={condominiumId}
        onCreateConcept={() => openDrawer('concept')}
        onLedgerChanged={() => void load(true)}
        session={session}
      />

      <PaymentAgreementsPanel
        canManage={manage}
        condominiumId={condominiumId}
        session={session}
        unitLabel={unitLabel}
      />

      <div className="receivables-currency-row">
        <div>
          <strong>
            Vista financiera
            <InfoHint label="Cómo se agrupan las monedas">
              Nunca se combinan valores de monedas diferentes.
            </InfoHint>
          </strong>
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
              <h2>
                Edad de la cartera
                <InfoHint label="Más información sobre edad de la cartera">
                  Visualiza cuánto está al día y cuánto necesita gestión de cobranza.
                </InfoHint>
              </h2>
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
              <h2>
                Composición de cargos
                <InfoHint label="Más información sobre composición de cargos">
                  Volumen de obligaciones según los cargos cargados en esta vista.
                </InfoHint>
              </h2>
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

      <Surface className="receivables-panel receivables-credit-panel">
        <div className="receivables-section-heading">
          <div>
            <span className="receivables-kicker">Cobranza</span>
            <h2>
              Créditos autorizados disponibles
              <InfoHint label="Más información sobre créditos autorizados">
                Dinero ya recibido y registrado para la unidad que todavía no se aplicó a ningún
                cargo. No es un estado de cuenta; abre el estado de cuenta de la unidad para ver el
                detalle completo.
              </InfoHint>
            </h2>
          </div>
          <Badge tone="info">
            {formatDashboardAmount(
              getTotalCreditBalance(data.creditBalances, selectedCurrency),
              selectedCurrency || 'USD',
            )}
          </Badge>
        </div>

        <label className="receivables-search">
          <span>Buscar por unidad</span>
          <input
            onChange={(event) => setCreditQuery(event.target.value)}
            placeholder="Código de unidad"
            type="search"
            value={creditQuery}
          />
        </label>

        {visibleCreditBalances.length ? (
          <div className="receivables-table-wrap">
            <table className="receivables-table">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Crédito disponible</th>
                  <th>Entradas de crédito</th>
                  <th>Desde</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visibleCreditBalances.map((row) => (
                  <tr key={`${row.unit_id}-${row.currency_code}`}>
                    <td data-label="Unidad">
                      <strong>{unitLabel(row.unit_id)}</strong>
                    </td>
                    <td data-label="Crédito disponible">
                      <strong>
                        {formatDashboardAmount(row.credit_balance, row.currency_code)}
                      </strong>
                    </td>
                    <td data-label="Entradas de crédito">{row.credit_entry_count}</td>
                    <td data-label="Desde">
                      {row.oldest_credit_date ? formatDashboardDate(row.oldest_credit_date) : '—'}
                    </td>
                    <td>
                      <button
                        aria-label={`Ver estado de cuenta de ${unitLabel(row.unit_id)}`}
                        onClick={() => openUnitStatement(row.unit_id)}
                        type="button"
                      >
                        <ArrowRightIcon size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="Ninguna unidad visible tiene crédito sin aplicar en esta moneda."
            icon={<CheckCircleIcon size={27} />}
            title="Sin créditos pendientes de aplicar"
          />
        )}
      </Surface>

      <Surface className="receivables-workspace">
        <div className="receivables-workspace__heading">
          <div>
            <span className="receivables-kicker">Cartera</span>
            <h2>Cargos registrados</h2>
            <p>
              {visibleItems.length} visibles · {data.items.length} de {data.itemsPage.total}{' '}
              cargados en {selectedCurrency || 'la moneda seleccionada'}.
            </p>
          </div>
          <div className="receivables-tools-menu">
            {manage ? (
              <>
                <Button onClick={() => openDrawer('concept')} size="sm" variant="ghost">
                  Nuevo concepto
                </Button>
                <Button onClick={() => openDrawer('opening')} size="sm" variant="ghost">
                  Importar saldos
                </Button>
              </>
            ) : null}
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
                  {unitReferenceLabel({
                    code: unit.code,
                    buildingName: unit.building_id
                      ? (buildingNameById[unit.building_id] ?? null)
                      : null,
                  })}
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
                        {onOpenUnit ? (
                          <button
                            className="receivables-unit-link"
                            onClick={() => onOpenUnit(item.unit_id)}
                            type="button"
                          >
                            {unitLabel(item.unit_id)}
                          </button>
                        ) : (
                          <strong>{unitLabel(item.unit_id)}</strong>
                        )}
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
                        {item.status === 'partially_paid' && item.original_amount ? (
                          <small>
                            Importe original:{' '}
                            {formatDashboardAmount(item.original_amount, item.currency_code)}
                          </small>
                        ) : null}
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
            description={
              data.items.length < data.itemsPage.total
                ? 'No hay coincidencias en los cargos cargados. Carga más historial para ampliar la búsqueda.'
                : 'Prueba otra búsqueda o registra una nueva cuota para comenzar.'
            }
            icon={<FeesIcon size={27} />}
            onAction={() => setFilters(initialFilters)}
            title="No hay cargos para esta vista"
          />
        )}

        <FinancialPagination
          itemLabel="cargos"
          loaded={data.items.length}
          loading={loadingMoreItems}
          onLoadMore={() => void loadMoreItems()}
          total={data.itemsPage.total}
        />
      </Surface>

      {chargeChooserOpen ? (
        <ChargeCreationChooser
          onClose={() => setChargeChooserOpen(false)}
          onExtraordinary={() => {
            setChargeChooserOpen(false);
            openDrawer('batch');
          }}
          onOneOff={() => {
            setChargeChooserOpen(false);
            openDrawer('manual');
          }}
          onInstallmentPlan={() => {
            setChargeChooserOpen(false);
            setChargePlanOpen(true);
          }}
          onAgreement={openPaymentAgreements}
          onOrdinary={chooseOrdinaryCharge}
        />
      ) : null}
      {chargePlanOpen ? (
        <ChargeInstallmentPlanDrawer
          buildingNameById={buildingNameById}
          concepts={data.concepts}
          condominiumId={condominiumId}
          onClose={() => setChargePlanOpen(false)}
          onRefresh={() => load(true)}
          selectedCurrency={selectedCurrency}
          session={session}
          units={data.units}
        />
      ) : null}

      <ReceivablesDrawerHost
        buildingNameById={buildingNameById}
        concepts={data.concepts}
        condominiumId={condominiumId}
        key={`${drawer ?? 'closed'}-${statementUnitId}`}
        mode={drawer}
        onClose={() => setDrawer(null)}
        onRefresh={() => load(true)}
        selectedCurrency={selectedCurrency}
        selectedReceivable={selectedReceivable}
        session={session}
        statementUnitId={statementUnitId}
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
