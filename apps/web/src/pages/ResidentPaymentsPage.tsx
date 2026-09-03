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
import {
  financialUnitOptions,
  payableUnitOptions,
  residentUnitLabels,
  rowsForSelection,
} from '../lib/resident-units';
import type { ResidentFinancialUnit } from '../lib/resident-units';
import type { PageInfo, PaginatedResponse } from '../lib/pagination';
import { PaymentsDrawerHost, type PaymentsDrawerMode } from './PaymentsDrawers';
import { ResidentPaymentsView } from './ResidentPaymentsView';
import '../payments.css';

type Unit = { id: string; code: string; building_id: string | null; status?: string };
type Building = { id: string; name: string };

type ResidentPaymentsData = {
  units: Unit[];
  buildings: Building[];
  financialUnits: ResidentFinancialUnit[];
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
      <div className="resident-payments__content-grid">
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
  // '' means every unit the resident can see. Narrowing happens on the server, so the counts and
  // the "load more" cursor below describe the same list the resident is looking at.
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [drawer, setDrawer] = useState<PaymentsDrawerMode>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      // Appended, never substituted: the endpoint keeps its own condominium scope and this only
      // narrows within it.
      const unitQuery = selectedUnitId ? `&unitId=${selectedUnitId}` : '';
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
            `${financialPagePath(
              `/v1/condominiums/${condominiumId}/receivables`,
              page,
              REFERENCE_PAGE_SIZE,
            )}${unitQuery}`,
            session,
          ),
        ).catch(() => [] as Receivable[]);

        const [units, buildings, financialUnits, methods, paymentsPage, receivables] =
          await Promise.all([
            apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
            apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
            // Which units exist financially, and which of them the database will actually accept a
            // payment for. The two are different questions and the page must not conflate them.
            apiRequest<ResidentFinancialUnit[]>(
              `/v1/condominiums/${condominiumId}/resident-financial-units`,
              session,
            ).catch(() => [] as ResidentFinancialUnit[]),
            methodsPromise,
            apiRequest<PaginatedResponse<Payment>>(
              `${financialPagePath(
                `/v1/condominiums/${condominiumId}/payments`,
                1,
                PAYMENTS_PAGE_SIZE,
              )}${unitQuery}`,
              session,
            ),
            receivablesPromise,
          ]);

        setData({
          units,
          buildings,
          financialUnits,
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
    [condominiumId, selectedUnitId, session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDrawer(null);
    setMessage('');
    setSelectedCurrency('');
    setSelectedUnitId('');
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
  const unitLabels = useMemo(
    () => residentUnitLabels(data?.units ?? [], data?.buildings ?? []),
    [data?.units, data?.buildings],
  );
  const financialUnits = useMemo(
    () => financialUnitOptions(data?.financialUnits ?? [], unitLabels),
    [data?.financialUnits, unitLabels],
  );
  // `can_submit_payment` as the database answered it, per unit. Not every visible unit is payable
  // -- a tenant sees the account of the unit they live in and may still not be the one who pays --
  // so using the visible list here would offer destinations the server is going to refuse.
  const payableUnits = useMemo(
    () => payableUnitOptions(data?.financialUnits ?? [], unitLabels),
    [data?.financialUnits, unitLabels],
  );

  // Changing unit changes the list, so the cursor cannot survive it: page 2 of one unit is not
  // page 2 of another, and keeping it would append somebody else's rows to the history.
  const selectUnit = useCallback((unitId: string) => {
    setSelectedUnitId(unitId);
    setMessage('');
    setLoadingMorePayments(false);
    setData((current) => (current ? { ...current, payments: [], receivables: [] } : current));
  }, []);

  const loadMorePayments = useCallback(async () => {
    if (!data?.paymentsPage.hasNextPage || loadingMorePayments) return;
    setLoadingMorePayments(true);
    setError('');
    try {
      const next = await apiRequest<PaginatedResponse<Payment>>(
        `${financialPagePath(
          `/v1/condominiums/${condominiumId}/payments`,
          data.paymentsPage.page + 1,
          data.paymentsPage.pageSize,
        )}${selectedUnitId ? `&unitId=${selectedUnitId}` : ''}`,
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
  }, [condominiumId, data?.paymentsPage, loadingMorePayments, selectedUnitId, session]);

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
  // A resident with nothing to pay for cannot open the create flow at all. The view hides the
  // button too, but the guard belongs here: a drawer that opens onto no valid destination can only
  // end in a refusal.
  const captureOpen =
    (drawer?.type === 'create' && payableUnits.length > 0) || Boolean(capturePayment);

  return (
    <>
      <ResidentPaymentsView
        canRegisterPayment={payableUnits.length > 0}
        condominiumName={condominiumName}
        data={data}
        error={error}
        financialRows={rowsForSelection(data.financialUnits, selectedUnitId)}
        loadingMorePayments={loadingMorePayments}
        message={message}
        onCurrencyChange={setSelectedCurrency}
        onUnitChange={selectUnit}
        onLoadMore={() => void loadMorePayments()}
        onOpenPayment={(payment) => void openPayment(payment)}
        onRegisterPayment={() => {
          setMessage('');
          setDrawer({ type: 'create' });
        }}
        selectedCurrency={selectedCurrency}
        selectedUnitId={selectedUnitId}
        unitLabels={unitLabels}
        unitOptions={financialUnits}
      />

      {captureOpen ? (
        <PaymentCaptureDrawer
          condominiumId={condominiumId}
          methods={data.methods}
          onClose={() => setDrawer(null)}
          onComplete={onChanged}
          onDraftCreated={() => load(true)}
          {...(capturePayment ? { payment: capturePayment } : {})}
          session={session}
          submitOnComplete
          units={payableUnits}
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
