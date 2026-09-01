import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, Skeleton, Surface } from '../components/ui';
import { PaymentsIcon } from '../components/icons';
import { PaymentCaptureDrawer } from '../features/payments/components/PaymentCaptureDrawer';
import { paymentApi } from '../features/payments/api';
import type {
  Payment,
  PaymentMethod,
  PaymentReceipt,
  Receivable,
} from '../features/payments/types';
import { apiRequest } from '../lib/api';
import { collectAllPages, financialPagePath, mergePageItems, pageInfo } from '../lib/pagination';
import type { PageInfo, PaginatedResponse } from '../lib/pagination';
import { PaymentsDrawerHost, type PaymentsDrawerMode } from './PaymentsDrawers';
import { ResidentPaymentsView } from './ResidentPaymentsView';
import '../payments.css';

type Unit = { id: string; code: string; building_id: string | null; status?: string };
type Building = { id: string; name: string };

type ResidentPaymentsData = {
  units: Unit[];
  buildings: Building[];
  methods: PaymentMethod[];
  payments: Payment[];
  paymentsPage: PageInfo;
  receivables: Receivable[];
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const PAYMENTS_PAGE_SIZE = 50;
const REFERENCE_PAGE_SIZE = 100;

function ResidentPaymentsLoading() {
  return (
    <div aria-label="Cargando mis pagos" className="resident-payments">
      <PageHeader eyebrow="Mi hogar" title="Mis pagos" />
      <Skeleton className="skeleton--card" />
      <div className="resident-payments__hero-grid">
        <Skeleton className="skeleton--card" />
        <Skeleton className="skeleton--card" />
      </div>
    </div>
  );
}

export function ResidentPaymentsPage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<ResidentPaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMorePayments, setLoadingMorePayments] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [drawer, setDrawer] = useState<PaymentsDrawerMode>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      try {
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

        const [units, buildings, methods, paymentsPage, receivables] = await Promise.all([
          apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
          methodsPromise,
          apiRequest<PaginatedResponse<Payment>>(
            financialPagePath(`/v1/condominiums/${condominiumId}/payments`, 1, PAYMENTS_PAGE_SIZE),
            session,
          ),
          receivablesPromise,
        ]);

        setData({
          units,
          buildings,
          methods,
          payments: paymentsPage.items,
          paymentsPage: pageInfo(paymentsPage),
          receivables,
        });
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : 'No se pudieron cargar tus pagos.',
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
    setMessage('');
    setSelectedCurrency('');
    setLoadingMorePayments(false);
  }, [condominiumId]);

  const currencies = useMemo(
    () =>
      data
        ? [
            ...new Set([
              ...data.methods.map((method) => method.currency_code),
              ...data.payments.map((payment) => payment.original_currency_code),
              ...data.receivables.map((receivable) => receivable.currency_code),
            ]),
          ]
            .filter(Boolean)
            .sort()
        : [],
    [data],
  );

  useEffect(() => {
    const nextCurrency = currencies[0] ?? '';
    if (!selectedCurrency || !currencies.includes(selectedCurrency)) {
      setSelectedCurrency(nextCurrency);
    }
  }, [currencies, selectedCurrency]);

  const buildingNameById = useMemo(
    () =>
      Object.fromEntries((data?.buildings ?? []).map((building) => [building.id, building.name])),
    [data?.buildings],
  );

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
    if (!['approved', 'reversed'].includes(payment.status)) return;

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
  };

  if (loading && !data) return <ResidentPaymentsLoading />;

  if (error && !data) {
    return (
      <Surface className="payments-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error}
          icon={<PaymentsIcon size={28} />}
          onAction={() => void load()}
          title="No pudimos cargar tus pagos"
        />
      </Surface>
    );
  }

  if (!data) return null;

  const capturePayment =
    drawer?.type === 'edit' && ['draft', 'correction_requested'].includes(drawer.payment.status)
      ? drawer.payment
      : undefined;
  const captureOpen = drawer?.type === 'create' || Boolean(capturePayment);

  return (
    <>
      <ResidentPaymentsView
        condominiumName={condominiumName}
        data={data}
        error={error}
        loadingMorePayments={loadingMorePayments}
        message={message}
        onCurrencyChange={setSelectedCurrency}
        onLoadMore={() => void loadMorePayments()}
        onOpenPayment={(payment) => void openPayment(payment)}
        onRegisterPayment={() => {
          setMessage('');
          setDrawer({ type: 'create' });
        }}
        selectedCurrency={selectedCurrency}
      />

      {captureOpen ? (
        <PaymentCaptureDrawer
          buildingNameById={buildingNameById}
          condominiumId={condominiumId}
          methods={data.methods}
          onClose={() => setDrawer(null)}
          onComplete={onChanged}
          onDraftCreated={() => load(true)}
          {...(capturePayment ? { payment: capturePayment } : {})}
          session={session}
          submitOnComplete
          units={data.units}
        />
      ) : null}

      <PaymentsDrawerHost
        buildingNameById={buildingNameById}
        condominiumId={condominiumId}
        drawer={drawer?.type === 'receipt' ? drawer : null}
        methods={data.methods}
        onChanged={onChanged}
        onClose={() => setDrawer(null)}
        receivables={data.receivables}
        session={session}
        units={data.units}
      />
    </>
  );
}
