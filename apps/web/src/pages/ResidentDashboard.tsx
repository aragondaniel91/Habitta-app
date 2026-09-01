import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AnnouncementsIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  FeesIcon,
  PaymentsIcon,
  RequestsIcon,
  VoteIcon,
} from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, InfoHint, Skeleton, Surface } from '../components/ui';
import { apiRequest } from '../lib/api';
import {
  formatDashboardAmount,
  formatDashboardDate,
  sortReceivableSummaries,
} from '../lib/dashboard';
import type { DashboardPayment, DashboardReceivable, ReceivableSummary } from '../lib/dashboard';
import type { AnnouncementRecord } from '../lib/announcements';
import { formatAnnouncementDate, priorityLabels } from '../lib/announcements';
import type { ServiceRequestRecord } from '../lib/service-requests';
import {
  formatRequestDate,
  isOpenRequest,
  statusLabels as requestStatusLabels,
} from '../lib/service-requests';
import type { GovernanceProposal } from '../lib/governance';
import { formatGovernanceDate } from '../lib/governance';
import {
  canAccessResidentOperations,
  canAccessResidentPayments,
  isTenantOnly,
  useCondominiumRoles,
} from '../lib/roles';
import { unitReferenceLabel } from '../lib/unit-domain';
import { APP_ROUTES } from '../navigation';
import type { AppRoute } from '../navigation';
import '../resident-dashboard.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
  onNavigate: (route: AppRoute) => void;
};

/** Only what the header needs. The units endpoint returns more; this states what is read. */
type ResidentUnit = {
  id: string;
  code: string;
  building_name?: string | null;
};

type ResidentDashboardData = {
  units: ResidentUnit[];
  summaries: ReceivableSummary[];
  receivables: DashboardReceivable[];
  payments: DashboardPayment[];
  announcements: AnnouncementRecord[];
  requests: ServiceRequestRecord[];
  proposals: GovernanceProposal[];
};

const routeByKey = (key: AppRoute['key']) => APP_ROUTES.find((route) => route.key === key);

const paymentStatusLabels: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Enviado',
  under_review: 'En revisión',
  correction_requested: 'Requiere corrección',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  reversed: 'Reversado',
};

const paymentTone = (status: string) => {
  if (status === 'approved') return 'success' as const;
  if (['submitted', 'under_review'].includes(status)) return 'info' as const;
  if (status === 'correction_requested') return 'warning' as const;
  return 'neutral' as const;
};

const activeAnnouncement = (announcement: AnnouncementRecord, now = Date.now()) => {
  if (announcement.status !== 'published') return false;
  if (announcement.expires_at && Date.parse(announcement.expires_at) <= now) return false;
  return announcement.priority === 'important' || announcement.priority === 'urgent';
};

const dueTime = (receivable: DashboardReceivable) => {
  if (!receivable.due_date) return Number.MAX_SAFE_INTEGER;
  const value = Date.parse(receivable.due_date);
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
};

function ResidentDashboardLoading() {
  return (
    <div aria-label="Cargando inicio del residente" className="resident-dashboard">
      <PageHeader eyebrow="Mi hogar" title="Inicio" />
      <div className="resident-dashboard__hero-grid">
        <Skeleton className="resident-dashboard__hero-skeleton" />
        <Skeleton className="resident-dashboard__hero-skeleton" />
      </div>
      <div className="resident-dashboard__content-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="resident-dashboard__panel-skeleton" key={index} />
        ))}
      </div>
    </div>
  );
}

