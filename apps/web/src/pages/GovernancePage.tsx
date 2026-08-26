import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AnnouncementsIcon,
  CheckCircleIcon,
  CommunityIcon,
  ExpensesIcon,
  VoteIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { Drawer } from '../components/Drawer';
import { FormActions, FormGrid } from '../components/FormLayout';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { canManageGovernance, useCondominiumRoles } from '../lib/roles';
import { PrivateDocumentUploader } from '../features/documents/PrivateDocumentUploader';
import { downloadPrivateDocument } from '../features/documents/api';
import { formatMoney } from '../lib/expenses';
import {
  filterGovernanceProposals,
  formatGovernanceDate,
  governanceCategoryLabels,
  governanceStatusLabels,
  isProposalOpen,
  nextGovernanceActions,
  votingBasisLabels,
} from '../lib/governance';
import type {
  GovernanceAttachment,
  GovernanceCategory,
  GovernanceEligibility,
  GovernanceOption,
  GovernanceProposal,
  GovernanceResults,
  GovernanceStatus,
  GovernanceVotingBasis,
} from '../lib/governance';
import '../governance.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type ProposalDetail = {
  options: GovernanceOption[];
  attachments: GovernanceAttachment[];
  eligibility: GovernanceEligibility | null;
  results: GovernanceResults | null;
};

type Drawer = 'create' | 'detail' | null;

const categoryValues: GovernanceCategory[] = [
  'budget',
  'maintenance',
  'improvement',
  'community',
  'policy',
  'other',
];

const statusTone = (status: GovernanceStatus) => {
  if (status === 'approved') return 'success' as const;
  if (status === 'open' || status === 'closed') return 'warning' as const;
  if (status === 'archived' || status === 'rejected') return 'neutral' as const;
  return 'info' as const;
};

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
    <Surface className="governance-metric" data-tone={tone}>
      <div className="governance-metric__top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function DrawerShell({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Drawer eyebrow={eyebrow} onClose={onClose} prefix="governance" title={title} wide={wide}>
      {children}
    </Drawer>
  );
}

function GovernanceLoading() {
  return (
    <div aria-label="Cargando votaciones" className="governance-page">
      <PageHeader eyebrow="Participación comunitaria" title="Propuestas y votaciones" />
      <div className="governance-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="governance-board-skeleton" />
    </div>
  );
}

