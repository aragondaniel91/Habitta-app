import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../../components/Dialog';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid, FormSection } from '../../components/FormLayout';
import { Badge, Button, EmptyState, Field, Select, Surface } from '../../components/ui';
import { FeesIcon } from '../../components/icons';
import { apiRequest } from '../../lib/api';
import type { ChargeConcept } from '../../lib/receivables';
import { unitReferenceLabel } from '../../lib/unit-domain';
import { validateRecurringPlanDraft } from './recurring-plan-validation';

type Props = {
  condominiumId: string;
  session: Session;
  concepts: ChargeConcept[];
  canManage: boolean;
  onLedgerChanged: () => void;
  onCreateConcept: () => void;
};

type FinancialScopeKind = 'condominium' | 'building' | 'custom';
type Distribution = 'fixed_per_unit' | 'participation_percentage';
type RunStatus = 'scheduled' | 'pending_review' | 'posted' | 'cancelled';

type FinancialScope = {
  id: string;
  kind: FinancialScopeKind;
  building_id: string | null;
  code: string;
  name: string;
  is_active: boolean;
};

type RecurringPlan = {
  id: string;
  concept_id: string;
  financial_scope_id: string;
  name: string;
  distribution: Distribution;
  amount: string | number;
  currency_code: string;
  issue_day: number;
  due_day: number;
  starts_on: string;
  ends_on: string | null;
  status: 'active' | 'inactive';
};

type Allocation = {
  unit_id: string;
  unit_code: string;
  amount: string | number;
  participation_percentage?: string;
};

type RecurringRun = {
  id: string;
  plan_id: string;
  period: string;
  issue_date: string;
  due_date: string;
  currency_code: string;
  status: RunStatus;
  distribution_snapshot: Allocation[] | null;
  total_amount: string | number | null;
  charge_batch_id: string | null;
};

type Building = { id: string; name: string };
type Unit = {
  id: string;
  code: string;
  building_id: string | null;
  ownership_percentage: string | number | null;
  status: string;
};

type ScopeForm = {
  kind: FinancialScopeKind;
  code: string;
  name: string;
  buildingId: string;
  unitIds: string[];
};

type PlanForm = {
  conceptId: string;
  financialScopeId: string;
  name: string;
  distribution: Distribution;
  amount: string;
  currencyCode: string;
  startsOn: string;
  endsOn: string;
  issueDay: string;
  dueDay: string;
};

const currentMonthStart = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
};

const initialScopeForm: ScopeForm = {
  kind: 'condominium',
  code: 'general',
  name: 'Condominio general',
  buildingId: '',
  unitIds: [],
};

const initialPlanForm = (concepts: ChargeConcept[], scopes: FinancialScope[]): PlanForm => {
  const concept =
    concepts.find((item) => item.is_active !== false && item.category === 'regular_dues') ??
    concepts.find((item) => item.is_active !== false);
  const scope =
    scopes.find((item) => item.is_active && item.kind === 'condominium') ??
    scopes.find((item) => item.is_active);
  return {
    conceptId: concept?.id ?? '',
    financialScopeId: scope?.id ?? '',
    name: concept?.name ? `${concept.name} mensual` : 'Cuota ordinaria mensual',
    distribution: 'participation_percentage',
    amount: String(concept?.default_amount ?? ''),
    currencyCode: concept?.default_currency_code ?? 'USD',
    startsOn: currentMonthStart(),
    endsOn: '',
    issueDay: '1',
    dueDay: '10',
  };
};

const planFormFromPlan = (plan: RecurringPlan): PlanForm => ({
  conceptId: plan.concept_id,
  financialScopeId: plan.financial_scope_id,
  name: plan.name,
  distribution: plan.distribution,
  amount: String(plan.amount),
  currencyCode: plan.currency_code,
  startsOn: plan.starts_on,
  endsOn: plan.ends_on ?? '',
  issueDay: String(plan.issue_day),
  dueDay: String(plan.due_day),
});

const addMonth = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 0, month ?? 0, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
};

const startPeriod = (startsOn: string) => startsOn.slice(0, 7);

const money = (amount: string | number | null, currency: string) => {
  if (amount === null || amount === '') return `— ${currency}`;
  const value = Number(amount);
  return Number.isFinite(value)
    ? new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(value)
    : `${amount} ${currency}`;
};

