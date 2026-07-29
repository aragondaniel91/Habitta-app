from pathlib import Path

path = Path('apps/web/src/pages/AdministrativeDashboard.tsx')
value = path.read_text()

import_anchor = "import type { AppRoute } from '../navigation';\n"
import_line = "import { buildDashboardSourceWarning, settleDashboardSource } from '../lib/dashboard-sources';\n"
if import_line not in value:
    value = value.replace(import_anchor, import_anchor + import_line)

start = value.index('  const load = useCallback(async () => {')
end_marker = '  }, [condominiumId, session]);'
end = value.index(end_marker, start) + len(end_marker)

replacement = '''  const load = useCallback(async () => {
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
        buildingsResult,
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
          'torres',
          apiRequest<DashboardBuilding[]>(
            `/v1/condominiums/${condominiumId}/buildings`,
            session,
          ),
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
          apiRequest<DashboardPayment[]>(
            `/v1/condominiums/${condominiumId}/payments`,
            session,
          ),
          [],
        ),
        settleDashboardSource(
          'bandeja de revisión',
          reviewQueueRequest,
          { items: [], available: false },
        ),
      ]);

      setData({
        units: unitsResult.value,
        buildings: buildingsResult.value,
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
          buildingsResult,
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
  }, [condominiumId, session]);'''

path.write_text(value[:start] + replacement + value[end:])
