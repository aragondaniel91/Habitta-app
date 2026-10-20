import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, FeesIcon, PaymentsIcon, ReportsIcon } from '../components/icons';
import { FinancialPagination } from '../components/FinancialPagination';
import { Badge, Button, EmptyState, InfoHint, Select, Skeleton, Surface } from '../components/ui';
import { PageChromeExtension, PageHeader } from '../components/PageHeader';
import { paymentApi } from '../features/payments/api';
import { ResidentPaymentWizard } from '../features/payments/components/ResidentPaymentWizard';
import {
  paymentActorLabel,
  type ChargeConcept,
  type Payment,
  type PaymentMethod,
  type PaymentReceipt,
  type Receivable,
} from '../features/payments/types';
import { ApiRequestError, apiRequest } from '../lib/api';
import { unitReferenceLabel } from '../lib/unit-domain';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import { collectAllPages, financialPagePath, mergePageItems, pageInfo } from '../lib/pagination';
import type { PageInfo, PaginatedResponse } from '../lib/pagination';
import {
  filterPayments,
  getPaymentCurrencies,
  getPaymentSummary,
  paymentStatusLabels,
  paymentStatusTone,
  sortPayments,
} from '../lib/payments';
import type { PaymentFilters } from '../lib/payments';
import { PaymentMethodsView, PaymentsDrawerHost, type PaymentsDrawerMode } from './PaymentsDrawers';
import '../payments.css';

type Unit = { id: string; code: string; building_id: string | null; status?: string };
type Building = { id: string; name: string };