const statusLabel: Record<RunStatus, string> = {
  scheduled: 'Programada',
  pending_review: 'Por aprobar',
  posted: 'Publicada',
  cancelled: 'Cancelada',
};

const statusTone = (status: RunStatus) => {
  if (status === 'posted') return 'success' as const;
  if (status === 'pending_review') return 'warning' as const;
  if (status === 'scheduled') return 'info' as const;
  return 'neutral' as const;
};

export function RecurringDuesWorkspace({
  condominiumId,
  session,
  concepts,
  canManage,
  onLedgerChanged,
  onCreateConcept,
}: Props) {
  const [scopes, setScopes] = useState<FinancialScope[]>([]);
  const [plans, setPlans] = useState<RecurringPlan[]>([]);
  const [runs, setRuns] = useState<RecurringRun[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState('');
  const [scopeDrawerOpen, setScopeDrawerOpen] = useState(false);
  const [runToPost, setRunToPost] = useState<RecurringRun | null>(null);
  const [expandedRunId, setExpandedRunId] = useState('');
  const [scopeForm, setScopeForm] = useState<ScopeForm>(initialScopeForm);
  const [planForm, setPlanForm] = useState<PlanForm>(() => initialPlanForm(concepts, []));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextScopes, nextPlans, nextRuns, nextBuildings, nextUnits] = await Promise.all([
        apiRequest<FinancialScope[]>(`/v1/condominiums/${condominiumId}/financial-scopes`, session),
        apiRequest<RecurringPlan[]>(
          `/v1/condominiums/${condominiumId}/recurring-charge-plans`,
          session,
        ),
        apiRequest<RecurringRun[]>(
          `/v1/condominiums/${condominiumId}/recurring-charge-runs`,
          session,
        ),
        apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
        apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
      ]);
      setScopes(nextScopes);
      setPlans(nextPlans);
      setRuns(nextRuns);
      setBuildings(nextBuildings);
      setUnits(nextUnits);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar las cuotas recurrentes.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPlanDrawerOpen(false);
    setEditingPlanId('');
    setScopeDrawerOpen(false);
    setRunToPost(null);
    setExpandedRunId('');
  }, [condominiumId]);

  const activeScopes = scopes.filter((scope) => scope.is_active);
  const activeConcepts = useMemo(
    () => concepts.filter((concept) => concept.is_active !== false),
    [concepts],
  );
  const planValidation = useMemo(() => validateRecurringPlanDraft(planForm), [planForm]);
  const activePlans = plans.filter((plan) => plan.status === 'active');
  const pendingRuns = runs.filter((run) => run.status === 'pending_review');
  const scheduledRuns = runs.filter((run) => run.status === 'scheduled');
  const recentRuns = runs
    .filter((run) => run.status === 'posted')
    .sort((left, right) => right.period.localeCompare(left.period))
    .slice(0, 3);

  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const scopeById = useMemo(() => new Map(scopes.map((scope) => [scope.id, scope])), [scopes]);
  const buildingNameById = useMemo(
    () => Object.fromEntries(buildings.map((building) => [building.id, building.name])),
    [buildings],
  );
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

  const closePlanDrawer = () => {
    setPlanDrawerOpen(false);
    setEditingPlanId('');
  };

  const openPlanDrawer = () => {
    setEditingPlanId('');
    setPlanForm(initialPlanForm(concepts, activeScopes));
    setPlanDrawerOpen(true);
  };

  const openEditPlanDrawer = (plan: RecurringPlan) => {
    setEditingPlanId(plan.id);
    setPlanForm(planFormFromPlan(plan));
    setPlanDrawerOpen(true);
  };

  useEffect(() => {
    if (!planDrawerOpen || editingPlanId || !activeConcepts.length) return;
    setPlanForm((current) => {
      if (activeConcepts.some((concept) => concept.id === current.conceptId)) return current;
      const concept =
        activeConcepts.find((item) => item.category === 'regular_dues') ?? activeConcepts[0];
      if (!concept) return current;
      return {
        ...current,
        conceptId: concept.id,
        name: current.name === 'Cuota ordinaria mensual' ? `${concept.name} mensual` : current.name,
        amount: String(concept.default_amount ?? current.amount),
        currencyCode: concept.default_currency_code ?? current.currencyCode,
      };
    });
  }, [activeConcepts, editingPlanId, planDrawerOpen]);

  const saveScope = async (event: FormEvent) => {
    event.preventDefault();
    setBusyId('scope');
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/financial-scopes`, session, {
        method: 'POST',
        body: JSON.stringify({
          code: scopeForm.code,
          name: scopeForm.name,
          kind: scopeForm.kind,
          ...(scopeForm.kind === 'building' ? { buildingId: scopeForm.buildingId } : {}),
          ...(scopeForm.kind === 'custom' ? { unitIds: scopeForm.unitIds } : {}),
        }),
      });
      setScopeForm(initialScopeForm);
      setScopeDrawerOpen(false);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear el ámbito.',
      );
    } finally {
      setBusyId('');
    }
  };

  const savePlan = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateRecurringPlanDraft(planForm);
    if (!validation.valid) {
      setError('Revisa los campos marcados antes de guardar el plan.');
      return;
    }
    setBusyId('plan');
    setError('');
    const path = editingPlanId
      ? `/v1/condominiums/${condominiumId}/recurring-charge-plans/${editingPlanId}`
      : `/v1/condominiums/${condominiumId}/recurring-charge-plans`;
    try {
      await apiRequest(path, session, {
        method: editingPlanId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          conceptId: planForm.conceptId,
          financialScopeId: planForm.financialScopeId,
          name: planForm.name,
          distribution: planForm.distribution,
          amount: planForm.amount,
          currencyCode: planForm.currencyCode.toUpperCase(),
          startsOn: planForm.startsOn,
          ...(planForm.endsOn ? { endsOn: planForm.endsOn } : {}),
          issueDay: Number(planForm.issueDay),
          dueDay: Number(planForm.dueDay),
        }),
      });
      closePlanDrawer();
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : editingPlanId
            ? 'No se pudieron guardar los cambios de la cuota recurrente.'
            : 'No se pudo crear la cuota recurrente.',
      );
    } finally {
      setBusyId('');
    }
  };

  const scheduleNext = async (plan: RecurringPlan) => {
    const periods = runs
      .filter((run) => run.plan_id === plan.id)
      .map((run) => run.period)
      .sort();
    const nextPeriod = periods.length
      ? addMonth(periods[periods.length - 1]!)
      : startPeriod(plan.starts_on);
    setBusyId(`schedule:${plan.id}`);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/recurring-charge-plans/${plan.id}/runs`,
        session,
        { method: 'POST', body: JSON.stringify({ period: nextPeriod }) },
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo programar el período.',
      );
    } finally {
      setBusyId('');
    }
  };

  const prepareRun = async (run: RecurringRun) => {
    setBusyId(`prepare:${run.id}`);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/recurring-charge-runs/${run.id}/prepare`,
        session,
        { method: 'POST' },
      );
      setExpandedRunId(run.id);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo preparar la cuota.',
      );
    } finally {
      setBusyId('');
    }
  };

  const postRun = async (run: RecurringRun) => {
    setBusyId(`post:${run.id}`);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/recurring-charge-runs/${run.id}/post`,
        session,
        { method: 'POST' },
      );
      setRunToPost(null);
      setExpandedRunId('');
      onLedgerChanged();
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo publicar la cuota.',
      );
    } finally {
      setBusyId('');
    }
  };

  if (!canManage) return null;

  return (
    <Surface className="recurring-dues-workspace">
      <div className="recurring-dues-heading">
        <div>
          <span className="receivables-kicker">Operación mensual</span>
          <h2>Cuotas ordinarias recurrentes</h2>
          <p>
            Configura la cuota una vez. Cada período se programa, se congela para revisión y solo
            entra en cartera después de una aprobación explícita.
          </p>
        </div>
        {canManage ? (
          <div className="recurring-dues-actions">
            <Button onClick={() => setScopeDrawerOpen(true)} size="sm" variant="secondary">
              Ámbitos financieros
            </Button>
            <Button disabled={!activeScopes.length} onClick={openPlanDrawer} size="sm">
              Nueva cuota ordinaria
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="recurring-dues-alert" role="status">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="recurring-dues-loading">Cargando planes y períodos…</div>
      ) : !scopes.length && canManage ? (
        <EmptyState
          actionLabel="Crear ámbito general"
          description="Primero define dónde se distribuye la cuota: todo el condominio, un edificio o un grupo de unidades."
          icon={<FeesIcon size={26} />}
          onAction={() => setScopeDrawerOpen(true)}
          title="Define el primer ámbito financiero"
        />
      ) : (
        <>
          <div className="recurring-dues-metrics">
            <div>
              <strong>{activePlans.length}</strong>
              <span>planes activos</span>
            </div>
            <div data-emphasis={pendingRuns.length > 0 || undefined}>
              <strong>{pendingRuns.length}</strong>
              <span>por aprobar</span>
            </div>
            <div>
              <strong>{scheduledRuns.length}</strong>
              <span>programadas</span>
            </div>
          </div>

          {pendingRuns.length ? (
            <section
              className="recurring-dues-section"
              aria-label="Cuotas pendientes de aprobación"
            >
              <div className="recurring-dues-section__title">
                <div>
                  <h3>Requieren revisión</h3>
                  <p>El reparto ya está congelado; todavía no existe deuda nueva.</p>
                </div>
                <Badge tone="warning">
                  {pendingRuns.length} pendiente{pendingRuns.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <div className="recurring-dues-run-list">
                {pendingRuns.map((run) => {
                  const plan = planById.get(run.plan_id);
                  const expanded = expandedRunId === run.id;
                  return (
                    <article className="recurring-dues-run" key={run.id}>
                      <div className="recurring-dues-run__summary">
                        <div>
                          <strong>{plan?.name ?? 'Cuota ordinaria'}</strong>
                          <span>
                            {run.period} · vence {run.due_date}
                          </span>
                        </div>
                        <div className="recurring-dues-run__amount">
                          <b>{money(run.total_amount, run.currency_code)}</b>
                          <Badge tone={statusTone(run.status)}>{statusLabel[run.status]}</Badge>
                        </div>
                      </div>
                      <div className="recurring-dues-run__actions">
                        <Button
                          onClick={() => setExpandedRunId(expanded ? '' : run.id)}
                          size="sm"
                          variant="ghost"
                        >
                          {expanded ? 'Ocultar reparto' : 'Revisar reparto'}
                        </Button>
                        {canManage ? (
                          <Button
                            disabled={busyId === `post:${run.id}`}
                            onClick={() => setRunToPost(run)}
                            size="sm"
                          >
                            {busyId === `post:${run.id}` ? 'Publicando…' : 'Aprobar y publicar'}
                          </Button>
                        ) : null}
                      </div>
                      {expanded ? (
                        <div className="recurring-dues-allocation">
                          {(run.distribution_snapshot ?? []).map((row) => {
                            const currentUnit = unitById.get(row.unit_id);
                            const unitLabel = currentUnit
                              ? unitReferenceLabel({
                                  code: currentUnit.code,
                                  buildingName: currentUnit.building_id
                                    ? (buildingNameById[currentUnit.building_id] ?? null)
                                    : null,
                                })
                              : row.unit_code || row.unit_id;

                            return (
                              <div key={row.unit_id}>
                                <span>{unitLabel}</span>
                                {row.participation_percentage ? (
                                  <small>Alícuota {row.participation_percentage}%</small>
                                ) : (
                                  <small>Monto fijo</small>
                                )}
                                <strong>{money(row.amount, run.currency_code)}</strong>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {scheduledRuns.length ? (
            <section className="recurring-dues-section" aria-label="Cuotas programadas">
              <div className="recurring-dues-section__title">
                <div>
                  <h3>Próximas cuotas programadas</h3>
                  <p>
                    Preparar congela las unidades y alícuotas del período para que puedan revisarse.
                  </p>
                </div>
              </div>
              <div className="recurring-dues-compact-list">
                {scheduledRuns.map((run) => {
                  const plan = planById.get(run.plan_id);
                  return (
                    <div key={run.id}>
                      <div>
                        <strong>{plan?.name ?? 'Cuota ordinaria'}</strong>
                        <span>
                          {run.period} · emisión {run.issue_date}
                        </span>
                      </div>
                      <Badge tone="info">Programada</Badge>
                      {canManage ? (
                        <Button
                          disabled={busyId === `prepare:${run.id}`}
                          onClick={() => void prepareRun(run)}
                          size="sm"
                          variant="secondary"
                        >
                          {busyId === `prepare:${run.id}`
                            ? 'Preparando…'
                            : 'Preparar para revisión'}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="recurring-dues-section" aria-label="Planes recurrentes">
            <div className="recurring-dues-section__title">
              <div>
                <h3>Planes configurados</h3>
                <p>
                  El monto significa presupuesto total cuando se distribuye por alícuota y monto por
                  unidad cuando es fijo.
                </p>
              </div>
            </div>
            {activePlans.length ? (
              <div className="recurring-dues-plan-grid">
                {activePlans.map((plan) => {
                  const scope = scopeById.get(plan.financial_scope_id);
                  const hasPendingReview = pendingRuns.some((run) => run.plan_id === plan.id);
                  return (
                    <article key={plan.id}>
                      <div>
                        <strong>{plan.name}</strong>
                        <Badge tone="success">Activo</Badge>
                      </div>
                      <p>
                        {scope?.name ?? 'Ámbito no disponible'} ·{' '}
                        {plan.distribution === 'participation_percentage'
                          ? 'Por alícuota'
                          : 'Monto fijo por unidad'}
                      </p>
                      <b>{money(plan.amount, plan.currency_code)}</b>
                      {canManage ? (
                        <div className="recurring-dues-plan-actions">
                          <Button
                            disabled={hasPendingReview}
                            onClick={() => openEditPlanDrawer(plan)}
                            size="sm"
                            title={
                              hasPendingReview
                                ? 'Primero resuelve la cuota pendiente de revisión.'
                                : 'Editar configuración de la cuota'
                            }
                            variant="secondary"
                          >
                            Editar
                          </Button>
                          <Button
                            disabled={busyId === `schedule:${plan.id}`}
                            onClick={() => void scheduleNext(plan)}
                            size="sm"
                            variant="ghost"
                          >
                            {busyId === `schedule:${plan.id}`
                              ? 'Programando…'
                              : 'Programar siguiente período'}
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="recurring-dues-muted">Aún no hay planes ordinarios recurrentes.</p>
            )}
          </section>

          {recentRuns.length ? (
            <section
              className="recurring-dues-section recurring-dues-history"
              aria-label="Cuotas recurrentes publicadas"
            >
              <div className="recurring-dues-section__title">
                <div>
                  <h3>Publicadas recientemente</h3>
                  <p>Estos períodos son históricos e inmutables.</p>
                </div>
              </div>
              {recentRuns.map((run) => (
                <div key={run.id}>
                  <span>
                    {planById.get(run.plan_id)?.name ?? 'Cuota ordinaria'} · {run.period}
                  </span>
                  <strong>{money(run.total_amount, run.currency_code)}</strong>
                  <Badge tone="success">Publicada</Badge>
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}

      {runToPost ? (
        <ConfirmDialog
          busy={busyId === `post:${runToPost.id}`}
          busyLabel="Publicando cuota…"
          confirmLabel="Publicar cuota"
          description={`Vas a publicar el período ${runToPost.period} por ${money(runToPost.total_amount, runToPost.currency_code)}. Esto creará la deuda en cartera usando el reparto congelado y el período quedará inmutable.`}
          destructive
          onCancel={() => !busyId && setRunToPost(null)}
          onConfirm={() => void postRun(runToPost)}
          title="Aprobar y publicar cuota"
        />
      ) : null}

      {scopeDrawerOpen ? (
        <Drawer
          eyebrow="Configuración financiera"
          onClose={() => setScopeDrawerOpen(false)}
          prefix="recurring-dues"
          title="Nuevo ámbito financiero"
        >
          <form className="recurring-dues-form ux-form" onSubmit={(event) => void saveScope(event)}>
            <p className="recurring-dues-form__intro">
              Un ámbito define qué unidades participan en un gasto o cuota sin confundir la
              estructura física con la contabilidad.
            </p>
            <Field label="Tipo de ámbito">
              <Select
                value={scopeForm.kind}
                onChange={(event) =>
                  setScopeForm((current) => ({
                    ...current,
                    kind: event.target.value as FinancialScopeKind,
                    buildingId: '',
                    unitIds: [],
                  }))
                }
              >
                <option value="condominium">Todo el condominio</option>
                <option value="building">Un edificio</option>
                <option value="custom">Grupo personalizado de unidades</option>
              </Select>
            </Field>
            <FormGrid>
              <Field label="Código">
                <input
                  className="input"
                  maxLength={48}
                  onChange={(event) =>
                    setScopeForm((current) => ({ ...current, code: event.target.value }))
                  }
                  required
                  value={scopeForm.code}
                />
              </Field>
              <Field label="Nombre">
                <input
                  className="input"
                  maxLength={120}
                  onChange={(event) =>
                    setScopeForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                  value={scopeForm.name}
                />
              </Field>
            </FormGrid>
            {scopeForm.kind === 'building' ? (
              <Field label="Edificio">
                <Select
                  required
                  value={scopeForm.buildingId}
                  onChange={(event) =>
                    setScopeForm((current) => ({ ...current, buildingId: event.target.value }))
                  }
                >
                  <option value="">Selecciona un edificio</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {scopeForm.kind === 'custom' ? (
              <fieldset className="recurring-dues-unit-picker">
                <legend>Unidades incluidas</legend>
                {units
                  .filter((unit) => unit.status === 'active')
                  .map((unit) => (
                    <label key={unit.id}>
                      <input
                        checked={scopeForm.unitIds.includes(unit.id)}
                        onChange={(event) =>
                          setScopeForm((current) => ({
                            ...current,
                            unitIds: event.target.checked
                              ? [...current.unitIds, unit.id]
                              : current.unitIds.filter((id) => id !== unit.id),
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        {unitReferenceLabel({
                          code: unit.code,
                          buildingName: unit.building_id
                            ? (buildingNameById[unit.building_id] ?? null)
                            : null,
                        })}
                      </span>
                      <small>
                        {unit.ownership_percentage
                          ? `Alícuota ${unit.ownership_percentage}%`
                          : 'Sin alícuota configurada'}
                      </small>
                    </label>
                  ))}
              </fieldset>
            ) : null}
            <FormActions sticky>
              <Button onClick={() => setScopeDrawerOpen(false)} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={
                  busyId === 'scope' ||
                  (scopeForm.kind === 'custom' && scopeForm.unitIds.length === 0)
                }
                type="submit"
              >
                {busyId === 'scope' ? 'Guardando…' : 'Crear ámbito'}
              </Button>
            </FormActions>
          </form>
        </Drawer>
      ) : null}

      {planDrawerOpen ? (
        <Drawer
          eyebrow="Cuotas ordinarias"
          onClose={closePlanDrawer}
          prefix="recurring-dues"
          title={editingPlanId ? 'Editar cuota ordinaria' : 'Nueva cuota recurrente'}
          wide
        >
          <form className="recurring-dues-form ux-form" onSubmit={(event) => void savePlan(event)}>
            <p className="recurring-dues-form__intro">
              {editingPlanId
                ? 'Actualiza la configuración para períodos no publicados. La historia financiera ya publicada no se reescribe.'
                : 'Habitta crea el primer período como programado. Nada se carga a las unidades hasta que revises el reparto y publiques la ocurrencia.'}
            </p>
            <FormSection
              actions={
                activeConcepts.length ? (
                  <Button onClick={onCreateConcept} size="sm" type="button" variant="secondary">
                    Nuevo concepto
                  </Button>
                ) : undefined
              }
              description="Define qué se cobra y a qué ámbito financiero se aplicará."
              title="Definición"
              variant="card"
            >
              <FormGrid>
                {activeConcepts.length ? (
                  <Field error={planValidation.errors.conceptId} label="Concepto" required>
                    <Select
                      required
                      value={planForm.conceptId}
                      onChange={(event) =>
                        setPlanForm((current) => ({ ...current, conceptId: event.target.value }))
                      }
                    >
                      <option value="">Selecciona un concepto</option>
                      {activeConcepts.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <div className="recurring-dues-concept-empty" role="status">
                    <div>
                      <strong>Concepto</strong>
                      <span>No hay conceptos de cobro activos.</span>
                    </div>
                    <Button onClick={onCreateConcept} size="sm" type="button" variant="secondary">
                      Crear primer concepto
                    </Button>
                  </div>
                )}
                <Field
                  error={planValidation.errors.financialScopeId}
                  label="Ámbito financiero"
                  required
                >
                  <Select
                    required
                    value={planForm.financialScopeId}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        financialScopeId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Selecciona un ámbito</option>
                    {activeScopes.map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <Field error={planValidation.errors.name} label="Nombre del plan" required>
                <input
                  className="input"
                  maxLength={160}
                  onChange={(event) =>
                    setPlanForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                  value={planForm.name}
                />
              </Field>
            </FormSection>

            <FormSection
              description={
                planForm.distribution === 'participation_percentage'
                  ? 'El presupuesto total del período se reparte proporcionalmente según la alícuota de cada unidad.'
                  : 'Cada unidad del ámbito recibe exactamente el mismo monto.'
              }
              title="Reparto y monto"
              variant="card"
            >
              <FormGrid columns={3}>
                <Field label="Distribución" required>
                  <Select
                    value={planForm.distribution}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        distribution: event.target.value as Distribution,
                      }))
                    }
                  >
                    <option value="participation_percentage">Por alícuota / participación</option>
                    <option value="fixed_per_unit">Monto fijo por unidad</option>
                  </Select>
                </Field>
                <Field
                  error={planValidation.errors.amount}
                  label={
                    planForm.distribution === 'participation_percentage'
                      ? 'Presupuesto total por período'
                      : 'Monto por unidad'
                  }
                  required
                >
                  <input
                    className="input"
                    inputMode="decimal"
                    onChange={(event) =>
                      setPlanForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    pattern="^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$"
                    placeholder="0.00"
                    required
                    value={planForm.amount}
                  />
                </Field>
                <Field error={planValidation.errors.currencyCode} label="Moneda" required>
                  <input
                    className="input"
                    maxLength={3}
                    minLength={3}
                    onChange={(event) =>
                      setPlanForm((current) => ({
                        ...current,
                        currencyCode: event.target.value.toUpperCase(),
                      }))
                    }
                    pattern="[A-Z]{3}"
                    required
                    value={planForm.currencyCode}
                  />
                </Field>
              </FormGrid>
            </FormSection>

            <FormSection
              description="Configura el ciclo mensual y por cuánto tiempo estará vigente el plan."
              title="Calendario"
              variant="card"
            >
              <FormGrid>
                <Field error={planValidation.errors.issueDay} label="Día de emisión" required>
                  <input
                    className="input"
                    max="28"
                    min="1"
                    onChange={(event) =>
                      setPlanForm((current) => ({ ...current, issueDay: event.target.value }))
                    }
                    required
                    type="number"
                    value={planForm.issueDay}
                  />
                </Field>
                <Field error={planValidation.errors.dueDay} label="Día de vencimiento" required>
                  <input
                    className="input"
                    max="28"
                    min={Number(planForm.issueDay) || 1}
                    onChange={(event) =>
                      setPlanForm((current) => ({ ...current, dueDay: event.target.value }))
                    }
                    required
                    type="number"
                    value={planForm.dueDay}
                  />
                </Field>
              </FormGrid>
              <FormGrid>
                <Field error={planValidation.errors.startsOn} label="Comienza" required>
                  <input
                    className="input"
                    onChange={(event) =>
                      setPlanForm((current) => ({ ...current, startsOn: event.target.value }))
                    }
                    required
                    type="date"
                    value={planForm.startsOn}
                  />
                </Field>
                <Field
                  error={planValidation.errors.endsOn}
                  hint="Opcional. Déjalo vacío para una cuota recurrente indefinida."
                  label="Finaliza"
                >
                  <input
                    className="input"
                    min={planForm.startsOn}
                    onChange={(event) =>
                      setPlanForm((current) => ({ ...current, endsOn: event.target.value }))
                    }
                    type="date"
                    value={planForm.endsOn}
                  />
                </Field>
              </FormGrid>
            </FormSection>
            <div className="recurring-dues-safety-note">
              <strong>Control financiero</strong>
              <span>
                {editingPlanId
                  ? 'Los cambios afectan períodos no publicados. Las cuotas ya publicadas conservan sus importes, fechas y cuentas por cobrar originales.'
                  : 'Crear el plan no publica deuda. La distribución del período se congela en “Por aprobar” y después exige una acción separada para entrar al libro.'}
              </span>
            </div>
            <FormActions sticky>
              <Button onClick={closePlanDrawer} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button disabled={busyId === 'plan' || !planValidation.valid} type="submit">
                {busyId === 'plan'
                  ? editingPlanId
                    ? 'Guardando…'
                    : 'Creando…'
                  : editingPlanId
                    ? 'Guardar cambios'
                    : 'Crear y programar'}
              </Button>
            </FormActions>
          </form>
        </Drawer>
      ) : null}
    </Surface>
  );
}