function CreateProposalForm({
  condominiumId,
  session,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  onCreated: (proposal: GovernanceProposal) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GovernanceCategory>('improvement');
  const [votingBasis, setVotingBasis] = useState<GovernanceVotingBasis>('one_per_unit');
  const [quorumPercentage, setQuorumPercentage] = useState('50');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [closesAt, setClosesAt] = useState(localDateTime(new Date(Date.now() + 7 * 86_400_000)));
  const [options, setOptions] = useState(['A favor', 'En contra']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const proposal = await apiRequest<GovernanceProposal>(
        `/v1/condominiums/${condominiumId}/governance-proposals`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            summary: summary || undefined,
            description,
            category,
            votingBasis,
            quorumPercentage: Number(quorumPercentage),
            budgetAmount: budgetAmount || undefined,
            currencyCode: budgetAmount ? currencyCode : undefined,
            closesAt: new Date(closesAt).toISOString(),
            options: options
              .map((label) => label.trim())
              .filter(Boolean)
              .map((label) => ({ label })),
          }),
        },
      );
      onCreated(proposal);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la propuesta.',
      );
    } finally {
      setSaving(false);
    }
  };

  const updateOption = (index: number, value: string) =>
    setOptions((current) =>
      current.map((option, optionIndex) => (optionIndex === index ? value : option)),
    );

  return (
    <form className="governance-form ux-form" onSubmit={(event) => void submit(event)}>
      {error ? <div className="governance-inline-alert">{error}</div> : null}
      <Field label="Título de la propuesta">
        <input
          className="input"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ej. Renovación de la fachada principal"
          required
          value={title}
        />
      </Field>
      <Field label="Resumen" hint="Texto breve que aparecerá en el listado.">
        <input
          className="input"
          onChange={(event) => setSummary(event.target.value)}
          value={summary}
        />
      </Field>
      <Field label="Descripción y alcance">
        <textarea
          className="textarea"
          onChange={(event) => setDescription(event.target.value)}
          required
          rows={6}
          value={description}
        />
      </Field>
      <FormGrid>
        <Field label="Categoría">
          <Select
            onChange={(event) => setCategory(event.target.value as GovernanceCategory)}
            value={category}
          >
            {categoryValues.map((value) => (
              <option key={value} value={value}>
                {governanceCategoryLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base de votación">
          <Select
            onChange={(event) => setVotingBasis(event.target.value as GovernanceVotingBasis)}
            value={votingBasis}
          >
            <option value="one_per_unit">Un voto por unidad</option>
            <option value="one_per_owner">Un voto por propietario</option>
          </Select>
        </Field>
      </FormGrid>
      <FormGrid columns={3}>
        <Field label="Quórum requerido" hint="Porcentaje entre 0 y 100.">
          <input
            className="input"
            max="100"
            min="0"
            onChange={(event) => setQuorumPercentage(event.target.value)}
            required
            step="0.01"
            type="number"
            value={quorumPercentage}
          />
        </Field>
        <Field label="Cierre de votación">
          <input
            className="input"
            min={localDateTime(new Date())}
            onChange={(event) => setClosesAt(event.target.value)}
            required
            type="datetime-local"
            value={closesAt}
          />
        </Field>
        <Field label="Moneda del presupuesto">
          <Select
            disabled={!budgetAmount}
            onChange={(event) => setCurrencyCode(event.target.value)}
            value={currencyCode}
          >
            <option value="USD">USD</option>
            <option value="VES">VES</option>
            <option value="EUR">EUR</option>
          </Select>
        </Field>
      </FormGrid>
      <Field label="Presupuesto estimado" hint="Opcional">
        <input
          className="input"
          inputMode="decimal"
          min="0.01"
          onChange={(event) => setBudgetAmount(event.target.value)}
          step="0.01"
          type="number"
          value={budgetAmount}
        />
      </Field>
      <section className="governance-options-editor">
        <div>
          <h3>Opciones de votación</h3>
          <p>Incluye al menos dos opciones diferentes.</p>
        </div>
        {options.map((option, index) => (
          <div className="governance-option-input" key={index}>
            <span>{index + 1}</span>
            <input
              className="input"
              onChange={(event) => updateOption(index, event.target.value)}
              required
              value={option}
            />
            {options.length > 2 ? (
              <Button
                aria-label="Eliminar opción"
                onClick={() =>
                  setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                ×
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          disabled={options.length >= 12}
          onClick={() => setOptions((current) => [...current, ''])}
          size="sm"
          type="button"
          variant="secondary"
        >
          Agregar opción
        </Button>
      </section>
      <section className="governance-support-editor">
        <div>
          <h3>Documentos de soporte</h3>
          <p>Después de crear el borrador podrás cargar cotizaciones y presupuestos privados.</p>
        </div>
      </section>
      <FormActions>
        <Button
          disabled={saving || !title || !description || options.some((option) => !option.trim())}
          type="submit"
        >
          {saving ? 'Creando…' : 'Crear propuesta en borrador'}
        </Button>
      </FormActions>
    </form>
  );
}

export function GovernancePage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManageGovernance(roles);
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [filters, setFilters] = useState({ query: '', status: '', category: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProposals(
        await apiRequest<GovernanceProposal[]>(
          `/v1/condominiums/${condominiumId}/governance-proposals`,
          session,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar las propuestas.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDrawer(null);
    setSelectedProposalId('');
    setDetail(null);
    setFilters({ query: '', status: '', category: '' });
  }, [condominiumId]);

  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId);
  const filteredProposals = useMemo(
    () => filterGovernanceProposals(proposals, filters),
    [proposals, filters],
  );
  const counts = useMemo(
    () => ({
      open: proposals.filter((proposal) => proposal.status === 'open').length,
      draft: proposals.filter((proposal) => proposal.status === 'draft').length,
      decided: proposals.filter((proposal) => ['approved', 'rejected'].includes(proposal.status))
        .length,
      endingSoon: proposals.filter(
        (proposal) =>
          proposal.status === 'open' &&
          Date.parse(proposal.closes_at) > Date.now() &&
          Date.parse(proposal.closes_at) < Date.now() + 3 * 86_400_000,
      ).length,
    }),
    [proposals],
  );

  const loadDetail = useCallback(
    async (proposal: GovernanceProposal) => {
      setSelectedProposalId(proposal.id);
      setDrawer('detail');
      setDetailLoading(true);
      setSelectedOptionId('');
      setSelectedUnitId('');
      try {
        const [options, attachments, eligibility, results] = await Promise.all([
          apiRequest<GovernanceOption[]>(
            `/v1/condominiums/${condominiumId}/governance-proposals/${proposal.id}/options`,
            session,
          ),
          apiRequest<GovernanceAttachment[]>(
            `/v1/condominiums/${condominiumId}/governance-proposals/${proposal.id}/attachments`,
            session,
          ).catch(() => []),
          apiRequest<GovernanceEligibility>(
            `/v1/condominiums/${condominiumId}/governance-proposals/${proposal.id}/eligibility`,
            session,
          ).catch(() => null),
          apiRequest<GovernanceResults>(
            `/v1/condominiums/${condominiumId}/governance-proposals/${proposal.id}/results`,
            session,
          ).catch(() => null),
        ]);
        setDetail({ options, attachments, eligibility, results });
        if (eligibility?.units.length === 1) setSelectedUnitId(eligibility.units[0]?.id ?? '');
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : 'No se pudo abrir la propuesta.',
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [condominiumId, session],
  );

  const transition = async (action: string) => {
    if (!selectedProposal) return;
    setActing(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/governance-proposals/${selectedProposal.id}/${action}`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: selectedProposal.version }),
        },
      );
      await load();
      setDrawer(null);
      setSelectedProposalId('');
      setMessage('Estado de la propuesta actualizado.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cambiar el estado.',
      );
    } finally {
      setActing(false);
    }
  };

  const castVote = async () => {
    if (!selectedProposal || !detail?.eligibility || !selectedOptionId) return;
    if (detail.eligibility.basis === 'one_per_unit' && !selectedUnitId) return;
    setActing(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/governance-proposals/${selectedProposal.id}/votes`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            optionId: selectedOptionId,
            unitId: detail.eligibility.basis === 'one_per_unit' ? selectedUnitId : undefined,
          }),
        },
      );
      await loadDetail(selectedProposal);
      setMessage('Tu voto fue registrado de forma segura.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo registrar el voto.',
      );
    } finally {
      setActing(false);
    }
  };

  if (loading && !proposals.length) return <GovernanceLoading />;

  return (
    <div className="governance-page">
      <PageHeader
        actions={
          manage ? (
            <Button onClick={() => setDrawer('create')} size="sm">
              Crear propuesta
            </Button>
          ) : null
        }
        description={`${condominiumName} · decisiones comunitarias con elegibilidad, quórum y trazabilidad.`}
        eyebrow="Participación comunitaria"
        title="Propuestas y votaciones"
      />

      {error ? <div className="governance-inline-alert">{error}</div> : null}
      {message ? (
        <div className="governance-success-alert">
          <CheckCircleIcon size={17} /> {message}
        </div>
      ) : null}

      <section aria-label="Indicadores de votación" className="governance-metrics-grid">
        <MetricCard
          detail="Propuestas que aceptan votos en este momento."
          icon={<VoteIcon size={20} />}
          label="Votaciones abiertas"
          tone="blue"
          value={String(counts.open)}
        />
        <MetricCard
          detail="Propuestas preparadas antes de publicar."
          icon={<AnnouncementsIcon size={20} />}
          label="Borradores"
          tone="navy"
          value={String(counts.draft)}
        />
        <MetricCard
          detail="Votaciones que cierran durante los próximos tres días."
          icon={<CommunityIcon size={20} />}
          label="Próximas a cerrar"
          tone="red"
          value={String(counts.endingSoon)}
        />
        <MetricCard
          detail="Propuestas aprobadas o rechazadas formalmente."
          icon={<CheckCircleIcon size={20} />}
          label="Decisiones tomadas"
          tone="green"
          value={String(counts.decided)}
        />
      </section>

      <Surface className="governance-workspace">
        <div className="governance-toolbar">
          <input
            aria-label="Buscar propuestas"
            className="input governance-search"
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
            placeholder="Buscar propuesta…"
            value={filters.query}
          />
          <Select
            aria-label="Filtrar estado"
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
            value={filters.status}
          >
            <option value="">Todos los estados</option>
            {Object.entries(governanceStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar categoría"
            onChange={(event) =>
              setFilters((current) => ({ ...current, category: event.target.value }))
            }
            value={filters.category}
          >
            <option value="">Todas las categorías</option>
            {categoryValues.map((value) => (
              <option key={value} value={value}>
                {governanceCategoryLabels[value]}
              </option>
            ))}
          </Select>
        </div>

        {filteredProposals.length ? (
          <div className="governance-card-grid">
            {filteredProposals.map((proposal) => (
              <button
                className="governance-card"
                key={proposal.id}
                onClick={() => void loadDetail(proposal)}
                type="button"
              >
                <div className="governance-card__heading">
                  <Badge tone={statusTone(proposal.status)}>
                    {governanceStatusLabels[proposal.status]}
                  </Badge>
                  <span>{governanceCategoryLabels[proposal.category]}</span>
                </div>
                <strong>{proposal.title}</strong>
                <p>{proposal.summary ?? proposal.description}</p>
                {proposal.budget_amount && proposal.currency_code ? (
                  <div className="governance-card__budget">
                    <ExpensesIcon size={17} />
                    {formatMoney(proposal.budget_amount, proposal.currency_code)}
                  </div>
                ) : null}
                <div className="governance-card__footer">
                  <span>{votingBasisLabels[proposal.voting_basis]}</span>
                  <span>Cierra {formatGovernanceDate(proposal.closes_at)}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            actionLabel="Crear propuesta"
            description="Crea una propuesta con opciones, fecha de cierre, quórum y documentos de soporte."
            icon={<VoteIcon size={28} />}
            onAction={() => setDrawer('create')}
            title="Todavía no hay propuestas"
          />
        )}
      </Surface>

      {drawer === 'create' ? (
        <DrawerShell
          eyebrow="Nueva decisión comunitaria"
          onClose={() => setDrawer(null)}
          title="Crear propuesta"
          wide
        >
          <CreateProposalForm
            condominiumId={condominiumId}
            onCreated={async () => {
              await load();
              setDrawer(null);
              setMessage('Propuesta creada como borrador.');
            }}
            session={session}
          />
        </DrawerShell>
      ) : null}

      {drawer === 'detail' && selectedProposal ? (
        <DrawerShell
          eyebrow="Detalle de la propuesta"
          onClose={() => setDrawer(null)}
          title={selectedProposal.title}
          wide
        >
          {detailLoading || !detail ? (
            <div className="governance-detail-loading">
              <Skeleton className="skeleton--card" />
              <Skeleton className="skeleton--card" />
            </div>
          ) : (
            <div className="governance-detail">
              <div className="governance-detail__summary">
                <div>
                  <Badge tone={statusTone(selectedProposal.status)}>
                    {governanceStatusLabels[selectedProposal.status]}
                  </Badge>
                  <span>{governanceCategoryLabels[selectedProposal.category]}</span>
                </div>
                <p>{selectedProposal.description}</p>
                <dl>
                  <div>
                    <dt>Base de votación</dt>
                    <dd>{votingBasisLabels[selectedProposal.voting_basis]}</dd>
                  </div>
                  <div>
                    <dt>Quórum requerido</dt>
                    <dd>{Number(selectedProposal.quorum_percentage).toFixed(0)}%</dd>
                  </div>
                  <div>
                    <dt>Cierre</dt>
                    <dd>{formatGovernanceDate(selectedProposal.closes_at)}</dd>
                  </div>
                  <div>
                    <dt>Presupuesto</dt>
                    <dd>
                      {selectedProposal.budget_amount && selectedProposal.currency_code
                        ? formatMoney(
                            selectedProposal.budget_amount,
                            selectedProposal.currency_code,
                          )
                        : 'No aplica'}
                    </dd>
                  </div>
                </dl>
              </div>

              <section className="governance-documents">
                <h3>Documentos de soporte</h3>
                {detail.attachments.length ? (
                  detail.attachments.map((attachment) =>
                    attachment.storage_key ? (
                      <div className="private-document-row" key={attachment.id}>
                        <div>
                          <AnnouncementsIcon size={17} />
                          <span>
                            <strong>{attachment.file_name}</strong>
                            <small>
                              {attachment.size_bytes
                                ? `${Math.max(1, Math.ceil(attachment.size_bytes / 1024))} KB · `
                                : ''}
                              {attachment.document_type}
                            </small>
                          </span>
                        </div>
                        <Button
                          onClick={() =>
                            void downloadPrivateDocument(
                              `/v1/condominiums/${condominiumId}/governance-proposals/${selectedProposal.id}/attachments/${attachment.id}/file`,
                              session,
                              attachment.file_name,
                            ).catch((downloadError: Error) => setError(downloadError.message))
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Descargar
                        </Button>
                      </div>
                    ) : attachment.url ? (
                      <a href={attachment.url} key={attachment.id} rel="noreferrer" target="_blank">
                        <AnnouncementsIcon size={17} />
                        <span>{attachment.file_name} · enlace anterior</span>
                      </a>
                    ) : null,
                  )
                ) : (
                  <p>No hay documentos adjuntos.</p>
                )}
                <PrivateDocumentUploader
                  defaultDocumentType={
                    selectedProposal.category === 'budget' ? 'budget' : 'support'
                  }
                  documentTypes={[
                    { value: 'quote', label: 'Cotización' },
                    { value: 'budget', label: 'Presupuesto' },
                    { value: 'support', label: 'Soporte' },
                    { value: 'minutes', label: 'Acta' },
                    { value: 'other', label: 'Otro' },
                  ]}
                  onUploaded={() => loadDetail(selectedProposal)}
                  path={`/v1/condominiums/${condominiumId}/governance-proposals/${selectedProposal.id}/attachments`}
                  session={session}
                  title="Adjuntar documento privado"
                />
              </section>

              <section className="governance-results">
                <div className="governance-section-heading">
                  <div>
                    <h3>Resultados</h3>
                    <p>
                      {detail.results
                        ? `${detail.results.votes_cast} de ${detail.results.eligible_count} votos elegibles.`
                        : 'Resultados no disponibles.'}
                    </p>
                  </div>
                  {detail.results ? (
                    <Badge tone={detail.results.quorum_met ? 'success' : 'warning'}>
                      {detail.results.quorum_met ? 'Quórum alcanzado' : 'Quórum pendiente'}
                    </Badge>
                  ) : null}
                </div>
                {detail.results?.options.map((option) => (
                  <article className="governance-result-row" key={option.id}>
                    <div>
                      <strong>{option.label}</strong>
                      <span>{option.votes} votos</span>
                    </div>
                    <div className="governance-result-track">
                      <span style={{ width: `${Math.min(Number(option.percentage), 100)}%` }} />
                    </div>
                    <b>{Number(option.percentage).toFixed(0)}%</b>
                  </article>
                ))}
              </section>

              {isProposalOpen(selectedProposal) ? (
                <section className="governance-vote-panel">
                  <div className="governance-section-heading">
                    <div>
                      <h3>Registrar voto</h3>
                      <p>
                        {detail.eligibility?.eligible
                          ? 'Selecciona una opción. El voto se registra una sola vez según la base definida.'
                          : 'Debes estar vinculado como propietario activo para votar.'}
                      </p>
                    </div>
                  </div>
                  {detail.eligibility?.eligible ? (
                    <>
                      {detail.eligibility.basis === 'one_per_unit' ? (
                        <Field label="Unidad representada">
                          <Select
                            onChange={(event) => setSelectedUnitId(event.target.value)}
                            value={selectedUnitId}
                          >
                            <option value="">Selecciona una unidad</option>
                            {detail.eligibility.units.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                Unidad {unit.code}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ) : null}
                      <div className="governance-option-list">
                        {detail.options.map((option) => {
                          const unitVote = detail.eligibility?.votes.find(
                            (vote) =>
                              vote.unit_id ===
                              (detail.eligibility?.basis === 'one_per_unit'
                                ? selectedUnitId
                                : null),
                          );
                          const alreadyVoted = Boolean(unitVote);
                          return (
                            <button
                              data-selected={selectedOptionId === option.id || undefined}
                              disabled={alreadyVoted}
                              key={option.id}
                              onClick={() => setSelectedOptionId(option.id)}
                              type="button"
                            >
                              <span />
                              <div>
                                <strong>{option.label}</strong>
                                {option.description ? <small>{option.description}</small> : null}
                              </div>
                              {alreadyVoted && unitVote?.option_id === option.id ? (
                                <Badge tone="success">Tu voto</Badge>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      <Button
                        disabled={
                          acting ||
                          !selectedOptionId ||
                          (detail.eligibility.basis === 'one_per_unit' && !selectedUnitId)
                        }
                        onClick={() => void castVote()}
                      >
                        Registrar voto
                      </Button>
                    </>
                  ) : (
                    <div className="governance-not-eligible">
                      <CommunityIcon size={22} />
                      <span>
                        Tu cuenta no tiene una propiedad activa asociada en este condominio.
                      </span>
                    </div>
                  )}
                </section>
              ) : null}

              <div className="governance-detail__actions">
                {nextGovernanceActions(selectedProposal.status).map((action) => (
                  <Button
                    disabled={acting}
                    key={action}
                    onClick={() => void transition(action)}
                    size="sm"
                    variant={action === 'reject' || action === 'archive' ? 'secondary' : 'primary'}
                  >
                    {action === 'open'
                      ? 'Abrir votación'
                      : action === 'close'
                        ? 'Cerrar votación'
                        : action === 'approve'
                          ? 'Aprobar propuesta'
                          : action === 'reject'
                            ? 'Rechazar propuesta'
                            : 'Archivar'}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DrawerShell>
      ) : null}
    </div>
  );
}