export function ResidentDashboard({ condominiumId, condominiumName, session, onNavigate }: Props) {
  const roles = useCondominiumRoles();
  const tenantOnly = isTenantOnly(roles);
  // Family members and authorized occupants have no financial standing in the database, so the
  // dashboard must not fetch or show balances for them either. Asking would return nothing; the
  // point is not to offer an answer the backend would refuse.
  const showsFinancialContext = canAccessResidentPayments(roles);
  // Requests and governance are denied to family members and authorized occupants by the database,
  // so neither is fetched nor offered. Owner and tenant keep both exactly as before.
  const showsResidentOperations = canAccessResidentOperations(roles);
  const [data, setData] = useState<ResidentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setWarning('');
    const base = `/v1/condominiums/${condominiumId}`;
    // Pass factories, not already-created promises. Calling apiRequest before the capability check
    // starts fetch immediately even if the returned promise is later discarded.
    const financial = <T,>(request: () => Promise<T[]>) =>
      showsFinancialContext ? request() : Promise.resolve([] as T[]);
    // Migration B denies these two roles governance and service requests outright, so the
    // dashboard does not ask. A request whose only possible answer is "no" is still a request.
    const communityOnly = <T,>(request: () => Promise<T[]>) =>
      showsResidentOperations ? request() : Promise.resolve([] as T[]);
    const paymentsRequest = !showsFinancialContext
      ? Promise.resolve([] as DashboardPayment[])
      : apiRequest<DashboardPayment[]>(`${base}/payments`, session);
    const results = await Promise.allSettled([
      // `can_read_unit` already limits this to the units the caller owns or occupies, so a
      // resident receives their own and nothing else. No new endpoint, no client-side filtering
      // standing in for authorization.
      apiRequest<ResidentUnit[]>(`${base}/units`, session),
      financial(() => apiRequest<ReceivableSummary[]>(`${base}/receivables/summary`, session)),
      financial(() => apiRequest<DashboardReceivable[]>(`${base}/receivables`, session)),
      paymentsRequest,
      apiRequest<AnnouncementRecord[]>(`${base}/announcements`, session),
      communityOnly(() => apiRequest<ServiceRequestRecord[]>(`${base}/requests`, session)),
      communityOnly(() =>
        apiRequest<GovernanceProposal[]>(`${base}/governance-proposals`, session),
      ),
    ]);

    const [units, summaries, receivables, payments, announcements, requests, proposals] = results;
    const failed: string[] = [];
    // A missing unit is not worth a warning: the header simply says less.
    if (summaries.status === 'rejected') failed.push('saldos');
    if (receivables.status === 'rejected') failed.push('cuotas');
    if (payments.status === 'rejected') failed.push('pagos');
    if (announcements.status === 'rejected') failed.push('anuncios');
    if (requests.status === 'rejected') failed.push('solicitudes');
    if (proposals.status === 'rejected') failed.push('votaciones');

    setData({
      units: units.status === 'fulfilled' ? units.value : [],
      summaries: summaries.status === 'fulfilled' ? summaries.value : [],
      receivables: receivables.status === 'fulfilled' ? receivables.value : [],
      payments: payments.status === 'fulfilled' ? payments.value : [],
      announcements: announcements.status === 'fulfilled' ? announcements.value : [],
      requests: requests.status === 'fulfilled' ? requests.value : [],
      proposals: proposals.status === 'fulfilled' ? proposals.value : [],
    });
    if (failed.length) {
      setWarning(
        `No se pudieron actualizar: ${failed.join(', ')}. Los demás datos siguen disponibles.`,
      );
    }
    setLoading(false);
  }, [condominiumId, session, showsFinancialContext, showsResidentOperations]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaries = useMemo(
    () => sortReceivableSummaries(data?.summaries ?? []),
    [data?.summaries],
  );
  const nextDue = useMemo(
    () =>
      [...(data?.receivables ?? [])]
        .filter(
          (item) =>
            Number(item.outstanding_amount) > 0 &&
            !['paid', 'settled', 'reversed'].includes(item.status),
        )
        .sort((left, right) => dueTime(left) - dueTime(right))[0],
    [data?.receivables],
  );
  const recentPayments = useMemo(
    () =>
      [...(data?.payments ?? [])]
        .sort((left, right) =>
          (right.payment_date || right.created_at || '').localeCompare(
            left.payment_date || left.created_at || '',
          ),
        )
        .slice(0, 4),
    [data?.payments],
  );
  const importantAnnouncements = useMemo(
    () =>
      [...(data?.announcements ?? [])]
        .filter((item) => activeAnnouncement(item))
        .sort((left, right) => {
          const rank = { urgent: 0, important: 1, normal: 2 } as const;
          return (
            rank[left.priority] - rank[right.priority] ||
            (right.published_at ?? right.updated_at).localeCompare(
              left.published_at ?? left.updated_at,
            )
          );
        })
        .slice(0, 3),
    [data?.announcements],
  );
  const openRequests = useMemo(
    () =>
      [...(data?.requests ?? [])]
        .filter((item) => isOpenRequest(item.status))
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, 3),
    [data?.requests],
  );
  const openVotes = useMemo(
    () =>
      [...(data?.proposals ?? [])]
        .filter((item) => item.status === 'open' && Date.parse(item.closes_at) > Date.now())
        .sort((left, right) => left.closes_at.localeCompare(right.closes_at))
        .slice(0, 3),
    [data?.proposals],
  );

  // Declared with the other hooks, above the early returns. It used to sit below them, so the
  // loading render ran fewer hooks than the loaded one and React tore the page down with
  // "Rendered more hooks than during the previous render" the moment the data arrived. No unit
  // test caught it: the suite renders no DOM, so nothing ever reached the second render.
  // Who the person is here, in their own terms: which home, which unit, on what footing. The
  // dashboard already said which condominium; it never said which unit was theirs or whether they
  // hold it as owner or tenant, which is most of what makes a residential app feel like one.
  const residentContext = useMemo(() => {
    const unitLabels = (data?.units ?? [])
      .map((unit) =>
        unitReferenceLabel({ code: unit.code, buildingName: unit.building_name ?? null }),
      )
      .filter(Boolean);
    // Never the identifier. A unit without a readable code says nothing worth showing.
    const unit =
      unitLabels.length === 0
        ? null
        : unitLabels.length <= 2
          ? unitLabels.join(' · ')
          : `${unitLabels.slice(0, 2).join(' · ')} +${unitLabels.length - 2}`;
    // Named in the resident's own terms. Owner first: someone who owns and is also family is an
    // owner here, because that is the standing that carries capability.
    const standing = roles.includes('owner')
      ? 'Propietario'
      : roles.includes('tenant')
        ? 'Inquilino'
        : roles.includes('family_member')
          ? 'Familiar'
          : roles.includes('authorized_occupant')
            ? 'Ocupante autorizado'
            : null;
    return { unit, standing, unitCount: unitLabels.length };
  }, [data?.units, roles]);

  if (loading && !data) return <ResidentDashboardLoading />;
  if (!data) return null;

  const paymentsRoute = showsFinancialContext ? routeByKey('payments') : undefined;
  const feesRoute = showsFinancialContext ? routeByKey('fees') : undefined;
  // Denied to family members and authorized occupants by Migration B, so the affordance does not
  // exist for them -- no panel, no quick action, no button that leads to a refusal.
  const requestsRoute = showsResidentOperations ? routeByKey('requests') : undefined;
  const announcementsRoute = routeByKey('announcements');
  const governanceRoute = showsResidentOperations ? routeByKey('governance') : undefined;

  return (
    <div className="resident-dashboard">
      <PageHeader
        actions={
          <Button disabled={loading} onClick={() => void load()} size="sm" variant="secondary">
            {loading ? 'Actualizando…' : 'Actualizar'}
          </Button>
        }
        description={`${condominiumName} · lo importante de tu unidad y tu comunidad, en un solo lugar.`}
        eyebrow="Mi hogar"
        title="Inicio"
      />

      {residentContext.unit || residentContext.standing ? (
        <div aria-label="Tu contexto residencial" className="resident-dashboard__context">
          {residentContext.unit ? (
            <Badge tone="info">
              {residentContext.unitCount > 1 ? 'Tus unidades' : 'Tu unidad'}: {residentContext.unit}
            </Badge>
          ) : null}
          {residentContext.standing ? (
            <Badge tone="neutral">{residentContext.standing}</Badge>
          ) : null}
        </div>
      ) : null}

      {warning ? (
        <div className="resident-dashboard__warning" role="status">
          {warning}
        </div>
      ) : null}

      {showsFinancialContext ? (
        <>
          <section aria-label="Resumen financiero" className="resident-dashboard__hero-grid">
            <Surface className="resident-dashboard__balance-card" data-tone="navy">
              <div className="resident-dashboard__card-top">
                <span className="resident-dashboard__card-icon">
                  <FeesIcon size={20} />
                </span>
                <span>Saldo pendiente</span>
              </div>
              {summaries.length ? (
                <div className="resident-dashboard__balances">
                  {summaries.map((summary) => (
                    <div key={summary.currency_code}>
                      <Badge tone="info">{summary.currency_code}</Badge>
                      <strong>
                        {formatDashboardAmount(summary.net_outstanding, summary.currency_code)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="resident-dashboard__all-clear">
                  <CheckCircleIcon size={22} />
                  <strong>Sin saldos pendientes</strong>
                </div>
              )}
              <p className="resident-dashboard__card-note">
                Cada moneda por separado
                <InfoHint label="Cómo se agrupan las monedas">
                  Habitta mantiene cada moneda separada; nunca mezcla saldos USD, VES u otras
                  monedas.
                </InfoHint>
              </p>
              {paymentsRoute ? (
                <Button
                  className="resident-dashboard__primary-action"
                  onClick={() => onNavigate(paymentsRoute)}
                >
                  <PaymentsIcon size={18} />
                  Pagar / Registrar pago
                </Button>
              ) : (
                <small>
                  {tenantOnly
                    ? 'Los pagos no están delegados al inquilino en el modo piloto.'
                    : 'Tu acceso es residencial: la administración gestiona los pagos de la unidad.'}
                </small>
              )}
            </Surface>

            <Surface className="resident-dashboard__next-due" data-tone="blue">
              <div className="resident-dashboard__card-top">
                <span className="resident-dashboard__card-icon">
                  <CheckCircleIcon size={20} />
                </span>
                <span>Próxima cuota pendiente</span>
              </div>
              {nextDue ? (
                <>
                  <div className="resident-dashboard__next-due-heading">
                    <div>
                      <strong>{nextDue.description}</strong>
                      <span>
                        {nextDue.due_date
                          ? `Vence ${formatDashboardDate(nextDue.due_date)}`
                          : 'Sin fecha de vencimiento'}
                      </span>
                    </div>
                    <strong>
                      {formatDashboardAmount(nextDue.outstanding_amount, nextDue.currency_code)}
                    </strong>
                  </div>
                  {feesRoute ? (
                    <Button onClick={() => onNavigate(feesRoute)} size="sm" variant="ghost">
                      Ver estado de cuenta <ArrowRightIcon size={16} />
                    </Button>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  description="Cuando exista una obligación pendiente aparecerá aquí."
                  icon={<CheckCircleIcon size={26} />}
                  title="No tienes cuotas pendientes"
                />
              )}
            </Surface>
          </section>
        </>
      ) : (
        <section aria-label="Tu acceso residencial" className="resident-dashboard__hero-grid">
          <Surface className="resident-dashboard__panel">
            <div className="resident-dashboard__section-heading">
              <div>
                <span>Tu acceso</span>
                <h2>Acceso residencial</h2>
              </div>
            </div>
            <p>
              Ves los anuncios y documentos de tu comunidad. La administración gestiona los pagos y
              el estado de cuenta de la unidad.
            </p>
          </Surface>
        </section>
      )}

      {showsFinancialContext ? (
        <section aria-label="Pagos recientes" className="resident-dashboard__payments-row">
          <Surface className="resident-dashboard__panel">
            <div className="resident-dashboard__section-heading">
              <div>
                <span>Pagos</span>
                <h2>Movimientos recientes</h2>
              </div>
              {paymentsRoute ? (
                <Button onClick={() => onNavigate(paymentsRoute)} size="sm" variant="ghost">
                  Ver todos
                </Button>
              ) : null}
            </div>
            {recentPayments.length ? (
              <div className="resident-dashboard__list">
                {recentPayments.map((payment) => (
                  <article key={payment.id}>
                    <span className="resident-dashboard__list-icon">
                      <PaymentsIcon size={18} />
                    </span>
                    <div>
                      <strong>
                        {formatDashboardAmount(
                          payment.original_amount,
                          payment.original_currency_code,
                        )}
                      </strong>
                      <small>{formatDashboardDate(payment.payment_date)}</small>
                    </div>
                    <Badge tone={paymentTone(payment.status)}>
                      {paymentStatusLabels[payment.status] ?? payment.status}
                    </Badge>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                description="Tus pagos enviados y aprobados aparecerán aquí."
                icon={<PaymentsIcon size={26} />}
                title="Sin pagos recientes"
              />
            )}
          </Surface>
        </section>
      ) : null}

      <section className="resident-dashboard__content-grid">
        <Surface className="resident-dashboard__panel">
          <div className="resident-dashboard__section-heading">
            <div>
              <span>Comunidad</span>
              <h2>Anuncios importantes</h2>
            </div>
            {announcementsRoute ? (
              <Button onClick={() => onNavigate(announcementsRoute)} size="sm" variant="ghost">
                Ver anuncios
              </Button>
            ) : null}
          </div>
          {importantAnnouncements.length ? (
            <div className="resident-dashboard__stack">
              {importantAnnouncements.map((announcement) => (
                <button
                  key={announcement.id}
                  onClick={() => announcementsRoute && onNavigate(announcementsRoute)}
                  type="button"
                >
                  <span data-priority={announcement.priority}>
                    <AnnouncementsIcon size={18} />
                  </span>
                  <div>
                    <strong>{announcement.title}</strong>
                    <small>
                      {priorityLabels[announcement.priority]} ·{' '}
                      {formatAnnouncementDate(announcement.published_at ?? announcement.updated_at)}
                    </small>
                  </div>
                  <ArrowRightIcon size={16} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              description="Los comunicados urgentes o importantes aparecerán aquí."
              icon={<AnnouncementsIcon size={26} />}
              title="Sin anuncios prioritarios"
            />
          )}
        </Surface>

        {showsResidentOperations ? (
          <Surface className="resident-dashboard__panel">
            <div className="resident-dashboard__section-heading">
              <div>
                <span>Atención</span>
                <h2>Solicitudes abiertas</h2>
              </div>
              {requestsRoute ? (
                <Button onClick={() => onNavigate(requestsRoute)} size="sm" variant="ghost">
                  Ver solicitudes
                </Button>
              ) : null}
            </div>
            {openRequests.length ? (
              <div className="resident-dashboard__stack">
                {openRequests.map((request) => (
                  <button
                    key={request.id}
                    onClick={() => requestsRoute && onNavigate(requestsRoute)}
                    type="button"
                  >
                    <span>
                      <RequestsIcon size={18} />
                    </span>
                    <div>
                      <strong>{request.title}</strong>
                      <small>
                        {request.request_number} · {requestStatusLabels[request.status]} ·{' '}
                        {formatRequestDate(request.updated_at)}
                      </small>
                    </div>
                    <ArrowRightIcon size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                description="Tus solicitudes visibles aparecerán aquí."
                icon={<RequestsIcon size={26} />}
                title="No tienes solicitudes abiertas"
              />
            )}
          </Surface>
        ) : null}

        {showsResidentOperations ? (
          <Surface className="resident-dashboard__panel">
            <div className="resident-dashboard__section-heading">
              <div>
                <span>Participación</span>
                <h2>Votaciones pendientes</h2>
              </div>
              {governanceRoute ? (
                <Button onClick={() => onNavigate(governanceRoute)} size="sm" variant="ghost">
                  Ver votaciones
                </Button>
              ) : null}
            </div>
            {openVotes.length ? (
              <div className="resident-dashboard__stack">
                {openVotes.map((proposal) => (
                  <button
                    key={proposal.id}
                    onClick={() => governanceRoute && onNavigate(governanceRoute)}
                    type="button"
                  >
                    <span>
                      <VoteIcon size={18} />
                    </span>
                    <div>
                      <strong>{proposal.title}</strong>
                      <small>Cierra {formatGovernanceDate(proposal.closes_at)}</small>
                    </div>
                    <ArrowRightIcon size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                description="Las propuestas abiertas para tu participación aparecerán aquí."
                icon={<VoteIcon size={26} />}
                title="Sin votaciones abiertas"
              />
            )}
          </Surface>
        ) : null}
      </section>

      <Surface className="resident-dashboard__quick-access">
        <div>
          <span className="resident-dashboard__eyebrow">Accesos rápidos</span>
          <h2>Lo que más usas</h2>
        </div>
        <div className="resident-dashboard__quick-grid">
          {feesRoute ? (
            <button onClick={() => onNavigate(feesRoute)} type="button">
              <FeesIcon size={20} />
              <span>Estado de cuenta</span>
            </button>
          ) : null}
          {paymentsRoute ? (
            <button onClick={() => onNavigate(paymentsRoute)} type="button">
              <PaymentsIcon size={20} />
              <span>Pagos y recibos</span>
            </button>
          ) : null}
          {requestsRoute ? (
            <button onClick={() => onNavigate(requestsRoute)} type="button">
              <RequestsIcon size={20} />
              <span>Solicitudes</span>
            </button>
          ) : null}
          {governanceRoute ? (
            <button onClick={() => onNavigate(governanceRoute)} type="button">
              <VoteIcon size={20} />
              <span>Votaciones</span>
            </button>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
