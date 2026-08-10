import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CheckCircleIcon,
  ExpensesIcon,
  FeesIcon,
  PaymentsIcon,
  ReportsIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import {
  buildMonthlyFinancialSeries,
  formatDashboardAmount,
  getAgingBuckets,
} from '../lib/dashboard';
import type {
  DashboardPayment,
  DashboardReceivable,
  DashboardUnit,
  MonthlyFinancialPoint,
  ReceivableAging,
  ReceivableSummary,
} from '../lib/dashboard';
import { paymentStatusLabels } from '../lib/payments';
import {
  buildPaymentStatusRows,
  buildUnitFinancialRows,
  createUnitReportCsv,
  getPeriodFinancialTotals,
  getPortfolioTotals,
  getReportCurrencies,
} from '../lib/reports';
import type { PaymentStatusRow, ReportPeriod, UnitFinancialRow } from '../lib/reports';

type ReportsData = {
  units: DashboardUnit[];
  receivables: DashboardReceivable[];
  payments: DashboardPayment[];
  summaries: ReceivableSummary[];
  aging: ReceivableAging[];
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const statusColors = ['#28a745', '#1b4f72', '#7aaee2', '#e39b45', '#c94d58', '#64748b'];

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
    <Surface className="reports-metric" data-tone={tone}>
      <div className="reports-metric__heading">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function ReportsLoading() {
  return (
    <div aria-label="Cargando reportes" className="reports-page">
      <PageHeader eyebrow="Inteligencia financiera" title="Reportes y análisis" />
      <div className="reports-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <div className="reports-chart-grid">
        <Skeleton className="reports-panel-skeleton" />
        <Skeleton className="reports-panel-skeleton" />
      </div>
    </div>
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
    <div aria-label="Seleccionar moneda" className="reports-currency-tabs">
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

function MonthlyChart({
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
      <div className="reports-empty-chart">
        <ReportsIcon size={28} />
        <strong>Sin movimientos para graficar</strong>
        <span>El reporte se completará con cobros aprobados y cargos registrados.</span>
      </div>
    );
  }

  return (
    <div
      aria-label={`Cargos y cobros en ${currencyCode}`}
      className="reports-monthly-chart"
      role="img"
    >
      <div aria-hidden="true" className="reports-monthly-chart__grid">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="reports-monthly-chart__groups">
        {points.map((point) => (
          <div className="reports-month-group" key={point.key}>
            <div className="reports-month-group__bars">
              <span
                className="reports-bar reports-bar--collections"
                style={{
                  height: `${Math.max((point.collections / maximum) * 100, point.collections ? 3 : 0)}%`,
                }}
                title={`Cobros: ${formatDashboardAmount(point.collections, currencyCode)}`}
              />
              <span
                className="reports-bar reports-bar--charges"
                style={{
                  height: `${Math.max((point.charges / maximum) * 100, point.charges ? 3 : 0)}%`,
                }}
                title={`Cargos: ${formatDashboardAmount(point.charges, currencyCode)}`}
              />
            </div>
            <strong>{point.label}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentStatusChart({
  rows,
  currencyCode,
}: {
  rows: PaymentStatusRow[];
  currencyCode: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!total) {
    return (
      <div className="reports-empty-chart reports-empty-chart--compact">
        <PaymentsIcon size={28} />
        <strong>Sin pagos en el período</strong>
        <span>La distribución aparecerá cuando existan movimientos en {currencyCode}.</span>
      </div>
    );
  }

  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += (row.count / total) * 100;
    const color = statusColors[index] ?? '#94a3b8';
    return `${color} ${start}% ${cursor}%`;
  });

  return (
    <div className="reports-status-layout">
      <div
        aria-label={`Estados de pago en ${currencyCode}`}
        className="reports-status-donut"
        role="img"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
      >
        <div>
          <strong>{total}</strong>
          <span>pagos</span>
        </div>
      </div>
      <div className="reports-status-list">
        {rows.map((row, index) => (
          <div key={row.status}>
            <span style={{ background: statusColors[index] ?? '#94a3b8' }} />
            <div>
              <strong>{paymentStatusLabels[row.status] ?? row.status}</strong>
              <small>{row.count} movimientos</small>
            </div>
            <b>{formatDashboardAmount(row.amount, currencyCode)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnitTable({ rows, currencyCode }: { rows: UnitFinancialRow[]; currencyCode: string }) {
  const visibleRows = rows.filter(
    (row) => row.charges || row.collections || row.outstanding || row.paymentCount,
  );
  if (!visibleRows.length) {
    return (
      <EmptyState
        description="Las unidades aparecerán cuando tengan cargos, pagos o saldos en esta moneda."
        icon={<UnitsIcon size={26} />}
        title="Sin actividad por unidad"
      />
    );
  }

  return (
    <>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Cargos</th>
              <th>Cobros</th>
              <th>Saldo</th>
              <th>Vencido</th>
              <th>Pagos</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.unitId}>
                <td>
                  <strong>{row.unitCode}</strong>
                  <span>{row.openItemCount} obligaciones abiertas</span>
                </td>
                <td>{formatDashboardAmount(row.charges, currencyCode)}</td>
                <td>{formatDashboardAmount(row.collections, currencyCode)}</td>
                <td>
                  <strong>{formatDashboardAmount(row.outstanding, currencyCode)}</strong>
                </td>
                <td data-overdue={row.overdue > 0 || undefined}>
                  {formatDashboardAmount(row.overdue, currencyCode)}
                </td>
                <td>{row.paymentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="reports-mobile-units">
        {visibleRows.map((row) => (
          <article key={row.unitId}>
            <div>
              <strong>Unidad {row.unitCode}</strong>
              <Badge tone={row.overdue > 0 ? 'warning' : 'success'}>
                {row.overdue > 0 ? 'Con vencidos' : 'Al día'}
              </Badge>
            </div>
            <dl>
              <div>
                <dt>Saldo</dt>
                <dd>{formatDashboardAmount(row.outstanding, currencyCode)}</dd>
              </div>
              <div>
                <dt>Cobrado</dt>
                <dd>{formatDashboardAmount(row.collections, currencyCode)}</dd>
              </div>
              <div>
                <dt>Pagos</dt>
                <dd>{row.paymentCount}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

export function ReportsPage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [period, setPeriod] = useState<ReportPeriod>(6);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      try {
        const [units, receivables, payments, summaries, aging] = await Promise.all([
          apiRequest<DashboardUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          apiRequest<DashboardReceivable[]>(
            `/v1/condominiums/${condominiumId}/receivables`,
            session,
          ),
          apiRequest<DashboardPayment[]>(`/v1/condominiums/${condominiumId}/payments`, session),
          apiRequest<ReceivableSummary[]>(
            `/v1/condominiums/${condominiumId}/receivables/summary`,
            session,
          ),
          apiRequest<ReceivableAging[]>(
            `/v1/condominiums/${condominiumId}/receivables/aging`,
            session,
          ),
        ]);
        setData({ units, receivables, payments, summaries, aging });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudieron cargar los reportes financieros.',
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

  const currencies = useMemo(
    () =>
      data ? getReportCurrencies(data.summaries, data.aging, data.receivables, data.payments) : [],
    [data],
  );

  useEffect(() => {
    const nextCurrency = currencies[0] ?? '';
    if (!selectedCurrency || !currencies.includes(selectedCurrency)) {
      setSelectedCurrency(nextCurrency);
    }
  }, [currencies, selectedCurrency]);

  const report = useMemo(() => {
    if (!data || !selectedCurrency) return null;
    return {
      periodTotals: getPeriodFinancialTotals(
        data.receivables,
        data.payments,
        selectedCurrency,
        period,
      ),
      portfolio: getPortfolioTotals(data.summaries, data.aging, selectedCurrency),
      monthly: buildMonthlyFinancialSeries(
        data.receivables,
        data.payments,
        selectedCurrency,
        new Date(),
        period,
      ),
      units: buildUnitFinancialRows(
        data.units,
        data.receivables,
        data.payments,
        selectedCurrency,
        period,
      ),
      statuses: buildPaymentStatusRows(data.payments, selectedCurrency, period),
      aging: data.aging.find((row) => row.currency_code === selectedCurrency),
    };
  }, [data, period, selectedCurrency]);

  const exportCsv = () => {
    if (!report || !selectedCurrency) return;
    const csv = createUnitReportCsv(report.units, selectedCurrency);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `habitta-${condominiumName.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${selectedCurrency.toLocaleLowerCase()}-${period}m.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) return <ReportsLoading />;

  if (error && !data) {
    return (
      <Surface className="reports-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error}
          icon={<ReportsIcon size={28} />}
          onAction={() => void load()}
          title="No pudimos generar los reportes"
        />
      </Surface>
    );
  }

  if (!data || !report) {
    return (
      <Surface className="reports-load-error">
        <EmptyState
          description="Los reportes se activarán cuando existan movimientos financieros."
          icon={<ReportsIcon size={28} />}
          title="Todavía no hay información financiera"
        />
      </Surface>
    );
  }

  const agingBuckets = report.aging ? getAgingBuckets(report.aging) : [];
  const agingTotal = agingBuckets.reduce((total, bucket) => total + bucket.numericAmount, 0);

  return (
    <div className="reports-page">
      <PageHeader
        actions={
          <>
            <Select
              aria-label="Período del reporte"
              onChange={(event) => setPeriod(Number(event.target.value) as ReportPeriod)}
              value={period}
            >
              <option value={3}>Últimos 3 meses</option>
              <option value={6}>Últimos 6 meses</option>
              <option value={12}>Últimos 12 meses</option>
            </Select>
            <Button onClick={exportCsv} size="sm">
              Exportar CSV
            </Button>
          </>
        }
        description={`${condominiumName} · lectura ejecutiva de cobranza, cartera y comportamiento por unidad.`}
        eyebrow="Inteligencia financiera"
        title="Reportes y análisis"
      />

      {error ? (
        <div className="reports-inline-alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}

      <div className="reports-currency-row">
        <div>
          <strong>Moneda del informe</strong>
          <span>Cada reporte conserva libros y totales independientes.</span>
        </div>
        <CurrencyTabs
          currencies={currencies}
          onChange={setSelectedCurrency}
          selected={selectedCurrency}
        />
      </div>

      <section aria-label="Indicadores del reporte" className="reports-metrics-grid">
        <MetricCard
          detail={`Cargos registrados durante los últimos ${period} meses.`}
          icon={<FeesIcon size={20} />}
          label="Cargos del período"
          tone="blue"
          value={formatDashboardAmount(report.periodTotals.charges, selectedCurrency)}
        />
        <MetricCard
          detail="Pagos aprobados dentro del período seleccionado."
          icon={<PaymentsIcon size={20} />}
          label="Cobros aprobados"
          tone="green"
          value={formatDashboardAmount(report.periodTotals.collections, selectedCurrency)}
        />
        <MetricCard
          detail="Relación entre cobros aprobados y cargos del período."
          icon={<CheckCircleIcon size={20} />}
          label="Tasa de recuperación"
          tone="navy"
          value={`${report.periodTotals.collectionRate.toFixed(1)}%`}
        />
        <MetricCard
          detail={`${formatDashboardAmount(report.portfolio.overdue, selectedCurrency)} corresponden a saldos vencidos.`}
          icon={<ExpensesIcon size={20} />}
          label="Cartera pendiente"
          tone="red"
          value={formatDashboardAmount(report.portfolio.outstanding, selectedCurrency)}
        />
      </section>

      <section className="reports-chart-grid">
        <Surface className="reports-panel reports-trend-panel">
          <div className="reports-section-heading">
            <div>
              <span className="reports-kicker">Evolución mensual</span>
              <h2>Cargos vs cobros</h2>
              <p>Compara obligaciones emitidas con pagos aprobados durante el período.</p>
            </div>
            <Badge tone="info">{selectedCurrency}</Badge>
          </div>
          <div className="reports-chart-legend">
            <span data-kind="collections">Cobros aprobados</span>
            <span data-kind="charges">Cargos registrados</span>
          </div>
          <MonthlyChart currencyCode={selectedCurrency} points={report.monthly} />
          <div className="reports-coverage-note">
            <ExpensesIcon size={17} />
            <span>
              Los egresos no se incluyen todavía porque el módulo de Gastos aún no expone un libro
              consolidado. El reporte nunca completa cifras con valores simulados.
            </span>
          </div>
        </Surface>

        <Surface className="reports-panel reports-aging-panel">
          <div className="reports-section-heading">
            <div>
              <span className="reports-kicker">Riesgo de cartera</span>
              <h2>Antigüedad de saldos</h2>
              <p>Distribución de lo pendiente según días de atraso.</p>
            </div>
          </div>
          {agingBuckets.length && agingTotal > 0 ? (
            <div className="reports-aging-list">
              {agingBuckets.map((bucket) => {
                const percentage = (bucket.numericAmount / agingTotal) * 100;
                return (
                  <div key={bucket.key}>
                    <div>
                      <strong>{bucket.label}</strong>
                      <span>{formatDashboardAmount(bucket.numericAmount, selectedCurrency)}</span>
                    </div>
                    <div className="reports-aging-track">
                      <span data-bucket={bucket.key} style={{ width: `${percentage}%` }} />
                    </div>
                    <small>{percentage.toFixed(1)}%</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="reports-empty-chart reports-empty-chart--compact">
              <CheckCircleIcon size={28} />
              <strong>Cartera al día</strong>
              <span>No existen saldos abiertos para distribuir.</span>
            </div>
          )}
        </Surface>
      </section>

      <section className="reports-secondary-grid">
        <Surface className="reports-panel reports-status-panel">
          <div className="reports-section-heading">
            <div>
              <span className="reports-kicker">Flujo de pagos</span>
              <h2>Estados del período</h2>
              <p>Volumen y monto por etapa de validación.</p>
            </div>
          </div>
          <PaymentStatusChart currencyCode={selectedCurrency} rows={report.statuses} />
        </Surface>

        <Surface className="reports-panel reports-insight-panel">
          <div className="reports-section-heading">
            <div>
              <span className="reports-kicker">Lectura ejecutiva</span>
              <h2>Señales principales</h2>
            </div>
          </div>
          <div className="reports-insight-list">
            <article data-tone={report.portfolio.overdue > 0 ? 'warning' : 'success'}>
              <span>
                <FeesIcon size={19} />
              </span>
              <div>
                <strong>
                  {report.portfolio.overdue > 0
                    ? 'Existe cartera vencida'
                    : 'No hay cartera vencida'}
                </strong>
                <small>
                  {report.portfolio.overdue > 0
                    ? `${formatDashboardAmount(report.portfolio.overdue, selectedCurrency)} requieren seguimiento.`
                    : 'Las obligaciones abiertas permanecen dentro de plazo.'}
                </small>
              </div>
            </article>
            <article data-tone={report.periodTotals.collectionRate >= 80 ? 'success' : 'warning'}>
              <span>
                <PaymentsIcon size={19} />
              </span>
              <div>
                <strong>
                  Recuperación de {report.periodTotals.collectionRate.toFixed(1)}% en el período
                </strong>
                <small>Compara cobros aprobados frente a cargos registrados.</small>
              </div>
            </article>
            <article data-tone="info">
              <span>
                <UnitsIcon size={19} />
              </span>
              <div>
                <strong>
                  {report.units.filter((row) => row.outstanding > 0).length} unidades con saldo
                  pendiente
                </strong>
                <small>Ordenadas de mayor a menor exposición financiera.</small>
              </div>
            </article>
          </div>
        </Surface>
      </section>

      <Surface className="reports-unit-panel">
        <div className="reports-section-heading reports-section-heading--units">
          <div>
            <span className="reports-kicker">Detalle por unidad</span>
            <h2>Desempeño de cobranza</h2>
            <p>Cargos y cobros del período, con cartera pendiente y vencida actual.</p>
          </div>
          <Button onClick={exportCsv} size="sm" variant="secondary">
            Descargar detalle
          </Button>
        </div>
        <UnitTable currencyCode={selectedCurrency} rows={report.units} />
      </Surface>
    </div>
  );
}
