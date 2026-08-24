import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AnnouncementsIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CommunityIcon,
  ExpensesIcon,
  FeesIcon,
  PaymentsIcon,
  PeopleIcon,
  ReportsIcon,
  RequestsIcon,
  UnitsIcon,
} from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import type { IconProps } from '../components/icons';
import { Badge, Button, EmptyState, Skeleton, Surface } from '../components/ui';
import { ApiRequestError, apiRequest } from '../lib/api';
import {
  buildMonthlyFinancialSeries,
  buildRecentActivity,
  formatDashboardAmount,
  formatDashboardDate,
  getAgingBuckets,
  getCollectionsThisMonth,
  getDashboardCurrencies,
  getDelinquencyRate,
  getRecentPayments,
  sortReceivableSummaries,
} from '../lib/dashboard';
import type {
  DashboardPayment,
  DashboardPerson,
  DashboardReceivable,
  DashboardUnit,
  MonthlyFinancialPoint,
  ReceivableAging,
  ReceivableSummary,
} from '../lib/dashboard';
import { APP_ROUTES } from '../navigation';
import type { AppRoute } from '../navigation';
import { buildDashboardSourceWarning, settleDashboardSource } from '../lib/dashboard-sources';
import '../dashboard.css';
import '../dashboard-mobile.css';

const PORTFOLIO_COLORS = ['#28a745', '#78aee8', '#3978bd', '#e39b45', '#c94d58'] as const;

type DashboardData = {
  units: DashboardUnit[];
  people: DashboardPerson[];
  summaries: ReceivableSummary[];
  aging: ReceivableAging[];
  receivables: DashboardReceivable[];
  payments: DashboardPayment[];
  reviewQueue: DashboardPayment[];
  reviewQueueAvailable: boolean;
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
  onNavigate: (route: AppRoute) => void;
};

type MetricIcon = (props: IconProps) => ReactNode;

const routeByKey = (key: AppRoute['key']) => APP_ROUTES.find((route) => route.key === key);

const paymentStatusLabels: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Enviado',
  under_review: 'En revisión',
  correction_requested: 'Corrección',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  reversed: 'Reversado',
};

const receivableStatusLabels: Record<string, string> = {
  open: 'Pendiente',
  partially_paid: 'Pago parcial',
  paid: 'Pagado',
  settled: 'Saldado',
  reversed: 'Reversado',
};

const toneForStatus = (status: string) => {
  if (['approved', 'paid', 'settled'].includes(status)) return 'success' as const;
  if (['submitted', 'under_review', 'open', 'partially_paid'].includes(status))
    return 'info' as const;
  if (status === 'correction_requested') return 'warning' as const;
  return 'neutral' as const;
};

function DashboardLoading() {
  return (
    <div className="dashboard-page" aria-label="Cargando dashboard">
      <PageHeader eyebrow="Resumen general" title="Dashboard administrativo" />
      <div className="dashboard-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <div className="dashboard-chart-grid">
        <Skeleton className="dashboard-panel-skeleton" />
        <Skeleton className="dashboard-panel-skeleton" />
      </div>
    </div>
  );
}

