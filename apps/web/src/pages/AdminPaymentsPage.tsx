import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogBody } from '../components/Dialog';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, FeesIcon, PaymentsIcon, ReportsIcon } from '../components/icons';
import { FinancialPagination } from '../components/FinancialPagination';
import { PaymentSortHeader } from '../components/PaymentSortHeader';
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
import {
  defaultPaymentTableSort,
  filterPaymentTableColumns,
  nextPaymentTableSort,
  paymentTableSortFromValue,
  paymentTableSortValue,
  sortPaymentTableRows,
  type PaymentTableSort,
  type PaymentTableSortField,
} from '../lib/payment-table-view';
import type { PageInfo, PaginatedResponse } from '../lib/pagination';
import {
  filterPayments,
  getPaymentCurrencies,
  paymentStatusLabels,
  paymentStatusTone,
  sortPayments,
} from '../lib/payments';
import type { PaymentFilters } from '../lib/payments';
import { PaymentMethodsView, PaymentsDrawerHost, type PaymentsDrawerMode } from './PaymentsDrawers';
import '../payments.css';

type Unit = { id: string; code: string; building_id: string | null; status?: string };
type Building = { id: string; name: string };

type PaymentMetricRow = {
  currency_code: string;
  approved_amount: string;
  reversed_amount: string;
  pending_review_count: number;
  own_attention_count: number;
};