type PaymentsData = {
  units: Unit[];
  buildings: Building[];
  methods: PaymentMethod[];
  concepts: ChargeConcept[];
  payments: Payment[];
  paymentsPage: PageInfo;
  receivables: Receivable[];
  reviewQueue: Payment[];
  reviewQueueAvailable: boolean;
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const PAYMENTS_PAGE_SIZE = 50;
const REFERENCE_PAGE_SIZE = 100;
const REVIEW_PAGE_SIZE = 10;

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
  onClick,
  selected = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
  onClick?: () => void;
  selected?: boolean;
}) {
  const content = (
    <>
      <div className="payments-metric__heading">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </>
  );
  if (onClick) {
    return (
      <button
        aria-pressed={selected}
        className="payments-metric payments-metric--interactive surface"
        data-tone={tone}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <Surface className="payments-metric" data-tone={tone}>
      {content}
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
  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMorePayments, setLoadingMorePayments] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [activeTab, setActiveTab] = useState<'review' | 'movements' | 'methods'>('review');
  const [filters, setFilters] = useState<PaymentFilters>(initialFilters);
  const [quickStatus, setQuickStatus] = useState<
    'all' | 'pending' | 'approved' | 'attention' | 'reversed'
  >('all');
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFocus, setReviewFocus] = useState<'all' | 'pending' | 'actions'>('all');
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
        const methodsPromise = collectAllPages((page) =>
          apiRequest<PaginatedResponse<PaymentMethod>>(
            financialPagePath(
              `/v1/condominiums/${condominiumId}/payment-methods`,
              page,
              REFERENCE_PAGE_SIZE,
            ),
            session,
          ),
        );
        const conceptsPromise = collectAllPages((page) =>
          apiRequest<PaginatedResponse<ChargeConcept>>(
            financialPagePath(
              `/v1/condominiums/${condominiumId}/charge-concepts`,
              page,
              REFERENCE_PAGE_SIZE,
            ),
            session,
          ),
        ).catch(() => [] as ChargeConcept[]);
        const receivablesPromise = collectAllPages((page) =>
          apiRequest<PaginatedResponse<Receivable>>(
            financialPagePath(
              `/v1/condominiums/${condominiumId}/receivables`,
              page,
              REFERENCE_PAGE_SIZE,
            ),
            session,
          ),
        ).catch(() => [] as Receivable[]);
        const [units, buildings, methods, concepts, paymentsPage, receivables, reviewQueueResult] =
          await Promise.all([
            apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
            apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
            methodsPromise,
            conceptsPromise,
            apiRequest<PaginatedResponse<Payment>>(
              financialPagePath(
                `/v1/condominiums/${condominiumId}/payments`,
                1,
                PAYMENTS_PAGE_SIZE,
              ),
              session,
            ),
            receivablesPromise,
            reviewQueuePromise,
          ]);
        setData({
          units,
          buildings,
          methods,
          concepts,
          payments: paymentsPage.items,
          paymentsPage: pageInfo(paymentsPage),
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
    setQuickStatus('all');
    setActiveTab('review');
    setReviewPage(1);
    setReviewSearch('');
    setReviewFocus('all');
    setMessage('');
    setLoadingMorePayments(false);
  }, [condominiumId]);

  const currencies = useMemo(
    () => (data ? getPaymentCurrencies(data.payments, data.methods) : []),
    [data],
  );
  const buildingNameById = useMemo(
    () =>
      Object.fromEntries((data?.buildings ?? []).map((building) => [building.id, building.name])),
    [data?.buildings],
  );
  // The administration may record a payment against any unit of the condominium; the drawer now
  // receives them named rather than resolving buildings itself.
  const captureUnitOptions = useMemo(
    () =>
      (data?.units ?? []).map((unit) => ({
        id: unit.id,
        label: unitReferenceLabel({
          code: unit.code,
          buildingName: unit.building_id ? (buildingNameById[unit.building_id] ?? null) : null,
        }),
      })),
    [data?.units, buildingNameById],
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
    const matching = filterPayments(data.payments, data.methods, unitCodes, {
      ...filters,
      currencyCode: selectedCurrency,
    });
    return sortPayments(
      matching.filter((payment) => {
        if (quickStatus === 'pending')
          return ['submitted', 'under_review'].includes(payment.status);
        if (quickStatus === 'approved') return payment.status === 'approved';
        if (quickStatus === 'reversed') return payment.status === 'reversed';
        if (quickStatus === 'attention')
          return ['draft', 'correction_requested'].includes(payment.status);
        return true;
      }),
    );
  }, [data, filters, quickStatus, selectedCurrency, unitCodes]);

  const reviewQueueForCurrency = useMemo(
    () =>
      (data?.reviewQueue ?? []).filter(
        (payment) => !selectedCurrency || payment.original_currency_code === selectedCurrency,
      ),
    [data?.reviewQueue, selectedCurrency],
  );

  const filteredReviewQueue = useMemo(() => {
    const term = reviewSearch.trim().toLocaleLowerCase('es');
    return sortPayments(
      reviewQueueForCurrency.filter(
        (payment) =>
          !term ||
          [payment.payer_name, unitCodes.get(payment.unit_id), payment.reference].some((value) =>
            (value ?? '').toLocaleLowerCase('es').includes(term),
          ),
      ),
    );
  }, [reviewQueueForCurrency, reviewSearch, unitCodes]);

  useEffect(() => {
    setReviewPage(1);
  }, [condominiumId, selectedCurrency, reviewSearch, reviewQueueForCurrency.length]);

  const reviewPageCount = Math.max(1, Math.ceil(filteredReviewQueue.length / REVIEW_PAGE_SIZE));
  const visibleReviewPage = Math.min(reviewPage, reviewPageCount);
  const reviewPageStart = (visibleReviewPage - 1) * REVIEW_PAGE_SIZE;
  const pagedReviewQueue = filteredReviewQueue.slice(
    reviewPageStart,
    reviewPageStart + REVIEW_PAGE_SIZE,
  );

  const showMetricView = (view: 'pending' | 'approved' | 'attention' | 'reversed') => {
    if (view === 'pending' || view === 'attention') {
      const focus = view === 'pending' ? 'pending' : 'actions';
      setReviewFocus((current) => (activeTab === 'review' && current === focus ? 'all' : focus));
      setActiveTab('review');
      return;
    }
    const status = view === 'approved' ? 'approved' : 'reversed';
    setQuickStatus((current) => (activeTab === 'movements' && current === status ? 'all' : status));
    setFilters((current) => ({ ...current, status: '' }));
    setActiveTab('movements');
  };

  const actionRequiredPayments = useMemo(() => {
    if (!data) return [];
    return sortPayments(
      data.payments.filter(
        (payment) =>
          ['draft', 'correction_requested'].includes(payment.status) &&
          payment.submitted_by_user_id === session.user.id &&
          (!selectedCurrency || payment.original_currency_code === selectedCurrency),
      ),
    );
  }, [data, selectedCurrency, session.user.id]);

  const loadMorePayments = useCallback(async () => {
    if (!data?.paymentsPage.hasNextPage || loadingMorePayments) return;
    setLoadingMorePayments(true);
    setError('');
    try {
      const next = await apiRequest<PaginatedResponse<Payment>>(
        financialPagePath(
          `/v1/condominiums/${condominiumId}/payments`,
          data.paymentsPage.page + 1,
          data.paymentsPage.pageSize,
        ),
        session,
      );
      setData((current) =>
        current
          ? {
              ...current,
              payments: mergePageItems(current.payments, next.items),
              paymentsPage: pageInfo(next),
            }
          : current,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar más historial de pagos.',
      );
    } finally {
      setLoadingMorePayments(false);
    }
  }, [condominiumId, data?.paymentsPage, loadingMorePayments, session]);

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
      try {
        const currentPayment = await paymentApi<Payment>(
          `/v1/condominiums/${condominiumId}/payments/${payment.id}`,
          session,
        );
        setDrawer({ type: 'review', payment: currentPayment });
      } catch (requestError) {
        setMessage(
          requestError instanceof Error ? requestError.message : 'No se pudo abrir el pago.',
        );
      }
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
  const selectedCurrencyLabel = selectedCurrency || 'USD';

  return (
    <div className="payments-page">
      <PageChromeExtension
        tabs={
          <nav aria-label="Secciones de pagos" className="payments-admin-tabs" role="tablist">
            {(
              [
                {
                  id: 'review',
                  label: 'Revisión',
                  detail: data.reviewQueueAvailable ? reviewQueueForCurrency.length : null,
                },
                { id: 'movements', label: 'Movimientos', detail: null },
                { id: 'methods', label: 'Métodos de pago', detail: null },
              ] as const
            ).map(({ id, label, detail }) => (
              <button
                aria-controls={`payments-admin-panel-${id}`}
                aria-selected={activeTab === id}
                className="payments-admin-tabs__item"
                id={`payments-admin-tab-${id}`}
                key={id}
                onClick={() => setActiveTab(id)}
                role="tab"
                type="button"
              >
                {label}
                {detail !== null ? (
                  <span className="payments-admin-tabs__count">{detail}</span>
                ) : null}
              </button>
            ))}
          </nav>
        }
      >
        <PageHeader
          actions={
            <>
              <Button onClick={() => setDrawer({ type: 'create' })} size="sm">
                Registrar pago
              </Button>
            </>
          }
          description={`${condominiumName} · registro, revisión, aplicación y recibos en una sola experiencia.`}
          eyebrow="Tesorería y validación"
          title="Pagos y comprobantes"
        />
      </PageChromeExtension>

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
      {activeTab === 'movements' && data.payments.length < data.paymentsPage.total ? (
        <div className="payments-inline-alert" role="status">
          Indicadores, búsquedas y filtros usan {data.payments.length} de {data.paymentsPage.total}{' '}
          pagos cargados. Usa “Cargar más” para ampliar el historial sin traerlo completo de una
          vez.
        </div>
      ) : null}

      <div className="payments-currency-row">
        <div>
          <strong>Moneda de los pagos</strong>
          <span>Consulta pagos por moneda. No se suman ni convierten importes entre monedas.</span>
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
          detail="Movimientos aplicados. Haz clic para consultar."
          icon={<CheckCircleIcon size={20} />}
          label="Pagos aprobados"
          onClick={() => showMetricView('approved')}
          selected={activeTab === 'movements' && quickStatus === 'approved'}
          tone="green"
          value={formatDashboardAmount(summary.approvedAmount, selectedCurrencyLabel)}
        />
        <MetricCard
          detail={
            data.reviewQueueAvailable
              ? 'Pagos enviados que esperan una decisión.'
              : 'Tu rol no puede consultar la bandeja.'
          }
          icon={<PaymentsIcon size={20} />}
          label="Por revisar"
          onClick={() => showMetricView('pending')}
          selected={activeTab === 'review' && reviewFocus === 'pending'}
          tone="blue"
          value={data.reviewQueueAvailable ? String(reviewQueueForCurrency.length) : 'Restringido'}
        />
        <MetricCard
          detail="Solo tus capturas sin enviar o devueltas para corregir."
          icon={<ReportsIcon size={20} />}
          label="Mis registros por completar"
          onClick={() => showMetricView('attention')}
          selected={activeTab === 'review' && reviewFocus === 'actions'}
          tone="navy"
          value={String(actionRequiredPayments.length)}
        />
        <MetricCard
          detail="Consulta movimientos reversados con trazabilidad."
          icon={<FeesIcon size={20} />}
          label="Pagos reversados"
          onClick={() => showMetricView('reversed')}
          selected={activeTab === 'movements' && quickStatus === 'reversed'}
          tone="red"
          value={formatDashboardAmount(summary.reversedAmount, selectedCurrencyLabel)}
        />
      </section>

      {data.payments.length < data.paymentsPage.total ? (
        <p className="payments-metric-scope">
          Los importes aprobados y reversados corresponden a los pagos cargados. La bandeja de
          revisión incluye todos los pendientes consultados.
        </p>
      ) : null}

      {activeTab === 'review' ? (
        <section
          aria-labelledby="payments-admin-tab-review"
          className="payments-admin-tab-content"
          id="payments-admin-panel-review"
          role="tabpanel"
        >
          {reviewFocus !== 'actions' ? (
            <section className="payments-insights-grid payments-insights-grid--review">
              <Surface className="payments-panel payments-review-panel" id="bandeja-revision">
                <div className="payments-section-heading">
                  <div>
                    <span className="payments-kicker">Validación</span>
                    <h2>
                      Bandeja de revisión
                      <InfoHint label="Más información sobre bandeja de revisión">
                        Abre cada pago, valida su comprobante y revisa la propuesta del residente
                        antes de aprobar.
                      </InfoHint>
                    </h2>
                  </div>
                  <Badge tone={reviewQueueForCurrency.length ? 'warning' : 'success'}>
                    {data.reviewQueueAvailable
                      ? `${reviewQueueForCurrency.length} pendientes`
                      : 'Acceso restringido'}
                  </Badge>
                </div>
                {data.reviewQueueAvailable && reviewQueueForCurrency.length ? (
                  <>
                    <div className="payments-review-tools">
                      <label htmlFor="payments-review-search">Buscar pago pendiente</label>
                      <input
                        className="input payments-search"
                        id="payments-review-search"
                        onChange={(event) => setReviewSearch(event.target.value)}
                        placeholder="Unidad, pagador o referencia"
                        type="search"
                        value={reviewSearch}
                      />
                    </div>
                    {pagedReviewQueue.length ? (
                      <div className="payments-review-list payments-review-list--priority">
                        {pagedReviewQueue.map((payment) => (
                          <button
                            key={payment.id}
                            onClick={() => void openPayment(payment)}
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
                              {formatDashboardAmount(
                                payment.original_amount,
                                payment.original_currency_code,
                              )}
                            </b>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="payments-review-no-results" role="status">
                        No hay pagos pendientes que coincidan con la búsqueda.
                      </p>
                    )}
                    <div className="payments-review-pagination">
                      <span>
                        {filteredReviewQueue.length
                          ? 'Mostrando ' +
                            (reviewPageStart + 1) +
                            '–' +
                            Math.min(
                              reviewPageStart + REVIEW_PAGE_SIZE,
                              filteredReviewQueue.length,
                            ) +
                            ' de ' +
                            filteredReviewQueue.length
                          : '0 coincidencias'}
                        {reviewSearch
                          ? ' · ' + reviewQueueForCurrency.length + ' pendientes en total'
                          : ''}
                      </span>
                      <div>
                        <Button
                          disabled={visibleReviewPage === 1}
                          onClick={() => setReviewPage((current) => Math.max(1, current - 1))}
                          size="sm"
                          variant="secondary"
                        >
                          Anterior
                        </Button>
                        <span>
                          Página {visibleReviewPage} de {reviewPageCount}
                        </span>
                        <Button
                          disabled={visibleReviewPage >= reviewPageCount}
                          onClick={() =>
                            setReviewPage((current) => Math.min(reviewPageCount, current + 1))
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  </>
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
            </section>
          ) : null}

          {reviewFocus !== 'pending' &&
          (actionRequiredPayments.length > 0 || reviewFocus === 'actions') ? (
            <Surface className="payments-panel payments-action-panel">
              <div className="payments-section-heading">
                <div>
                  <span className="payments-kicker">Acciones pendientes</span>
                  <h2>Mis registros por completar</h2>
                  <p>
                    Aquí aparecen únicamente tus propias capturas sin enviar o devueltas para
                    corregir. Los borradores privados de los residentes no forman parte de la
                    bandeja de administración.
                  </p>
                </div>
                <Badge tone="warning">{actionRequiredPayments.length} visibles</Badge>
              </div>
              {actionRequiredPayments.length ? (
                <div className="payments-review-list">
                  {actionRequiredPayments.map((payment) => (
                    <button
                      key={payment.id}
                      onClick={() => setDrawer({ type: 'edit', payment })}
                      type="button"
                    >
                      <span>
                        <ReportsIcon size={18} />
                      </span>
                      <div>
                        <strong>
                          {unitCodes.get(payment.unit_id) ?? 'Unidad'} · {payment.payer_name}
                        </strong>
                        <small>
                          {formatDashboardAmount(
                            payment.original_amount,
                            payment.original_currency_code,
                          )}{' '}
                          · {methodNames.get(payment.payment_method_id) ?? 'Método pendiente'} ·{' '}
                          {payment.status === 'draft'
                            ? 'Tu borrador sin enviar'
                            : payment.correction_reason
                              ? `Corrección: ${payment.correction_reason}`
                              : 'Corrección solicitada'}
                        </small>
                      </div>
                      <b>{payment.status === 'draft' ? 'Completar' : 'Corregir'}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  description="No tienes capturas propias pendientes de completar o corregir."
                  icon={<CheckCircleIcon size={25} />}
                  title="Todo al día"
                />
              )}
            </Surface>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'movements' ? (
        <section
          aria-labelledby="payments-admin-tab-movements"
          className="payments-admin-tab-content"
          id="payments-admin-panel-movements"
          role="tabpanel"
        >
          <Surface className="payments-list-panel">
            <div className="payments-section-heading payments-section-heading--list">
              <div>
                <span className="payments-kicker">Historial</span>
                <h2>
                  Movimientos registrados
                  <InfoHint label="Más información sobre movimientos registrados">
                    Busca por unidad, pagador, referencia o método.
                  </InfoHint>
                </h2>
              </div>
              <span className="payments-result-count">
                {visiblePayments.length} visibles · {data.payments.length} de{' '}
                {data.paymentsPage.total} cargados
              </span>
            </div>
            <div className="payments-quick-filters" aria-label="Accesos rápidos de estado">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'pending', label: 'Por revisar' },
                  { id: 'approved', label: 'Aprobados' },
                  { id: 'attention', label: 'Requieren acción' },
                  { id: 'reversed', label: 'Reversados' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  aria-pressed={quickStatus === id}
                  className="payments-quick-filters__item"
                  data-active={quickStatus === id || undefined}
                  key={id}
                  onClick={() => {
                    setQuickStatus(id);
                    setFilters((current) => ({ ...current, status: '' }));
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
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
                        <th>Unidad, pagador y registro</th>
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
                              Pagador: {payment.payer_name}
                              {payment.reference ? ` · ${payment.reference}` : ''}
                            </span>
                            <span>
                              Registrado por:{' '}
                              {paymentActorLabel(
                                payment.submitted_by_user_id,
                                payment,
                                session.user,
                              )}
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
                            <Button
                              onClick={() => void openPayment(payment)}
                              size="sm"
                              variant="ghost"
                            >
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
                    <button
                      key={payment.id}
                      onClick={() => void openPayment(payment)}
                      type="button"
                    >
                      <div>
                        <strong>
                          {unitCodes.get(payment.unit_id) ?? 'Sin unidad'} · Pagador:{' '}
                          {payment.payer_name}
                        </strong>
                        <Badge tone={paymentStatusTone(payment.status)}>
                          {paymentStatusLabels[payment.status] ?? payment.status}
                        </Badge>
                      </div>
                      <span>
                        {methodNames.get(payment.payment_method_id) ?? 'Método no disponible'} ·{' '}
                        {formatDashboardDate(payment.payment_date)}
                      </span>
                      <span>
                        Registrado por:{' '}
                        {paymentActorLabel(payment.submitted_by_user_id, payment, session.user)}
                      </span>
                      <b>
                        {formatDashboardAmount(
                          payment.original_amount,
                          payment.original_currency_code,
                        )}
                      </b>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                actionLabel="Limpiar filtros"
                description={
                  data.payments.length < data.paymentsPage.total
                    ? 'No hay coincidencias en el historial cargado. Carga más pagos para ampliar la búsqueda.'
                    : 'Prueba con otros términos, estados o métodos.'
                }
                icon={<PaymentsIcon size={26} />}
                onAction={() => {
                  setFilters(initialFilters);
                  setQuickStatus('all');
                }}
                title="No encontramos pagos"
              />
            )}

            <FinancialPagination
              itemLabel="pagos"
              loaded={data.payments.length}
              loading={loadingMorePayments}
              onLoadMore={() => void loadMorePayments()}
              total={data.paymentsPage.total}
            />
          </Surface>
        </section>
      ) : null}

      {activeTab === 'methods' ? (
        <section
          aria-labelledby="payments-admin-tab-methods"
          className="payments-admin-tab-content"
          id="payments-admin-panel-methods"
          role="tabpanel"
        >
          <PaymentMethodsView
            condominiumId={condominiumId}
            methods={data.methods}
            onChanged={onChanged}
            session={session}
          />
        </section>
      ) : null}

      {drawer?.type === 'create' || drawer?.type === 'edit' ? (
        <ResidentPaymentWizard
          condominiumId={condominiumId}
          concepts={data.concepts}
          context="administrator"
          methods={data.methods}
          onClose={() => setDrawer(null)}
          onComplete={onChanged}
          onDraftCreated={() => load(true)}
          {...(drawer.type === 'edit' ? { payment: drawer.payment } : {})}
          receivables={data.receivables}
          session={session}
          units={captureUnitOptions}
        />
      ) : null}

      <PaymentsDrawerHost
        condominiumId={condominiumId}
        drawer={drawer?.type === 'create' || drawer?.type === 'edit' ? null : drawer}
        methods={data.methods}
        onChanged={onChanged}
        onClose={() => setDrawer(null)}
        receivables={data.receivables}
        session={session}
        units={data.units}
        buildingNameById={buildingNameById}
      />
    </div>
  );
}
