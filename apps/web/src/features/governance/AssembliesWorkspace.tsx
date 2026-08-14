import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { canManageGovernance, useCondominiumRoles } from '../../lib/roles';
import './assemblies-workspace.css';

type AssemblyStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
type VotingBasis = 'one_per_owner' | 'one_per_unit';
type AttendanceMode = 'in_person' | 'remote' | 'proxy';

type Assembly = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  location: string | null;
  status: AssemblyStatus;
  voting_basis: VotingBasis;
  quorum_percentage: number | string;
  eligibility_count: number | null;
  minutes_body: string | null;
  minutes_published_at: string | null;
  version: number;
};

type AgendaItem = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  proposal_id: string | null;
};

type EligibilitySnapshot = {
  id: string;
  label: string;
  entity_kind: 'unit' | 'owner';
};

type Attendance = {
  id: string;
  eligibility_snapshot_id: string;
  mode: AttendanceMode;
};

type Quorum = {
  eligible: number;
  present: number;
  percentage: number;
  requiredPercentage: number;
  quorumMet: boolean;
};

type Resolution = {
  id: string;
  title: string;
  resolution_text: string;
  published_at: string | null;
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const statusLabel: Record<AssemblyStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const statusTone = (status: AssemblyStatus) => {
  if (status === 'completed') return 'success' as const;
  if (status === 'in_progress' || status === 'scheduled') return 'warning' as const;
  if (status === 'cancelled') return 'neutral' as const;
  return 'info' as const;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function AssembliesWorkspace({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManageGovernance(roles);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [selected, setSelected] = useState<Assembly | null>(null);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [eligibility, setEligibility] = useState<EligibilitySnapshot[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [quorum, setQuorum] = useState<Quorum | null>(null);
  const [drawer, setDrawer] = useState<'create' | 'detail' | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAssemblies(
        await apiRequest<Assembly[]>(`/v1/condominiums/${condominiumId}/assemblies`, session),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar las asambleas.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected(null);
    setDrawer(null);
  }, [condominiumId]);

  const openDetail = useCallback(
    async (assembly: Assembly) => {
      setSelected(assembly);
      setMinutes(assembly.minutes_body ?? '');
      setDrawer('detail');
      setDetailLoading(true);
      setError('');
      const base = `/v1/condominiums/${condominiumId}/assemblies/${assembly.id}`;
      const [agendaResult, resolutionsResult, eligibilityResult, attendanceResult, quorumResult] =
        await Promise.allSettled([
          apiRequest<AgendaItem[]>(`${base}/agenda`, session),
          apiRequest<Resolution[]>(`${base}/resolutions`, session),
          manage
            ? apiRequest<EligibilitySnapshot[]>(`${base}/eligibility`, session)
            : Promise.resolve([]),
          manage ? apiRequest<Attendance[]>(`${base}/attendance`, session) : Promise.resolve([]),
          manage && assembly.status === 'in_progress'
            ? apiRequest<Quorum>(`${base}/quorum`, session)
            : Promise.resolve(null),
        ]);
      setAgenda(agendaResult.status === 'fulfilled' ? agendaResult.value : []);
      setResolutions(resolutionsResult.status === 'fulfilled' ? resolutionsResult.value : []);
      setEligibility(eligibilityResult.status === 'fulfilled' ? eligibilityResult.value : []);
      setAttendance(attendanceResult.status === 'fulfilled' ? attendanceResult.value : []);
      setQuorum(quorumResult.status === 'fulfilled' ? quorumResult.value : null);
      setDetailLoading(false);
    },
    [condominiumId, manage, session],
  );

  const refreshSelected = async (assemblyId = selected?.id) => {
    await load();
    if (!assemblyId) return;
    const fresh = await apiRequest<Assembly>(
      `/v1/condominiums/${condominiumId}/assemblies/${assemblyId}`,
      session,
    );
    await openDetail(fresh);
  };

  const transition = async (action: 'schedule' | 'start' | 'complete' | 'cancel') => {
    if (!selected) return;
    setActing(true);
    setError('');
    try {
      const updated = await apiRequest<Assembly>(
        `/v1/condominiums/${condominiumId}/assemblies/${selected.id}/transition`,
        session,
        { method: 'POST', body: JSON.stringify({ action, expectedVersion: selected.version }) },
      );
      setMessage(`Asamblea actualizada: ${statusLabel[updated.status]}.`);
      await refreshSelected(updated.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cambiar el estado.',
      );
    } finally {
      setActing(false);
    }
  };

  const saveMinutes = async () => {
    if (!selected || !minutes.trim()) return;
    setActing(true);
    setError('');
    try {
      const updated = await apiRequest<Assembly>(
        `/v1/condominiums/${condominiumId}/assemblies/${selected.id}/minutes`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ minutes, expectedVersion: selected.version }),
        },
      );
      setMessage('Borrador del acta guardado.');
      await refreshSelected(updated.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar el acta.',
      );
    } finally {
      setActing(false);
    }
  };

  const publishMinutes = async () => {
    if (!selected) return;
    setActing(true);
    setError('');
    try {
      const updated = await apiRequest<Assembly>(
        `/v1/condominiums/${condominiumId}/assemblies/${selected.id}/minutes/publish`,
        session,
        { method: 'POST', body: JSON.stringify({ expectedVersion: selected.version }) },
      );
      setMessage('Acta publicada. Ya no puede modificarse.');
      await refreshSelected(updated.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo publicar el acta.',
      );
    } finally {
      setActing(false);
    }
  };

  const presentIds = useMemo(
    () => new Set(attendance.map((record) => record.eligibility_snapshot_id)),
    [attendance],
  );

  return (
    <div className="assemblies-page">
      <PageHeader
        actions={
          manage ? <Button onClick={() => setDrawer('create')}>Nueva asamblea</Button> : null
        }
        description={`${condominiumName} · agenda, asistencia, quórum, actas y resoluciones con historial protegido.`}
        eyebrow="Gobernanza formal"
        title="Asambleas y actas"
      />

      {error ? <div className="governance-inline-alert">{error}</div> : null}
      {message ? <div className="governance-success-alert">{message}</div> : null}

      {loading ? (
        <div className="assemblies-grid">
          <Skeleton className="skeleton--card" />
          <Skeleton className="skeleton--card" />
          <Skeleton className="skeleton--card" />
        </div>
      ) : assemblies.length ? (
        <div className="assemblies-grid" aria-label="Asambleas">
          {assemblies.map((assembly) => (
            <button
              className="assembly-card"
              key={assembly.id}
              onClick={() => void openDetail(assembly)}
              type="button"
            >
              <div className="assembly-card__top">
                <Badge tone={statusTone(assembly.status)}>{statusLabel[assembly.status]}</Badge>
                <span>
                  {assembly.voting_basis === 'one_per_unit' ? 'Por unidad' : 'Por propietario'}
                </span>
              </div>
              <strong>{assembly.title}</strong>
              <p>{assembly.description || 'Reunión formal del condominio.'}</p>
              <div className="assembly-card__footer">
                <span>{formatDate(assembly.scheduled_at)}</span>
                <span>{assembly.location || 'Ubicación por definir'}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Surface>
          <EmptyState
            actionLabel={manage ? 'Crear asamblea' : undefined}
            description="Las reuniones formales aparecerán aquí con su agenda, estado y publicación final."
            onAction={manage ? () => setDrawer('create') : undefined}
            title="Aún no hay asambleas"
          />
        </Surface>
      )}

      {drawer === 'create' ? (
        <CreateAssemblyDrawer
          condominiumId={condominiumId}
          onClose={() => setDrawer(null)}
          onCreated={async (assembly) => {
            setMessage('Asamblea creada como borrador.');
            setDrawer(null);
            await load();
            await openDetail(assembly);
          }}
          session={session}
        />
      ) : null}

      {drawer === 'detail' && selected ? (
        <Drawer
          eyebrow="Asamblea"
          onClose={() => setDrawer(null)}
          prefix="governance"
          title={selected.title}
          wide
        >
          {detailLoading ? (
            <div className="assemblies-detail-loading">
              <Skeleton className="skeleton--card" />
              <Skeleton className="skeleton--card" />
            </div>
          ) : (
            <div className="assemblies-detail">
              <Surface className="assemblies-detail__summary">
                <div>
                  <Badge tone={statusTone(selected.status)}>{statusLabel[selected.status]}</Badge>
                </div>
                <dl>
                  <div>
                    <dt>Fecha</dt>
                    <dd>{formatDate(selected.scheduled_at)}</dd>
                  </div>
                  <div>
                    <dt>Lugar</dt>
                    <dd>{selected.location || 'Por definir'}</dd>
                  </div>
                  <div>
                    <dt>Base</dt>
                    <dd>
                      {selected.voting_basis === 'one_per_unit'
                        ? 'Un voto por unidad'
                        : 'Un voto por propietario'}
                    </dd>
                  </div>
                  <div>
                    <dt>Quórum</dt>
                    <dd>{Number(selected.quorum_percentage).toFixed(0)}%</dd>
                  </div>
                </dl>
                {manage ? (
                  <LifecycleActions acting={acting} assembly={selected} onTransition={transition} />
                ) : null}
              </Surface>

              <Surface>
                <h3>Agenda</h3>
                {agenda.length ? (
                  <ol className="assemblies-list">
                    {agenda.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        {item.description ? <p>{item.description}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>Sin puntos de agenda.</p>
                )}
                {manage && ['draft', 'scheduled'].includes(selected.status) ? (
                  <AgendaForm
                    assembly={selected}
                    condominiumId={condominiumId}
                    nextOrder={agenda.length}
                    onCreated={() => void refreshSelected()}
                    session={session}
                  />
                ) : null}
              </Surface>

              {manage && selected.status === 'in_progress' ? (
                <Surface>
                  <h3>Asistencia y quórum</h3>
                  {quorum ? (
                    <div className="assembly-quorum" data-met={quorum.quorumMet || undefined}>
                      <strong>
                        {quorum.present} / {quorum.eligible}
                      </strong>
                      <span>
                        {Number(quorum.percentage).toFixed(0)}% presentes · requiere{' '}
                        {Number(quorum.requiredPercentage).toFixed(0)}%
                      </span>
                      <Badge tone={quorum.quorumMet ? 'success' : 'warning'}>
                        {quorum.quorumMet ? 'Quórum alcanzado' : 'Quórum pendiente'}
                      </Badge>
                    </div>
                  ) : null}
                  <div className="assemblies-attendance">
                    {eligibility.map((snapshot) => (
                      <div key={snapshot.id}>
                        <span>{snapshot.label}</span>
                        {presentIds.has(snapshot.id) ? (
                          <strong>Presente</strong>
                        ) : (
                          <Button
                            disabled={acting}
                            onClick={async () => {
                              setActing(true);
                              setError('');
                              try {
                                await apiRequest(
                                  `/v1/condominiums/${condominiumId}/assemblies/${selected.id}/attendance`,
                                  session,
                                  {
                                    method: 'POST',
                                    body: JSON.stringify({
                                      snapshotId: snapshot.id,
                                      mode: 'in_person',
                                    }),
                                  },
                                );
                                await refreshSelected();
                              } catch (requestError) {
                                setError(
                                  requestError instanceof Error
                                    ? requestError.message
                                    : 'No se pudo registrar asistencia.',
                                );
                              } finally {
                                setActing(false);
                              }
                            }}
                            size="sm"
                            variant="secondary"
                          >
                            Marcar presente
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </Surface>
              ) : null}

              {manage && ['in_progress', 'completed'].includes(selected.status) ? (
                <Surface>
                  <h3>Acta</h3>
                  <textarea
                    className="textarea assemblies-minutes"
                    disabled={Boolean(selected.minutes_published_at)}
                    onChange={(event) => setMinutes(event.target.value)}
                    rows={10}
                    value={minutes}
                  />
                  <div className="assemblies-actions">
                    {selected.minutes_published_at ? (
                      <Badge tone="success">Acta publicada</Badge>
                    ) : (
                      <Button
                        disabled={acting || minutes.trim().length < 2}
                        onClick={() => void saveMinutes()}
                      >
                        Guardar borrador
                      </Button>
                    )}
                    {selected.status === 'completed' &&
                    !selected.minutes_published_at &&
                    Boolean(selected.minutes_body) ? (
                      <Button
                        disabled={acting}
                        onClick={() => void publishMinutes()}
                        variant="secondary"
                      >
                        Publicar acta
                      </Button>
                    ) : null}
                  </div>
                </Surface>
              ) : null}

              <Surface>
                <h3>Resoluciones</h3>
                {resolutions.length ? (
                  <div className="assemblies-resolutions">
                    {resolutions.map((resolution) => (
                      <article key={resolution.id}>
                        <div>
                          <strong>{resolution.title}</strong>
                          <Badge tone={resolution.published_at ? 'success' : 'info'}>
                            {resolution.published_at ? 'Publicada' : 'Borrador'}
                          </Badge>
                        </div>
                        <p>{resolution.resolution_text}</p>
                        {manage && !resolution.published_at ? (
                          <Button
                            disabled={acting}
                            onClick={async () => {
                              setActing(true);
                              setError('');
                              try {
                                await apiRequest(
                                  `/v1/condominiums/${condominiumId}/assemblies/${selected.id}/resolutions/${resolution.id}/publish`,
                                  session,
                                  { method: 'POST' },
                                );
                                await refreshSelected();
                              } catch (requestError) {
                                setError(
                                  requestError instanceof Error
                                    ? requestError.message
                                    : 'No se pudo publicar la resolución.',
                                );
                              } finally {
                                setActing(false);
                              }
                            }}
                            size="sm"
                            variant="secondary"
                          >
                            Publicar resolución
                          </Button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>Sin resoluciones registradas.</p>
                )}
                {manage && ['in_progress', 'completed'].includes(selected.status) ? (
                  <ResolutionForm
                    assembly={selected}
                    condominiumId={condominiumId}
                    onCreated={() => void refreshSelected()}
                    session={session}
                  />
                ) : null}
              </Surface>
            </div>
          )}
        </Drawer>
      ) : null}
    </div>
  );
}

function LifecycleActions({
  acting,
  assembly,
  onTransition,
}: {
  acting: boolean;
  assembly: Assembly;
  onTransition: (action: 'schedule' | 'start' | 'complete' | 'cancel') => Promise<void>;
}) {
  return (
    <div className="assemblies-actions">
      {assembly.status === 'draft' ? (
        <>
          <Button disabled={acting} onClick={() => void onTransition('schedule')}>
            Programar
          </Button>
          <Button disabled={acting} onClick={() => void onTransition('cancel')} variant="secondary">
            Cancelar
          </Button>
        </>
      ) : null}
      {assembly.status === 'scheduled' ? (
        <>
          <Button disabled={acting} onClick={() => void onTransition('start')}>
            Iniciar y congelar elegibilidad
          </Button>
          <Button disabled={acting} onClick={() => void onTransition('cancel')} variant="secondary">
            Cancelar
          </Button>
        </>
      ) : null}
      {assembly.status === 'in_progress' ? (
        <Button disabled={acting} onClick={() => void onTransition('complete')}>
          Completar asamblea
        </Button>
      ) : null}
    </div>
  );
}

function CreateAssemblyDrawer({
  condominiumId,
  session,
  onClose,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  onClose: () => void;
  onCreated: (assembly: Assembly) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState(
    localDateTime(new Date(Date.now() + 7 * 86_400_000)),
  );
  const [location, setLocation] = useState('');
  const [basis, setBasis] = useState<VotingBasis>('one_per_unit');
  const [quorum, setQuorum] = useState('50');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const assembly = await apiRequest<Assembly>(
        `/v1/condominiums/${condominiumId}/assemblies`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            description: description || null,
            scheduledAt: new Date(scheduledAt).toISOString(),
            location: location || null,
            votingBasis: basis,
            quorumPercentage: Number(quorum),
          }),
        },
      );
      await onCreated(assembly);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la asamblea.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      eyebrow="Gobernanza formal"
      onClose={onClose}
      prefix="governance"
      title="Nueva asamblea"
      wide
    >
      <form className="assemblies-form" onSubmit={submit}>
        {error ? <div className="governance-inline-alert">{error}</div> : null}
        <Field label="Título">
          <input
            className="input"
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            className="textarea"
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            value={description}
          />
        </Field>
        <div className="assemblies-form__grid">
          <Field label="Fecha y hora">
            <input
              className="input"
              onChange={(event) => setScheduledAt(event.target.value)}
              required
              type="datetime-local"
              value={scheduledAt}
            />
          </Field>
          <Field label="Lugar">
            <input
              className="input"
              onChange={(event) => setLocation(event.target.value)}
              value={location}
            />
          </Field>
        </div>
        <div className="assemblies-form__grid">
          <Field label="Base de votación">
            <Select onChange={(event) => setBasis(event.target.value as VotingBasis)} value={basis}>
              <option value="one_per_unit">Un voto por unidad</option>
              <option value="one_per_owner">Un voto por propietario</option>
            </Select>
          </Field>
          <Field label="Quórum requerido (%)">
            <input
              className="input"
              max="100"
              min="0"
              onChange={(event) => setQuorum(event.target.value)}
              type="number"
              value={quorum}
            />
          </Field>
        </div>
        <Button disabled={saving || title.trim().length < 2} type="submit">
          {saving ? 'Creando…' : 'Crear borrador'}
        </Button>
      </form>
    </Drawer>
  );
}

function AgendaForm({
  assembly,
  condominiumId,
  nextOrder,
  session,
  onCreated,
}: {
  assembly: Assembly;
  condominiumId: string;
  nextOrder: number;
  session: Session;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/assemblies/${assembly.id}/agenda`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ title, description: description || null, sortOrder: nextOrder }),
        },
      );
      setTitle('');
      setDescription('');
      onCreated();
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="assemblies-inline-form" onSubmit={submit}>
      <Field label="Nuevo punto">
        <input
          className="input"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Tema de agenda"
          value={title}
        />
      </Field>
      <Field label="Detalle">
        <input
          className="input"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </Field>
      <Button disabled={saving || title.trim().length < 2} size="sm" type="submit">
        Agregar
      </Button>
    </form>
  );
}

function ResolutionForm({
  assembly,
  condominiumId,
  session,
  onCreated,
}: {
  assembly: Assembly;
  condominiumId: string;
  session: Session;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/assemblies/${assembly.id}/resolutions`,
        session,
        { method: 'POST', body: JSON.stringify({ title, body }) },
      );
      setTitle('');
      setBody('');
      onCreated();
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="assemblies-resolution-form" onSubmit={submit}>
      <Field label="Título">
        <input className="input" onChange={(event) => setTitle(event.target.value)} value={title} />
      </Field>
      <Field label="Resolución">
        <textarea
          className="textarea"
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          value={body}
        />
      </Field>
      <Button
        disabled={saving || title.trim().length < 2 || body.trim().length < 2}
        size="sm"
        type="submit"
      >
        Registrar resolución
      </Button>
    </form>
  );
}
