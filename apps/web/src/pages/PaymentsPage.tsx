import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CheckCircleIcon,
  FeesIcon,
  PaymentsIcon,
  ReportsIcon,
  SettingsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { paymentApi } from '../features/payments/api';
import type {
  Payment,
  PaymentMethod,
  PaymentReceipt,
  Receivable,
} from '../features/payments/types';
import { ApiRequestError, apiRequest } from '../lib/api';
import { canManage, useCondominiumRoles } from '../lib/roles';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import {
  filterPayments,
  getPaymentCurrencies,
  getPaymentSummary,
  paymentStatusLabels,
  paymentStatusTone,
  sortPayments,
} from '../lib/payments';
import type { PaymentFilters } from '../lib/payments';
import { PaymentsDrawerHost, type PaymentsDrawerMode } from './PaymentsDrawers';

type Unit = { id: string; code: string; status?: string };

type PaymentsData = {
  units: Unit[];
  methods: PaymentMethod[];
  payments: Payment[];
  receivables: Receivable[];
  reviewQueue: Payment[];
  reviewQueueAvailable: boolean;
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const initialFilters: PaymentFilters = {
  query: '',
  status: '',
  currencyCode: '',
  methodId: '',
};

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
    <Surface className="payments-metric" data-tone={tone}>
      <div className="payments-metric__heading">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function PaymentsLoading() {
  return (
    <div aria-label="Cargando pagos" className="payments-page">
      <PageHeader eyebrow="Tesorería y validación" title="Pagos y comprobantes" />
      <div className="payments-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <div className="payments-insights-grid">
        <Skeleton className="payments-panel-skeleton" />
        <Skeleton className="payments-panel-skeleton" />
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
    <div aria-label="Seleccionar moneda" className="payments-currency-tabs">
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

export function PaymentsPage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [filters, setFilters] = useState<PaymentFilters>(initialFilters);
  const [drawer, setDrawer] = useState<PaymentsDrawerMode>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      try {
        const reviewQueuePromise = apiRequest<Payment[]>(
          `/v1/condominiums/${condominiumId}/payments/review-queue`,
          session,
        )
          .then((items) => ({ items, available: true }))
          .catch((requestError: unknown) => {
            if (requestError instanceof ApiRequestError && requestError.status === 403) {
              return { items: [], available: false };
            }
            throw requestError;
          });
        const [units, methods, payments, receivables, reviewQueueResult] = await Promise.all([
          apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          apiRequest<PaymentMethod[]>(`/v1/condominiums/${condominiumId}/payment-methods`, session),
          apiRequest<Payment[]>(`/v1/condominiums/${condominiumId}/payments`, session),
          apiRequest<Receivable[]>(`/v1/condominiums/${condominiumId}/receivables`, session).catch(
            () => [],
          ),
          reviewQueuePromise,
        ]);
        setData({
          units,
          methods,
          payments,
          receivables,
          reviewQueue: reviewQueueResult.items,
          reviewQueueAvailable: reviewQueueResult.available,
        });
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : 'No se pudieron cargar los pagos.',
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
    setMessage('');
  }, [condominiumId]);

  const currencies = useMemo(
    () => (data ? getPaymentCurrencies(data.payments, data.methods) : []),
    [data],
  );

  useEffect(() => {
    const nextCurrency = currencies[0] ?? '';
    if (!selectedCurrency || !currencies.includes(selectedCurrency)) {
      setSelectedCurrency(nextCurrency);
    }
  }, [currencies, selectedCurrency]);

  const unitCodes = useMemo(
    () => new Map((data?.units ?? []).map((unit) => [unit.id, unit.code])),
    [data?.units],
  );
  const methodNames = useMemo(
    () => new Map((data?.methods ?? []).map((method) => [method.id, method.display_name])),
    [data?.methods],
  );

  const visiblePayments = useMemo(() => {
    if (!data) return [];
    return sortPayments(
      filterPayments(data.payments, data.methods, unitCodes, {
        ...filters,
        currencyCode: selectedCurrency,
      }),
    );
  }, [data, filters, selectedCurrency, unitCodes]);

  const onChanged = async (nextMessage: string) => {
    setMessage(nextMessage);
    setDrawer(null);
    await load(true);
  };

  const openPayment = async (payment: Payment) => {
    setMessage('');
    if (['draft', 'correction_requested'].includes(payment.status)) {
      setDrawer({ type: 'edit', payment });
      return;
    }
    if (['submitted', 'under_review'].includes(payment.status)) {
      setDrawer({ type: 'review', payment });
      return;
    }
    if (['approved', 'reversed'].includes(payment.status)) {
      try {
        const receipt = await paymentApi<PaymentReceipt>(
          `/v1/condominiums/${condominiumId}/payments/${payment.id}/receipt`,
          session,
        );
        setDrawer({ type: 'receipt', payment, receipt });
      } catch (requestError) {
        setMessage(
          requestError instanceof Error ? requestError.message : 'No se pudo abrir el recibo.',
        );
      }
    }
  };

  if (loading && !data) return <PaymentsLoading />;

  if (error && !data) {
    return (
      <Surface className="payments-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error}
          icon={<PaymentsIcon size={28} />}
          onAction={() => void load()}
          title="No pudimos cargar los pagos"
        />
      </Surface>
    );
  }

  if (!data) return null;

  const summary = getPaymentSummary(data.payments, selectedCurrency);
  const activeMethods = data.methods.filter(
    (method) =>
      method.is_active && (!selectedCurrency || method.currency_code === selectedCurrency),
  );
  const selectedCurrencyLabel = selectedCurrency || 'USD';

  return (
    <div className="payments-page">
      <PageHeader
        actions={
          <>
            {manage ? (
              <Button onClick={() => setDrawer({ type: 'methods' })} size="sm" variant="secondary">
                <SettingsIcon size={17} /> Métodos
              </Button>
            ) : null}
            <Button onClick={() => setDrawer({ type: 'create' })} size="sm">
              Registrar pago
            </Button>
          </>
        }
        description={`${condominiumName} · registro, revisión, aplicación y recibos en una sola experiencia.`}
        eyebrow="Tesorería y validación"
        title="Pagos y comprobantes"
      />

      {error ? (
        <div className="payments-inline-alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}
      {message ? (
        <div className="payments-success-alert" role="status">
          <CheckCircleIcon size={17} /> {message}
        </div>
      ) : null}

      <div className="payments-currency-row">
        <div>
          <strong>Vista de tesorería</strong>
          <span>Los montos se presentan y aplican por moneda.</span>
        </div>
        {currencies.length ? (
          <CurrencyTabs
            currencies={currencies}
            onChange={setSelectedCurrency}
            selected={selectedCurrency}
          />
        ) : null}
      </div>

      <section aria-label="Indicadores de pagos" className="payments-metrics-grid">
        <MetricCard
          detail="Solo movimientos aprobados y contabilizados."
          icon={<CheckCircleIcon size={20} />}
          label="Pagos aprobados"
          tone="green"
          value={formatDashboardAmount(summary.approvedAmount, selectedCurrencyLabel)}
        />
        <MetricCard
          detail={
            data.reviewQueueAvailable
              ? 'Comprobantes pendientes de validación.'
              : 'Tu rol no puede consultar la bandeja.'
          }
          icon={<PaymentsIcon size={20} />}
          label="Por revisar"
          tone="blue"
          value={data.reviewQueueAvailable ? String(summary.pendingReview) : 'Restringido'}
        />
        <MetricCard
          detail="Borradores y pagos devueltos para corrección."
          icon={<ReportsIcon size={20} />}
          label="Requieren acción"
          tone="navy"
          value={String(summary.drafts)}
        />
        <MetricCard
          detail="Monto reversado con trazabilidad conservada."
          icon={<FeesIcon size={20} />}
          label="Pagos reversados"
          tone="red"
          value={formatDashboardAmount(summary.reversedAmount, selectedCurrencyLabel)}
        />
      </section>

      <section className="payments-insights-grid">
        <Surface className="payments-panel payments-review-panel">
          <div className="payments-section-heading">
            <div>
              <span className="payments-kicker">Validación</span>
              <h2>Bandeja de revisión</h2>
              <p>Prioriza los pagos enviados y abre su comprobante antes de aprobar.</p>
            </div>
            <Badge tone={data.reviewQueue.length ? 'warning' : 'success'}>
              {data.reviewQueueAvailable
                ? `${data.reviewQueue.length} pendientes`
                : 'Acceso restringido'}
            </Badge>
          </div>
          {data.reviewQueueAvailable && data.reviewQueue.length ? (
            <div className="payments-review-list">
              {data.reviewQueue.slice(0, 4).map((payment) => (
                <button
                  key={payment.id}
                  onClick={() => setDrawer({ type: 'review', payment })}
                  type="button"
                >
                  <span>
                    <PaymentsIcon size={18} />
                  </span>
                  <div>
                    <strong>
                      {unitCodes.get(payment.unit_id) ?? 'Unidad'} · {payment.payer_name}
                    </strong>
                    <small>
                      {formatDashboardDate(payment.payment_date)} ·{' '}
                      {paymentStatusLabels[payment.status] ?? payment.status}
                    </small>
                  </div>
                  <b>
                    {formatDashboardAmount(payment.original_amount, payment.original_currency_code)}
                  </b>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              description={
                data.reviewQueueAvailable
                  ? 'Los pagos enviados aparecerán aquí para su validación.'
                  : 'La bandeja permanece oculta para este rol.'
              }
              icon={<CheckCircleIcon size={25} />}
              title={data.reviewQueueAvailable ? 'Bandeja al día' : 'Revisión restringida'}
            />
          )}
        </Surface>

        <Surface className="payments-panel payments-method-panel">
          <div className="payments-section-heading">
            <div>
              <span className="payments-kicker">Canales de cobro</span>
              <h2>Métodos disponibles</h2>
              <p>Opciones activas para la moneda seleccionada.</p>
            </div>
            <Button onClick={() => setDrawer({ type: 'methods' })} size="sm" variant="ghost">
              Configurar
            </Button>
          </div>
          {activeMethods.length ? (
            <div className="payments-method-summary">
              {activeMethods.map((method) => (
                <article key={method.id}>
                  <span>
                    <SettingsIcon size={18} />
                  </span>
                  <div>
                    <strong>{method.display_name}</strong>
                    <small>{method.method_type.replaceAll('_', ' ')}</small>
                  </div>
                  <div>
                    {method.requires_reference ? <Badge tone="info">Referencia</Badge> : null}
                    {method.requires_proof ? <Badge tone="warning">Comprobante</Badge> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              actionLabel="Crear método"
              description="Configura al menos una opción activa para registrar pagos."
              icon={<SettingsIcon size={25} />}
              onAction={() => setDrawer({ type: 'methods' })}
              title={`Sin métodos en ${selectedCurrencyLabel}`}
            />
          )}
        </Surface>
      </section>

      <Surface className="payments-list-panel">
        <div className="payments-section-heading payments-section-heading--list">
          <div>
            <span className="payments-kicker">Historial</span>
            <h2>Movimientos registrados</h2>
            <p>Busca por unidad, pagador, referencia o método.</p>
          </div>
          <span className="payments-result-count">{visiblePayments.length} resultados</span>
        </div>
        <div className="payments-filters">
          <input
            className="input payments-search"
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Buscar pago…"
            type="search"
            value={filters.query}
          />
          <Select
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            value={filters.status}
          >
            <option value="">Todos los estados</option>
            {Object.entries(paymentStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => setFilters({ ...filters, methodId: event.target.value })}
            value={filters.methodId}
          >
            <option value="">Todos los métodos</option>
            {data.methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.display_name}
              </option>
            ))}
          </Select>
        </div>

        {visiblePayments.length ? (
          <>
            <div className="payments-table-wrap">
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>Unidad y pagador</th>
                    <th>Método</th>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <strong>{unitCodes.get(payment.unit_id) ?? 'Sin unidad'}</strong>
                        <span>
                          {payment.payer_name}
                          {payment.reference ? ` · ${payment.reference}` : ''}
                        </span>
                      </td>
                      <td>
                        {methodNames.get(payment.payment_method_id) ?? 'Método no disponible'}
                      </td>
                      <td>{formatDashboardDate(payment.payment_date)}</td>
                      <td>
                        <strong>
                          {formatDashboardAmount(
                            payment.original_amount,
                            payment.original_currency_code,
                          )}
                        </strong>
                      </td>
                      <td>
                        <Badge tone={paymentStatusTone(payment.status)}>
                          {paymentStatusLabels[payment.status] ?? payment.status}
                        </Badge>
                      </td>
                      <td>
                        <Button onClick={() => void openPayment(payment)} size="sm" variant="ghost">
                          {['approved', 'reversed'].includes(payment.status)
                            ? 'Recibo'
                            : ['submitted', 'under_review'].includes(payment.status)
                              ? 'Revisar'
                              : 'Abrir'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="payments-mobile-list">
              {visiblePayments.map((payment) => (
                <button key={payment.id} onClick={() => void openPayment(payment)} type="button">
                  <div>
                    <strong>
                      {unitCodes.get(payment.unit_id) ?? 'Sin unidad'} · {payment.payer_name}
                    </strong>
                    <Badge tone={paymentStatusTone(payment.status)}>
                      {paymentStatusLabels[payment.status] ?? payment.status}
                    </Badge>
                  </div>
                  <span>
                    {methodNames.get(payment.payment_method_id) ?? 'Método no disponible'} ·{' '}
                    {formatDashboardDate(payment.payment_date)}
                  </span>
                  <b>
                    {formatDashboardAmount(payment.original_amount, payment.original_currency_code)}
                  </b>
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            actionLabel="Limpiar filtros"
            description="Prueba con otros términos, estados o métodos."
            icon={<PaymentsIcon size={26} />}
            onAction={() => setFilters(initialFilters)}
            title="No encontramos pagos"
          />
        )}
      </Surface>

      <PaymentsDrawerHost
        condominiumId={condominiumId}
        drawer={drawer}
        methods={data.methods}
        onChanged={onChanged}
        onClose={() => setDrawer(null)}
        receivables={data.receivables}
        session={session}
        units={data.units}
      />
    </div>
  );
}