type PaymentsData = {
  paymentMetrics: PaymentMetricRow[] | null;
  units: Unit[];
  buildings: Building[];
  methods: PaymentMethod[];
  concepts: ChargeConcept[];
  payments: Payment[];
  paymentsPage: PageInfo;
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
const MOVEMENTS_VIEW_PAGE_SIZE = 10;

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

type ScopedReviewProps = {
  condominiumId: string;
  drawer: Extract<Exclude<PaymentsDrawerMode, null>, { type: 'review' | 'details' }>;
  loadReceivablesForUnit: (unitId: string) => Promise<Receivable[]>;
  methods: PaymentMethod[];
  onChanged: (message: string) => Promise<void>;
  onClose: () => void;
  session: Session;
  units: Unit[];
  buildingNameById: Record<string, string>;
};

function ScopedReviewDrawer({ drawer, loadReceivablesForUnit, ...props }: ScopedReviewProps) {
  const [snapshot, setSnapshot] = useState<{
    items: Receivable[];
    loading: boolean;
    error: string;
  }>({ items: [], loading: true, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setSnapshot({ items: [], loading: true, error: '' });
    void loadReceivablesForUnit(drawer.payment.unit_id)
      .then((items) => {
        if (active) setSnapshot({ items, loading: false, error: '' });
      })
      .catch((cause: unknown) => {
        if (active)
          setSnapshot({
            items: [],
            loading: false,
            error: cause instanceof Error ? cause.message : 'No se pudieron cargar las cuotas.',
          });
      });
    return () => {
      active = false;
    };
  }, [drawer.payment.unit_id, loadReceivablesForUnit, retry]);
  if (!snapshot.loading && !snapshot.error)
    return <PaymentsDrawerHost {...props} drawer={drawer} receivables={snapshot.items} />;
  return (
    <Dialog
      onClose={props.onClose}
      size="md"
      title={drawer.type === 'review' ? 'Revisar pago' : 'Detalle del pago'}
    >
      <DialogBody>
        {snapshot.error ? (
          <>
            <p role="alert">{snapshot.error}</p>
            <Button onClick={() => setRetry((value) => value + 1)} size="sm" variant="secondary">
              Reintentar carga de cuotas
            </Button>
          </>
        ) : (
          <p role="status">Consultando cuotas de esta unidad antes de abrir el pago…</p>
        )}
      </DialogBody>
    </Dialog>
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
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsUnitId, setMovementsUnitId] = useState('');
  const [movementsDateFrom, setMovementsDateFrom] = useState('');
  const [movementsDateTo, setMovementsDateTo] = useState('');
  const [movementsSort, setMovementsSort] = useState<PaymentTableSort>(defaultPaymentTableSort);
  const [reviewUnitId, setReviewUnitId] = useState('');
  const [reviewDateFrom, setReviewDateFrom] = useState('');
  const [reviewDateTo, setReviewDateTo] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [reviewSort, setReviewSort] = useState<PaymentTableSort>(defaultPaymentTableSort);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFocus, setReviewFocus] = useState<'all' | 'pending' | 'actions'>('all');
  const [drawer, setDrawer] = useState<PaymentsDrawerMode>(null);

  // The payments screen does not need every charge across the condominium.
  // Query just the selected unit and only while a capture/review modal is open.
  const loadReceivablesForUnit = useCallback(
    (unitId: string) =>
      collectAllPages((page) =>
        apiRequest<PaginatedResponse<Receivable>>(
          financialPagePath(
            `/v1/condominiums/${condominiumId}/receivables?unitId=${encodeURIComponent(unitId)}`,
            page,
            REFERENCE_PAGE_SIZE,
          ),
          session,
        ),
      ),
    [condominiumId, session],
  );

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
        const metricsPromise = apiRequest<PaymentMetricRow[]>(
          '/v1/condominiums/' + condominiumId + '/payments/summary',
          session,
        ).catch(() => null);
        const [
          units,
          buildings,
          methods,
          concepts,
          paymentsPage,
          reviewQueueResult,
          paymentMetrics,
        ] = await Promise.all([
          apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
          methodsPromise,
          conceptsPromise,
          apiRequest<PaginatedResponse<Payment>>(
            financialPagePath(`/v1/condominiums/${condominiumId}/payments`, 1, PAYMENTS_PAGE_SIZE),
            session,
          ),
          reviewQueuePromise,
          metricsPromise,
        ]);
        setData({
          paymentMetrics,
          units,
          buildings,
          methods,
          concepts,
          payments: paymentsPage.items,
          paymentsPage: pageInfo(paymentsPage),
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
    setMovementsPage(1);
    setMovementsUnitId('');
    setMovementsDateFrom('');
    setMovementsDateTo('');
    setMovementsSort(defaultPaymentTableSort);
    setReviewUnitId('');
    setReviewDateFrom('');
    setReviewDateTo('');
    setReviewStatus('');
    setReviewSort(defaultPaymentTableSort);
    setReviewSearch('');
    setReviewFocus('all');
    setMessage('');
    setLoadingMorePayments(false);
  }, [condominiumId]);

  const currencies = useMemo(
    () =>
      data
        ? [
            ...new Set([
              ...getPaymentCurrencies(data.payments, data.methods),
              ...(data.paymentMetrics ?? []).map((row) => row.currency_code),
            ]),
          ].sort()
        : [],
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
    const columnFiltered = filterPaymentTableColumns(
      matching.filter((payment) => {
        if (quickStatus === 'pending')
          return ['submitted', 'under_review'].includes(payment.status);
        if (quickStatus === 'approved') return payment.status === 'approved';
        if (quickStatus === 'reversed') return payment.status === 'reversed';
        if (quickStatus === 'attention')
          return ['draft', 'correction_requested'].includes(payment.status);
        return true;
      }),
      {
        unitId: movementsUnitId,
        dateFrom: movementsDateFrom,
        dateTo: movementsDateTo,
      },
    );
    return sortPaymentTableRows(columnFiltered, movementsSort, unitCodes, methodNames);
  }, [
    data,
    filters,
    quickStatus,
    selectedCurrency,
    unitCodes,
    methodNames,
    movementsUnitId,
    movementsDateFrom,
    movementsDateTo,
    movementsSort,
  ]);

  // The server history is fetched in bounded batches; render a smaller, navigable page.
  // Filters remain scoped to loaded records until additional history is requested.
  useEffect(() => {
    setMovementsPage(1);
  }, [
    condominiumId,
    selectedCurrency,
    filters,
    quickStatus,
    movementsUnitId,
    movementsDateFrom,
    movementsDateTo,
    movementsSort,
  ]);

  const movementsPageCount = Math.max(
    1,
    Math.ceil(visiblePayments.length / MOVEMENTS_VIEW_PAGE_SIZE),
  );
  const visibleMovementsPage = Math.min(movementsPage, movementsPageCount);
  const movementsPageStart = (visibleMovementsPage - 1) * MOVEMENTS_VIEW_PAGE_SIZE;
  const pagedMovements = visiblePayments.slice(
    movementsPageStart,
    movementsPageStart + MOVEMENTS_VIEW_PAGE_SIZE,
  );

  const reviewQueueForCurrency = useMemo(
    () =>
      (data?.reviewQueue ?? []).filter(
        (payment) => !selectedCurrency || payment.original_currency_code === selectedCurrency,
      ),
    [data?.reviewQueue, selectedCurrency],
  );

  const filteredReviewQueue = useMemo(() => {
    const term = reviewSearch.trim().toLocaleLowerCase('es');
    const matching = reviewQueueForCurrency.filter(
      (payment) =>
        !term ||
        [payment.payer_name, unitCodes.get(payment.unit_id), payment.reference].some((value) =>
          (value ?? '').toLocaleLowerCase('es').includes(term),
        ),
    );
    return sortPaymentTableRows(
      filterPaymentTableColumns(matching, {
        unitId: reviewUnitId,
        dateFrom: reviewDateFrom,
        dateTo: reviewDateTo,
        status: reviewStatus,
      }),
      reviewSort,
      unitCodes,
      methodNames,
    );
  }, [
    reviewQueueForCurrency,
    reviewSearch,
    reviewUnitId,
    reviewDateFrom,
    reviewDateTo,
    reviewStatus,
    reviewSort,
    unitCodes,
    methodNames,
  ]);

  useEffect(() => {
    setReviewPage(1);
  }, [
    condominiumId,
    selectedCurrency,
    reviewSearch,
    reviewQueueForCurrency.length,
    reviewUnitId,
    reviewDateFrom,
    reviewDateTo,
    reviewStatus,
    reviewSort,
  ]);

  const reviewPageCount = Math.max(1, Math.ceil(filteredReviewQueue.length / REVIEW_PAGE_SIZE));
  const visibleReviewPage = Math.min(reviewPage, reviewPageCount);
  const reviewPageStart = (visibleReviewPage - 1) * REVIEW_PAGE_SIZE;
  const pagedReviewQueue = filteredReviewQueue.slice(
    reviewPageStart,
    reviewPageStart + REVIEW_PAGE_SIZE,
  );

  const changeMovementSort = (field: PaymentTableSortField) =>
    setMovementsSort((current) => nextPaymentTableSort(current, field));
  const changeReviewSort = (field: PaymentTableSortField) =>
    setReviewSort((current) => nextPaymentTableSort(current, field));

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

  // A server-side aggregate under the caller's RLS, independent of the loaded page.
  const summary = data.paymentMetrics?.find((row) => row.currency_code === selectedCurrency);
  const metricsAvailable = data.paymentMetrics !== null;
  // Keep the reviewer indicator authoritative even if the loaded queue is incomplete.
  const pendingReviewCount = metricsAvailable ? (summary?.pending_review_count ?? 0) : null;
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
                  detail: data.reviewQueueAvailable ? pendingReviewCount : null,
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
          Las búsquedas y filtros de movimientos usan {data.payments.length} de{' '}
          {data.paymentsPage.total} pagos cargados. Los indicadores superiores se calculan con todo
          el historial autorizado en el servidor.
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
          value={
            metricsAvailable
              ? formatDashboardAmount(summary?.approved_amount ?? '0', selectedCurrencyLabel)
              : '—'
          }
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
          value={
            !data.reviewQueueAvailable
              ? 'Restringido'
              : pendingReviewCount === null
                ? '—'
                : String(pendingReviewCount)
          }
        />
        <MetricCard
          detail="Solo tus capturas sin enviar o devueltas para corregir."
          icon={<ReportsIcon size={20} />}
          label="Mis registros por completar"
          onClick={() => showMetricView('attention')}
          selected={activeTab === 'review' && reviewFocus === 'actions'}
          tone="navy"
          value={metricsAvailable ? String(summary?.own_attention_count ?? 0) : '—'}
        />
        <MetricCard
          detail="Consulta movimientos reversados con trazabilidad."
          icon={<FeesIcon size={20} />}
          label="Pagos reversados"
          onClick={() => showMetricView('reversed')}
          selected={activeTab === 'movements' && quickStatus === 'reversed'}
          tone="red"
          value={
            metricsAvailable
              ? formatDashboardAmount(summary?.reversed_amount ?? '0', selectedCurrencyLabel)
              : '—'
          }
        />
      </section>

      <p className="payments-metric-scope" role="status">
        {metricsAvailable
          ? 'Totales del historial autorizado para tu rol, separados por moneda y calculados en el servidor. El listado y las búsquedas de movimientos siguen paginados.'
          : 'Indicadores completos no disponibles. No se muestran importes parciales como totales; actualiza para reintentar.'}
      </p>

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
                  <Badge
                    tone={
                      pendingReviewCount === null
                        ? 'neutral'
                        : pendingReviewCount > 0
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {data.reviewQueueAvailable
                      ? pendingReviewCount === null
                        ? 'Total no disponible'
                        : `${pendingReviewCount} pendientes`
                      : 'Acceso restringido'}
                  </Badge>
                </div>
                {data.reviewQueueAvailable && reviewQueueForCurrency.length ? (
                  <>
                    <div className="payments-column-filters" aria-label="Filtros de revisión">
                      <label className="payments-column-filter payments-column-filter--search">
                        Buscar pago pendiente
                        <input
                          className="input"
                          onChange={(event) => setReviewSearch(event.target.value)}
                          placeholder="Pagador o referencia"
                          type="search"
                          value={reviewSearch}
                        />
                      </label>
                      <label className="payments-column-filter">
                        Unidad
                        <Select
                          onChange={(event) => setReviewUnitId(event.target.value)}
                          value={reviewUnitId}
                        >
                          <option value="">Todas las unidades</option>
                          {data.units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.code}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="payments-column-filter">
                        Desde
                        <input
                          className="input"
                          onChange={(event) => setReviewDateFrom(event.target.value)}
                          type="date"
                          value={reviewDateFrom}
                        />
                      </label>
                      <label className="payments-column-filter">
                        Hasta
                        <input
                          className="input"
                          min={reviewDateFrom || undefined}
                          onChange={(event) => setReviewDateTo(event.target.value)}
                          type="date"
                          value={reviewDateTo}
                        />
                      </label>
                      <label className="payments-column-filter">
                        Estado
                        <Select
                          onChange={(event) => setReviewStatus(event.target.value)}
                          value={reviewStatus}
                        >
                          <option value="">Todos</option>
                          <option value="submitted">Enviado</option>
                          <option value="under_review">En revisión</option>
                        </Select>
                      </label>
                      <label className="payments-column-filter payments-column-filter--order">
                        Orden
                        <Select
                          aria-label="Ordenar revisión"
                          onChange={(event) =>
                            setReviewSort(paymentTableSortFromValue(event.target.value))
                          }
                          value={paymentTableSortValue(reviewSort)}
                        >
                          <option value="date-desc">Más recientes</option>
                          <option value="date-asc">Más antiguos</option>
                          <option value="unit-asc">Unidad A–Z</option>
                          <option value="unit-desc">Unidad Z–A</option>
                          <option value="status-asc">Estado A–Z</option>
                          <option value="status-desc">Estado Z–A</option>
                          <option value="amount-desc">Mayor monto</option>
                          <option value="amount-asc">Menor monto</option>
                          <option value="payer-asc">Pagador A–Z</option>
                          <option value="payer-desc">Pagador Z–A</option>
                        </Select>
                      </label>
                      <Button
                        className="payments-column-filters__clear"
                        onClick={() => {
                          setReviewSearch('');
                          setReviewUnitId('');
                          setReviewDateFrom('');
                          setReviewDateTo('');
                          setReviewStatus('');
                          setReviewSort(defaultPaymentTableSort);
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Limpiar filtros
                      </Button>
                    </div>
                    {pagedReviewQueue.length ? (
                      <>
                        <div className="payments-table-wrap payments-review-table-wrap">
                          <table className="payments-table payments-review-table">
                            <thead>
                              <tr>
                                <PaymentSortHeader
                                  field="unit"
                                  label="Unidad"
                                  onSort={changeReviewSort}
                                  sort={reviewSort}
                                />
                                <PaymentSortHeader
                                  field="payer"
                                  label="Pagador"
                                  onSort={changeReviewSort}
                                  sort={reviewSort}
                                />
                                <PaymentSortHeader
                                  field="date"
                                  label="Fecha"
                                  onSort={changeReviewSort}
                                  sort={reviewSort}
                                />
                                <PaymentSortHeader
                                  field="status"
                                  label="Estado"
                                  onSort={changeReviewSort}
                                  sort={reviewSort}
                                />
                                <PaymentSortHeader
                                  field="amount"
                                  label="Monto"
                                  onSort={changeReviewSort}
                                  sort={reviewSort}
                                />
                                <th scope="col">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pagedReviewQueue.map((payment) => (
                                <tr key={payment.id}>
                                  <td>
                                    <strong>
                                      {unitCodes.get(payment.unit_id) ?? 'Sin unidad'}
                                    </strong>
                                  </td>
                                  <td>
                                    <strong>{payment.payer_name}</strong>
                                    {payment.reference ? <small>{payment.reference}</small> : null}
                                  </td>
                                  <td>{formatDashboardDate(payment.payment_date)}</td>
                                  <td>
                                    <Badge tone={paymentStatusTone(payment.status)}>
                                      {paymentStatusLabels[payment.status] ?? payment.status}
                                    </Badge>
                                  </td>
                                  <td>
                                    <strong>
                                      {formatDashboardAmount(
                                        payment.original_amount,
                                        payment.original_currency_code,
                                      )}
                                    </strong>
                                  </td>
                                  <td>
                                    <Button
                                      onClick={() => void openPayment(payment)}
                                      size="sm"
                                      variant="ghost"
                                    >
                                      Revisar
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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
                                  {unitCodes.get(payment.unit_id) ?? 'Unidad'} ·{' '}
                                  {payment.payer_name}
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
                      </>
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
                          ? ' · ' +
                            (pendingReviewCount === null
                              ? 'Total no disponible'
                              : pendingReviewCount + ' pendientes en total')
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
                {visiblePayments.length} coinciden · {data.payments.length} de{' '}
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
            <div className="payments-column-filters" aria-label="Filtros de movimientos">
              <label className="payments-column-filter payments-column-filter--search">
                Buscar
                <input
                  className="input payments-search"
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, query: event.target.value }))
                  }
                  placeholder="Pagador o referencia"
                  type="search"
                  value={filters.query}
                />
              </label>
              <label className="payments-column-filter">
                Unidad
                <Select
                  onChange={(event) => setMovementsUnitId(event.target.value)}
                  value={movementsUnitId}
                >
                  <option value="">Todas las unidades</option>
                  {data.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="payments-column-filter">
                Desde
                <input
                  className="input"
                  onChange={(event) => setMovementsDateFrom(event.target.value)}
                  type="date"
                  value={movementsDateFrom}
                />
              </label>
              <label className="payments-column-filter">
                Hasta
                <input
                  className="input"
                  min={movementsDateFrom || undefined}
                  onChange={(event) => setMovementsDateTo(event.target.value)}
                  type="date"
                  value={movementsDateTo}
                />
              </label>
              <label className="payments-column-filter">
                Estado
                <Select
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, status: event.target.value }));
                    setQuickStatus('all');
                  }}
                  value={filters.status}
                >
                  <option value="">Todos los estados</option>
                  {Object.entries(paymentStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="payments-column-filter">
                Método
                <Select
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, methodId: event.target.value }))
                  }
                  value={filters.methodId}
                >
                  <option value="">Todos los métodos</option>
                  {data.methods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.display_name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="payments-column-filter payments-column-filter--order">
                Orden
                <Select
                  aria-label="Ordenar movimientos"
                  onChange={(event) =>
                    setMovementsSort(paymentTableSortFromValue(event.target.value))
                  }
                  value={paymentTableSortValue(movementsSort)}
                >
                  <option value="date-desc">Más recientes</option>
                  <option value="date-asc">Más antiguos</option>
                  <option value="unit-asc">Unidad A–Z</option>
                  <option value="unit-desc">Unidad Z–A</option>
                  <option value="status-asc">Estado A–Z</option>
                  <option value="status-desc">Estado Z–A</option>
                  <option value="amount-desc">Mayor monto</option>
                  <option value="amount-asc">Menor monto</option>
                  <option value="payer-asc">Pagador A–Z</option>
                  <option value="payer-desc">Pagador Z–A</option>
                  <option value="method-asc">Método A–Z</option>
                  <option value="method-desc">Método Z–A</option>
                </Select>
              </label>
              <Button
                className="payments-column-filters__clear"
                onClick={() => {
                  setFilters(initialFilters);
                  setQuickStatus('all');
                  setMovementsUnitId('');
                  setMovementsDateFrom('');
                  setMovementsDateTo('');
                  setMovementsSort(defaultPaymentTableSort);
                }}
                size="sm"
                variant="ghost"
              >
                Limpiar filtros
              </Button>
            </div>

            {visiblePayments.length ? (
              <>
                <div className="payments-table-wrap">
                  <table className="payments-table">
                    <thead>
                      <tr>
                        <PaymentSortHeader
                          field="unit"
                          label="Unidad / pagador"
                          onSort={changeMovementSort}
                          sort={movementsSort}
                        />
                        <PaymentSortHeader
                          field="method"
                          label="Método"
                          onSort={changeMovementSort}
                          sort={movementsSort}
                        />
                        <PaymentSortHeader
                          field="date"
                          label="Fecha"
                          onSort={changeMovementSort}
                          sort={movementsSort}
                        />
                        <PaymentSortHeader
                          field="amount"
                          label="Monto"
                          onSort={changeMovementSort}
                          sort={movementsSort}
                        />
                        <PaymentSortHeader
                          field="status"
                          label="Estado"
                          onSort={changeMovementSort}
                          sort={movementsSort}
                        />
                        <th scope="col">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedMovements.map((payment) => (
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
                  {pagedMovements.map((payment) => (
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

            {visiblePayments.length > 0 ? (
              <nav aria-label="Paginación de movimientos" className="payments-movements-pagination">
                <span>
                  Mostrando {movementsPageStart + 1}–
                  {Math.min(movementsPageStart + MOVEMENTS_VIEW_PAGE_SIZE, visiblePayments.length)}{' '}
                  de {visiblePayments.length} coincidencias cargadas
                </span>
                <div>
                  <Button
                    disabled={visibleMovementsPage === 1}
                    onClick={() => setMovementsPage((current) => Math.max(1, current - 1))}
                    size="sm"
                    variant="secondary"
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {visibleMovementsPage} de {movementsPageCount}
                  </span>
                  <Button
                    disabled={visibleMovementsPage >= movementsPageCount}
                    onClick={() =>
                      setMovementsPage((current) => Math.min(movementsPageCount, current + 1))
                    }
                    size="sm"
                    variant="secondary"
                  >
                    Siguiente
                  </Button>
                </div>
              </nav>
            ) : null}

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
          loadReceivablesForUnit={loadReceivablesForUnit}
          receivables={[]}
          session={session}
          units={captureUnitOptions}
        />
      ) : null}

      {drawer?.type === 'review' || drawer?.type === 'details' ? (
        <ScopedReviewDrawer
          key={`${condominiumId}:${drawer.payment.id}:${drawer.type}`}
          condominiumId={condominiumId}
          drawer={drawer}
          loadReceivablesForUnit={loadReceivablesForUnit}
          methods={data.methods}
          onChanged={onChanged}
          onClose={() => setDrawer(null)}
          session={session}
          units={data.units}
          buildingNameById={buildingNameById}
        />
      ) : (
        <PaymentsDrawerHost
          condominiumId={condominiumId}
          drawer={drawer?.type === 'create' || drawer?.type === 'edit' ? null : drawer}
          methods={data.methods}
          onChanged={onChanged}
          onClose={() => setDrawer(null)}
          receivables={[]}
          session={session}
          units={data.units}
          buildingNameById={buildingNameById}
        />
      )}
    </div>
  );
}
