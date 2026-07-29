import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CheckCircleIcon,
  CommunityIcon,
  FeesIcon,
  PaymentsIcon,
  PeopleIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Skeleton, Surface } from '../components/ui';
import { ApiRequestError, apiRequest } from '../lib/api';
import {
  buildRecentActivity,
  formatDashboardAmount,
  formatDashboardDate,
  getAgingBuckets,
  getAgingTotal,
  getOverdueTotal,
  sortReceivableSummaries,
} from '../lib/dashboard';
import type {
  DashboardBuilding,
  DashboardPayment,
  DashboardPerson,
  DashboardReceivable,
  DashboardUnit,
  ReceivableAging,
  ReceivableSummary,
} from '../lib/dashboard';
import { APP_ROUTES } from '../navigation';
import type { AppRoute } from '../navigation';

type DashboardData = {
  units: DashboardUnit[];
  buildings: DashboardBuilding[];
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
  if (['correction_requested'].includes(status)) return 'warning' as const;
  return 'neutral' as const;
};

function DashboardLoading() {
  return (
    <div className="dashboard-page" aria-label="Cargando dashboard">
      <Surface className="dashboard-hero dashboard-hero--loading">
        <Skeleton className="skeleton--badge" />
        <Skeleton className="skeleton--title" />
        <Skeleton className="skeleton--line" />
      </Surface>
      <div className="dashboard-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <div className="dashboard-layout-grid">
        <Skeleton className="dashboard-panel-skeleton" />
        <Skeleton className="dashboard-panel-skeleton" />
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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const reviewQueuePromise = apiRequest<DashboardPayment[]>(
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
        units,
        buildings,
        people,
        summaries,
        aging,
        receivables,
        payments,
        reviewQueueResult,
      ] = await Promise.all([
        apiRequest<DashboardUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
        apiRequest<DashboardBuilding[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
        apiRequest<DashboardPerson[]>(`/v1/condominiums/${condominiumId}/people`, session),
        apiRequest<ReceivableSummary[]>(
          `/v1/condominiums/${condominiumId}/receivables/summary`,
          session,
        ),
        apiRequest<ReceivableAging[]>(
          `/v1/condominiums/${condominiumId}/receivables/aging`,
          session,
        ),
        apiRequest<DashboardReceivable[]>(
          `/v1/condominiums/${condominiumId}/receivables`,
          session,
        ),
        apiRequest<DashboardPayment[]>(`/v1/condominiums/${condominiumId}/payments`, session),
        reviewQueuePromise,
      ]);

      setData({
        units,
        buildings,
        people,
        summaries,
        aging,
        receivables,
        payments,
        reviewQueue: reviewQueueResult.items,
        reviewQueueAvailable: reviewQueueResult.available,
      });
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

  const activity = useMemo(
    () => (data ? buildRecentActivity(data.receivables, data.payments, data.units) : []),
    [data],
  );

  if (loading && !data) return <DashboardLoading />;

  if (error && !data) {
    return (
      <Surface className="dashboard-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error}
          icon={<CommunityIcon size={26} />}
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
  const paymentRoute = routeByKey('payments');
  const feesRoute = routeByKey('fees');
  const unitsRoute = routeByKey('units');
  const peopleRoute = routeByKey('people');

  return (
    <div className="dashboard-page">
      <Surface className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <Badge tone="success">Operación actualizada</Badge>
          <h2>{condominiumName}</h2>
          <p>
            Revisa cobranza, pagos y actividad operativa sin mezclar monedas ni alterar el historial
            financiero.
          </p>
        </div>
        <div className="dashboard-hero__actions">
          <span>
            <CheckCircleIcon size={18} />
            Datos del condominio seleccionado
          </span>
          <Button disabled={loading} onClick={() => void load()} size="sm" variant="secondary">
            {loading ? 'Actualizando…' : 'Actualizar'}
          </Button>
        </div>
      </Surface>

      {error ? (
        <div className="dashboard-inline-alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}

      <section className="dashboard-kpi-grid" aria-label="Indicadores principales">
        {summaries.length ? (
          summaries.map((summary) => (
            <Surface className="dashboard-kpi dashboard-kpi--financial" key={summary.currency_code}>
              <div className="dashboard-kpi__header">
                <span>Por cobrar</span>
                <Badge tone="info">{summary.currency_code}</Badge>
              </div>
              <strong>{formatDashboardAmount(summary.net_outstanding, summary.currency_code)}</strong>
              <small>
                Débitos {formatDashboardAmount(summary.total_debits, summary.currency_code)} ·
                Créditos {formatDashboardAmount(summary.total_credits, summary.currency_code)}
              </small>
            </Surface>
          ))
        ) : (
          <Surface className="dashboard-kpi dashboard-kpi--financial">
            <div className="dashboard-kpi__header">
              <span>Por cobrar</span>
              <Badge tone="success">Al día</Badge>
            </div>
            <strong>Sin saldos pendientes</strong>
            <small>No hay obligaciones abiertas registradas.</small>
          </Surface>
        )}

        <Surface className="dashboard-kpi">
          <div className="dashboard-kpi__header">
            <span>Pagos por revisar</span>
            <PaymentsIcon size={19} />
          </div>
          <strong>{data.reviewQueueAvailable ? data.reviewQueue.length : '—'}</strong>
          <small>
            {data.reviewQueueAvailable
              ? data.reviewQueue.length
                ? 'Requieren validación manual.'
                : 'La bandeja está al día.'
              : 'Tu rol no tiene acceso a esta bandeja.'}
          </small>
        </Surface>

        <Surface className="dashboard-kpi">
          <div className="dashboard-kpi__header">
            <span>Unidades activas</span>
            <UnitsIcon size={19} />
          </div>
          <strong>{activeUnits}</strong>
          <small>
            {data.buildings.length} {data.buildings.length === 1 ? 'torre registrada' : 'torres registradas'}.
          </small>
        </Surface>
      </section>

      <div className="dashboard-layout-grid">
        <Surface className="dashboard-panel dashboard-aging-panel">
          <div className="dashboard-section-heading">
            <div>
              <span className="dashboard-section-kicker">Cobranza</span>
              <h2>Antigüedad de saldos</h2>
              <p>Cada moneda se presenta de forma independiente.</p>
            </div>
            {feesRoute ? (
              <Button onClick={() => onNavigate(feesRoute)} size="sm" variant="ghost">
                Ver cuentas por cobrar
              </Button>
            ) : null}
          </div>

          {data.aging.length ? (
            <div className="dashboard-aging-list">
              {data.aging.map((row) => {
                const buckets = getAgingBuckets(row);
                const total = getAgingTotal(row);
                const overdue = getOverdueTotal(row);
                return (
                  <article className="dashboard-aging-card" key={row.currency_code}>
                    <header>
                      <div>
                        <Badge tone="info">{row.currency_code}</Badge>
                        <strong>{formatDashboardAmount(String(total), row.currency_code)}</strong>
                      </div>
                      <span data-alert={overdue > 0 || undefined}>
                        {overdue > 0
                          ? `${formatDashboardAmount(String(overdue), row.currency_code)} vencido`
                          : 'Sin vencidos'}
                      </span>
                    </header>
                    <div className="dashboard-aging-buckets">
                      {buckets.map((bucket) => {
                        const width =
                          total > 0 ? Math.max((bucket.numericAmount / total) * 100, 2) : 0;
                        return (
                          <div className="dashboard-aging-row" key={bucket.key}>
                            <div>
                              <span>{bucket.label}</span>
                              <strong>
                                {formatDashboardAmount(bucket.amount, row.currency_code)}
                              </strong>
                            </div>
                            <div className="dashboard-aging-track" aria-hidden="true">
                              <span style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              description="Cuando existan obligaciones, Habitta mostrará aquí su antigüedad por moneda."
              icon={<FeesIcon size={26} />}
              title="Sin saldos para analizar"
            />
          )}
        </Surface>

        <div className="dashboard-side-stack">
          <Surface className="dashboard-panel">
            <div className="dashboard-section-heading">
              <div>
                <span className="dashboard-section-kicker">Operación</span>
                <h2>Estado de la comunidad</h2>
              </div>
            </div>
            <div className="dashboard-operation-list">
              <button onClick={() => unitsRoute && onNavigate(unitsRoute)} type="button">
                <span>
                  <UnitsIcon size={20} />
                  Unidades
                </span>
                <strong>{data.units.length}</strong>
              </button>
              <button onClick={() => peopleRoute && onNavigate(peopleRoute)} type="button">
                <span>
                  <PeopleIcon size={20} />
                  Personas activas
                </span>
                <strong>{activePeople}</strong>
              </button>
              <div>
                <span>
                  <CommunityIcon size={20} />
                  Torres
                </span>
                <strong>{data.buildings.length}</strong>
              </div>
            </div>
          </Surface>

          <Surface className="dashboard-panel dashboard-alert-panel">
            <div>
              <span className="dashboard-section-kicker">Atención</span>
              <h2>Prioridades de hoy</h2>
            </div>
            <div className="dashboard-priority-list">
              <div data-complete={!data.reviewQueue.length || undefined}>
                <PaymentsIcon size={19} />
                <span>
                  <strong>
                    {data.reviewQueueAvailable
                      ? `${data.reviewQueue.length} pagos por revisar`
                      : 'Cola de revisión restringida'}
                  </strong>
                  <small>Valida referencias y comprobantes antes de aprobar.</small>
                </span>
              </div>
              <div
                data-complete={
                  summaries.every((summary) => Number(summary.net_outstanding) <= 0) || undefined
                }
              >
                <FeesIcon size={19} />
                <span>
                  <strong>
                    {summaries.some((summary) => Number(summary.net_outstanding) > 0)
                      ? 'Cobranza pendiente'
                      : 'Cobranza al día'}
                  </strong>
                  <small>Los saldos permanecen separados por moneda.</small>
                </span>
              </div>
            </div>
          </Surface>
        </div>
      </div>

      <Surface className="dashboard-panel dashboard-activity-panel">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-section-kicker">Trazabilidad</span>
            <h2>Actividad reciente</h2>
            <p>Últimos cargos y pagos registrados para este condominio.</p>
          </div>
          <div className="dashboard-activity-actions">
            {paymentRoute ? (
              <Button onClick={() => onNavigate(paymentRoute)} size="sm" variant="ghost">
                Pagos
              </Button>
            ) : null}
            {feesRoute ? (
              <Button onClick={() => onNavigate(feesRoute)} size="sm" variant="ghost">
                Cuotas
              </Button>
            ) : null}
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
                    <td>
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
                    <td>{item.detail}</td>
                    <td>{formatDashboardAmount(item.amount, item.currencyCode)}</td>
                    <td>
                      <Badge tone={toneForStatus(item.status)}>
                        {item.kind === 'payment'
                          ? paymentStatusLabels[item.status] ?? item.status
                          : receivableStatusLabels[item.status] ?? item.status}
                      </Badge>
                    </td>
                    <td>{formatDashboardDate(item.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="Los cargos y pagos aparecerán aquí cuando comience la operación."
            icon={<CheckCircleIcon size={26} />}
            title="Todavía no hay actividad"
          />
        )}
      </Surface>
    </div>
  );
}