function CurrencyValues({
  rows,
  emptyLabel,
}: {
  rows: { currencyCode: string; value: number | string }[];
  emptyLabel: string;
}) {
  if (!rows.length) return <strong className="dashboard-metric-empty">{emptyLabel}</strong>;
  return (
    <div className="dashboard-currency-values">
      {rows.map((row) => (
        <div key={row.currencyCode}>
          <Badge tone="info">{row.currencyCode}</Badge>
          <strong>{formatDashboardAmount(row.value, row.currencyCode)}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  icon,
  tone,
  children,
  footer,
}: {
  label: string;
  icon: MetricIcon;
  tone: 'blue' | 'green' | 'red' | 'navy';
  children: ReactNode;
  footer: string;
}) {
  return (
    <Surface className="dashboard-metric-card" data-tone={tone}>
      <div className="dashboard-metric-card__top">
        <span className="dashboard-metric-card__icon">{icon({ size: 20 })}</span>
        <span>{label}</span>
      </div>
      <div className="dashboard-metric-card__value">{children}</div>
      <small>{footer}</small>
    </Surface>
  );
}

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
    <div className="dashboard-currency-tabs" aria-label="Seleccionar moneda">
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

function FinancialBarChart({
  points,
  currencyCode,
}: {
  points: MonthlyFinancialPoint[];
  currencyCode: string;
}) {
  const maximum = Math.max(...points.flatMap((point) => [point.collections, point.charges]), 1);
  const hasData = points.some((point) => point.collections > 0 || point.charges > 0);

  if (!hasData) {
    return (
      <div className="dashboard-chart-empty">
        <ReportsIcon size={28} />
        <strong>Sin movimientos mensuales en {currencyCode}</strong>
        <span>La gráfica se completará cuando existan cobros aprobados o cargos registrados.</span>
      </div>
    );
  }

  return (
    <div
      className="dashboard-bar-chart"
      role="img"
      aria-label={`Cobros y cargos en ${currencyCode}`}
    >
      <div className="dashboard-bar-chart__grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="dashboard-bar-chart__groups">
        {points.map((point) => {
          const collectionHeight = point.collections > 0 ? (point.collections / maximum) * 100 : 0;
          const chargeHeight = point.charges > 0 ? (point.charges / maximum) * 100 : 0;
          return (
            <div className="dashboard-bar-group" key={point.key}>
              <div className="dashboard-bar-group__bars">
                <span
                  aria-label={`${point.label}: cobros ${formatDashboardAmount(point.collections, currencyCode)}`}
                  className="dashboard-bar dashboard-bar--income"
                  style={{
                    height: `${Math.max(collectionHeight, point.collections > 0 ? 3 : 0)}%`,
                  }}
                  title={`Cobros: ${formatDashboardAmount(point.collections, currencyCode)}`}
                />
                <span
                  aria-label={`${point.label}: cargos ${formatDashboardAmount(point.charges, currencyCode)}`}
                  className="dashboard-bar dashboard-bar--charges"
                  style={{ height: `${Math.max(chargeHeight, point.charges > 0 ? 3 : 0)}%` }}
                  title={`Cargos: ${formatDashboardAmount(point.charges, currencyCode)}`}
                />
              </div>
              <strong>{point.label}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortfolioDonut({ row }: { row: ReceivableAging | undefined }) {
  if (!row) {
    return (
      <div className="dashboard-chart-empty dashboard-chart-empty--compact">
        <FeesIcon size={28} />
        <strong>Sin cartera para distribuir</strong>
        <span>Los segmentos aparecerán cuando existan saldos.</span>
      </div>
    );
  }

  const buckets = getAgingBuckets(row);
  const total = buckets.reduce((sum, bucket) => sum + bucket.numericAmount, 0);
  if (total <= 0) {
    return (
      <div className="dashboard-chart-empty dashboard-chart-empty--compact">
        <CheckCircleIcon size={28} />
        <strong>Cartera al día</strong>
        <span>No existen saldos abiertos en {row.currency_code}.</span>
      </div>
    );
  }

  let cursor = 0;
  const stops = buckets.map((bucket, index) => {
    const start = cursor;
    cursor += (bucket.numericAmount / total) * 100;
    const color = PORTFOLIO_COLORS[index] ?? '#94a3b8';
    return `${color} ${start}% ${cursor}%`;
  });

  return (
    <div className="dashboard-donut-layout">
      <div
        aria-label={`Distribución de cartera ${row.currency_code}`}
        className="dashboard-donut"
        role="img"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
      >
        <div>
          <strong>{row.currency_code}</strong>
          <span>{formatDashboardAmount(total, row.currency_code)}</span>
        </div>
      </div>
      <div className="dashboard-donut-legend">
        {buckets.map((bucket, index) => (
          <div key={bucket.key}>
            <span style={{ background: PORTFOLIO_COLORS[index] ?? '#94a3b8' }} />
            <div>
              <strong>{bucket.label}</strong>
              <small>{Math.round((bucket.numericAmount / total) * 100)}%</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdministrativeDashboard({
  condominiumId,
  condominiumName,
  session,
  onNavigate,
}: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const reviewQueueRequest = apiRequest<DashboardPayment[]>(
        `/v1/condominiums/${condominiumId}/payments/review-queue`,
        session,
      )
        .then((items) => ({ items, available: true }))
        .catch((requestError: unknown) => {
          if (requestError instanceof ApiRequestError && requestError.status === 403)
            return { items: [], available: false };
          throw requestError;
        });

      const [
        unitsResult,
        peopleResult,
        summariesResult,
        agingResult,
        receivablesResult,
        paymentsResult,
        reviewQueueResult,
      ] = await Promise.all([
        settleDashboardSource(
          'unidades',
          apiRequest<DashboardUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          [],
        ),
        settleDashboardSource(
          'personas',
          apiRequest<DashboardPerson[]>(`/v1/condominiums/${condominiumId}/people`, session),
          [],
        ),
        settleDashboardSource(
          'resumen de cartera',
          apiRequest<ReceivableSummary[]>(
            `/v1/condominiums/${condominiumId}/receivables/summary`,
            session,
          ),
          [],
        ),
        settleDashboardSource(
          'antigüedad de cartera',
          apiRequest<ReceivableAging[]>(
            `/v1/condominiums/${condominiumId}/receivables/aging`,
            session,
          ),
          [],
        ),
        settleDashboardSource(
          'cuotas',
          apiRequest<DashboardReceivable[]>(
            `/v1/condominiums/${condominiumId}/receivables`,
            session,
          ),
          [],
        ),
        settleDashboardSource(
          'pagos',
          apiRequest<DashboardPayment[]>(`/v1/condominiums/${condominiumId}/payments`, session),
          [],
        ),
        settleDashboardSource('bandeja de revisión', reviewQueueRequest, {
          items: [],
          available: false,
        }),
      ]);

      setData({
        units: unitsResult.value,
        people: peopleResult.value,
        summaries: summariesResult.value,
        aging: agingResult.value,
        receivables: receivablesResult.value,
        payments: paymentsResult.value,
        reviewQueue: reviewQueueResult.value.items,
        reviewQueueAvailable: reviewQueueResult.value.available,
      });
      setError(
        buildDashboardSourceWarning([
          unitsResult,
          peopleResult,
          summariesResult,
          agingResult,
          receivablesResult,
          paymentsResult,
          reviewQueueResult,
        ]),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el dashboard administrativo.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const currencies = useMemo(
    () =>
      data
        ? getDashboardCurrencies(data.summaries, data.aging, data.receivables, data.payments)
        : [],
    [data],
  );

  useEffect(() => {
    const firstCurrency = currencies[0] ?? '';
    if (!selectedCurrency || !currencies.includes(selectedCurrency))
      setSelectedCurrency(firstCurrency);
  }, [currencies, selectedCurrency]);

  const activity = useMemo(
    () => (data ? buildRecentActivity(data.receivables, data.payments, data.units, 6) : []),
    [data],
  );
  const recentPayments = useMemo(
    () => (data ? getRecentPayments(data.payments, data.units) : []),
    [data],
  );
  const monthlySeries = useMemo(
    () =>
      data && selectedCurrency
        ? buildMonthlyFinancialSeries(data.receivables, data.payments, selectedCurrency)
        : [],
    [data, selectedCurrency],
  );

  if (loading && !data) return <DashboardLoading />;

  if (error && !data) {
    return (
      <Surface className="dashboard-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error}
          icon={<CommunityIcon size={26} />
          onAction={() => void load()}
          title="No pudimos cargar el resumen"
        />
      </Surface>
    );
  }

  if (!data) return null;

  const activeUnits = data.units.filter((unit) => unit.status === 'active').length;
  const activePeople = data.people.filter((person) => person.status !== 'inactive').length;
  const summaries = sortReceivableSummaries(data.summaries);
  const selectedAging = data.aging.find((row) => row.currency_code === selectedCurrency);
  const feesRoute = routeByKey('fees');
  const paymentsRoute = routeByKey('payments');
  const unitsRoute = routeByKey('units');
  const peopleRoute = routeByKey('people');
  const announcementsRoute = routeByKey('announcements');
  const reportsRoute = routeByKey('reports');
  const requestsRoute = routeByKey('requests');

  const pendingRows = summaries.map((summary) => ({
    currencyCode: summary.currency_code,
    value: summary.net_outstanding,
  }));
  const collectionRows = currencies.map((currencyCode) => ({
    currencyCode,
    value: getCollectionsThisMonth(data.payments, currencyCode),
  }));
  const delinquencyRows = data.aging.map((row) => ({
    currencyCode: row.currency_code,
    value: getDelinquencyRate(row),
  }));

  return (
    <div className="dashboard-page">
      <PageHeader
        actions={
          <>
            <span className="dashboard-header-status">
              <CheckCircleIcon size={17} />
              Datos reales del condominio
            </span>
            <Button disabled={loading} onClick={() => void load()} size="sm" variant="secondary">
              {loading ? 'Actualizando…' : 'Actualizar datos'}
            </Button>
          </>
        }
        description="Cobranza, comunidad y movimientos recientes en una sola vista."
        eyebrow="Resumen general"
        title={condominiumName}
      />

      {error ? (
        <div className="dashboard-inline-alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}

      <section className="dashboard-kpi-grid" aria-label="Indicadores principales">
        <MetricCard
          footer="Obligaciones abiertas, separadas por moneda."
          icon={(props) => <FeesIcon {...props} />}
          label="Saldo total pendiente"
          tone="blue"
        >
          <CurrencyValues emptyLabel="Sin saldos" rows={pendingRows} />
        </MetricCard>
        <MetricCard
          footer="Solo pagos aprobados durante el mes actual."
          icon={(props) => <PaymentsIcon {...props} />}
          label="Cobrado este mes"
          tone="green"
        >
          <CurrencyValues emptyLabel="Sin cobros" rows={collectionRows} />
        </MetricCard>
        <MetricCard
          footer={`${data.units.length} ${data.units.length === 1 ? 'unidad registrada' : 'unidades registradas'} en total.`}
          icon={(props) => <UnitsIcon {...props} />}
          label="Unidades activas"
          tone="navy"
        >
          <strong className="dashboard-single-value">{activeUnits}</strong>
        </MetricCard>
        <MetricCard
          footer="Porcentaje vencido respecto a la cartera total."
          icon={(props) => <ExpensesIcon {...props} />}
          label="Morosidad"
          tone="red"
        >
          {delinquencyRows.length ? (
            <div className="dashboard-percentage-values">
              {delinquencyRows.map((row) => (
                <div key={row.currencyCode}>
                  <Badge tone="neutral">{row.currencyCode}</Badge>
                  <strong>{row.value.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          ) : (
            <strong className="dashboard-metric-empty">Sin cartera</strong>
          )}
        </MetricCard>
      </section>

      <section className="dashboard-chart-grid">
        <Surface className="dashboard-panel dashboard-financial-chart-panel">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-section-kicker">Tendencia financiera</span>
              <h2>Cobros vs cargos</h2>
              <p>Compara cobros aprobados con cargos registrados durante los últimos seis meses.</p>
            </div>
            {currencies.length ? (
              <CurrencyTabs
                currencies={currencies}
                onChange={setSelectedCurrency}
                selected={selectedCurrency}
              />
            ) : null}
          </div>
          <div className="dashboard-chart-legend">
            <span data-kind="income">Cobros aprobados</span>
            <span data-kind="charges">Cargos registrados</span>
          </div>
          <FinancialBarChart currencyCode={selectedCurrency || 'USD'} points={monthlySeries} />
          <p className="dashboard-data-note">
            Los egresos se integrarán aquí cuando el módulo de gastos exponga una fuente financiera
            consolidada. No se muestran valores simulados.
          </p>
        </Surface>

        <Surface className="dashboard-panel dashboard-portfolio-panel">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-section-kicker">Cobranza</span>
              <h2>Distribución de cartera</h2>
              <p>Qué porcentaje está al día o vencido.</p>
            </div>
            {selectedCurrency ? <Badge tone="info">{selectedCurrency}</Badge> : null}
          </div>
          <PortfolioDonut row={selectedAging} />
          {feesRoute ? (
            <Button onClick={() => onNavigate(feesRoute)} size="sm" variant="ghost">
              Ver cuentas por cobrar
              <ArrowRightIcon size={16} />
            </Button>
          ) : null}
        </Surface>
      </section>

      <section className="dashboard-card-grid">
        <Surface className="dashboard-panel dashboard-recent-payments">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-section-kicker">Pagos</span>
              <h2>Pagos recientes</h2>
            </div>
            {paymentsRoute ? (
              <Button onClick={() => onNavigate(paymentsRoute)} size="sm" variant="ghost">
                Ver todos
              </Button>
            ) : null}
          </div>
          {recentPayments.length ? (
            <div className="dashboard-payment-list">
              {recentPayments.map((payment) => (
                <article key={payment.id}>
                  <div className="dashboard-payment-list__icon" data-status={payment.status}>
                    {payment.status === 'approved' ? (
                      <CheckCircleIcon size={19} />
                    ) : (
                      <PaymentsIcon size={19} />
                    )}
                  </div>
                  <div>
                    <strong>
                      {payment.unitCode} · {payment.payer}
                    </strong>
                    <span>{formatDashboardDate(payment.date)}</span>
                  </div>
                  <div>
                    <strong>{formatDashboardAmount(payment.amount, payment.currencyCode)}</strong>
                    <Badge tone={toneForStatus(payment.status)}>
                      {paymentStatusLabels[payment.status] ?? payment.status}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              description="Los últimos pagos registrados aparecerán en esta tarjeta."
              icon={<PaymentsIcon size={26} />}
              title="Todavía no hay pagos"
            />
          )}
        </Surface>

        <Surface className="dashboard-panel dashboard-priorities-card">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-section-kicker">Atención</span>
              <h2>Prioridades</h2>
            </div>
          </div>
          <div className="dashboard-priority-list">
            <button
              disabled={!paymentsRoute}
              onClick={() => paymentsRoute && onNavigate(paymentsRoute)}
              type="button"
            >
              <span data-tone={data.reviewQueue.length ? 'warning' : 'success'}>
                <PaymentsIcon size={19} />
              </span>
              <div>
                <strong>
                  {data.reviewQueueAvailable
                    ? `${data.reviewQueue.length} pagos por revisar`
                    : 'Bandeja de pagos restringida'}
                </strong>
                <small>Validación manual de referencias y comprobantes.</small>
              </div>
              <ArrowRightIcon size={17} />
            </button>
            <button
              disabled={!feesRoute}
              onClick={() => feesRoute && onNavigate(feesRoute)}
              type="button"
            >
              <span
                data-tone={delinquencyRows.some((row) => row.value > 0) ? 'warning' : 'success'}
              >
                <FeesIcon size={19} />
              </span>
              <div>
                <strong>
                  {delinquencyRows.some((row) => row.value > 0)
                    ? 'Cobranza con saldos vencidos'
                    : 'Cobranza al día'}
                </strong>
                <small>Revisa la antigüedad de cartera por moneda.</small>
              </div>
              <ArrowRightIcon size={17} />
            </button>
            <button
              disabled={!requestsRoute}
              onClick={() => requestsRoute && onNavigate(requestsRoute)}
              type="button"
            >
              <span data-tone="info">
                <RequestsIcon size={19} />
              </span>
              <div>
                <strong>Solicitudes de la comunidad</strong>
                <small>El módulo se conectará sin inventar tickets activos.</small>
              </div>
              <ArrowRightIcon size={17} />
            </button>
          </div>
        </Surface>

        <Surface className="dashboard-panel dashboard-community-card">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-section-kicker">Comunidad</span>
              <h2>Estado operativo</h2>
            </div>
          </div>
          <div className="dashboard-community-stats">
            <button onClick={() => unitsRoute && onNavigate(unitsRoute)} type="button">
              <UnitsIcon size={21} />
              <span>Unidades</span>
              <strong>{data.units.length}</strong>
            </button>
            <button onClick={() => peopleRoute && onNavigate(peopleRoute)} type="button">
              <PeopleIcon size={21} />
              <span>Personas activas</span>
              <strong>{activePeople}</strong>
            </button>
          </div>
        </Surface>

        <Surface className="dashboard-panel dashboard-quick-actions">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-section-kicker">Acciones</span>
              <h2>Atajos rápidos</h2>
            </div>
          </div>
          <div className="dashboard-action-grid">
            <button onClick={() => feesRoute && onNavigate(feesRoute)} type="button">
              <FeesIcon size={22} />
              <span>Crear cuota</span>
            </button>
            <button onClick={() => paymentsRoute && onNavigate(paymentsRoute)} type="button">
              <PaymentsIcon size={22} />
              <span>Registrar pago</span>
            </button>
            <button
              onClick={() => announcementsRoute && onNavigate(announcementsRoute)}
              type="button"
            >
              <AnnouncementsIcon size={22} />
              <span>Enviar anuncio</span>
            </button>
            <button onClick={() => reportsRoute && onNavigate(reportsRoute)} type="button">
              <ReportsIcon size={22} />
              <span>Generar reporte</span>
            </button>
          </div>
        </Surface>
      </section>

      <Surface className="dashboard-panel dashboard-activity-panel">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-section-kicker">Trazabilidad</span>
            <h2>Últimos movimientos</h2>
            <p>Cargos y pagos recientes, sin mezclar monedas.</p>
          </div>
        </div>
        {activity.length ? (
          <div className="table-scroll">
            <table className="data-table dashboard-activity-table">
              <thead>
                <tr>
                  <th>Movimiento</th>
                  <th>Unidad</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Movimiento">
                      <div className="dashboard-activity-name">
                        <span data-kind={item.kind}>
                          {item.kind === 'payment' ? (
                            <PaymentsIcon size={17} />
                          ) : (
                            <FeesIcon size={17} />
                          )}
                        </span>
                        <strong>{item.title}</strong>
                      </div>
                    </td>
                    <td data-label="Unidad">{item.detail}</td>
                    <td data-label="Monto">
                      {formatDashboardAmount(item.amount, item.currencyCode)}
                    </td>
                    <td data-label="Estado">
                      <Badge tone={toneForStatus(item.status)}>
                        {item.kind === 'payment'
                          ? (paymentStatusLabels[item.status] ?? item.status)
                          : (receivableStatusLabels[item.status] ?? item.status)}
                      </Badge>
                    </td>
                    <td data-label="Fecha">{formatDashboardDate(item.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="Los cargos y pagos aparecerán aquí cuando comience la operación."
            icon={<CheckCircleIcon size={26} />}
            title="Todavía no hay movimientos"
          />
        )}
      </Surface>
    </div>
  );
}
