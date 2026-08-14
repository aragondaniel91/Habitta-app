import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button, EmptyState, Field, Select, Surface } from '../../components/ui';
import { Drawer } from '../../components/Drawer';
import { apiRequest } from '../../lib/api';
import { canManageGovernance, useCondominiumRoles } from '../../lib/roles';

type AssemblyStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
type VotingBasis = 'one_per_owner' | 'one_per_unit';
type AttendanceMode = 'in_person' | 'remote' | 'proxy';

type Assembly = {
  id: string;
  condominium_id: string;
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
  entity_kind: 'unit' | 'owner';
  label: string;
  unit_id: string | null;
  person_id: string | null;
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
  session: Session;
};

const statusLabels: Record<AssemblyStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const toInputDateTime = (value: Date) => {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
};

export function AssembliesWorkspace({ condominiumId, session }: Props) {
  const roles = useCondominiumRoles();
  const canManage = canManageGovernance(roles);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [selected, setSelected] = useState<Assembly | null>(null);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [eligibility, setEligibility] = useState<EligibilitySnapshot[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [quorum, setQuorum] = useState<Quorum | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState<'create' | 'detail' | null>(null);
  const [minutes, setMinutes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAssemblies(
        await apiRequest<Assembly[]>(`/v1/condominiums/${condominiumId}/assemblies`, session),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las asambleas.');
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
      setDrawer('detail');
      setMinutes(assembly.minutes_body ?? '');
      setError('');
      const base = `/v1/condominiums/${condominiumId}/assemblies/${assembly.id}`;
      const [agendaResult, eligibilityResult, attendanceResult, quorumResult, resolutionsResult] =
        await Promise.allSettled([
          apiRequest<AgendaItem[]>(`${base}/agenda`, session),
          canManage ? apiRequest<EligibilitySnapshot[]>(`${base}/eligibility`, session) : Promise.resolve([]),
          canManage ? apiRequest<Attendance[]>(`${base}/attendance`, session) : Promise.resolve([]),
          canManage && assembly.status === 'in_progress'
            ? apiRequest<Quorum>(`${base}/quorum`, session)
            : Promise.resolve(null),
          apiRequest<Resolution[]>(`${base}/resolutions`, session),
        ]);
      setAgenda(agendaResult.status === 'fulfilled' ? agendaResult.value : []);
      setEligibility(eligibilityResult.status === 'fulfilled' ? eligibilityResult.value : []);
      setAttendance(attendanceResult.status === 'fulfilled' ? attendanceResult.value : []);
      setQuorum(quorumResult.status === 'fulfilled' ? quorumResult.value : null);
      setResolutions(resolutionsResult.status === 'fulfilled' ? resolutionsResult.value : []);
    },
    [canManage, condominiumId, session],
  );

  const refreshSelected = async (next?: Assembly) => {
    const target = next ?? selected;
    await load();
    if (target) await openDetail(target);
  };

  const transition = async (action: 'schedule' | 'start' | 'complete' | 'cancel') => {
    if (!selected) return;
    setActing(true);
    setError('');
    try {
      const updated = await apiRequest<Assembly>(
        `/v1/condominiums/${condominiumId}/assemblies/${selected.id}/transition`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ action, expectedVersion: selected.version }),
        },
      );
      setMessage(`Asamblea: ${statusLabels[updated.status]}.`);
      await refreshSelected(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo cambiar el estado.');
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
      await refreshSelected(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el acta.');
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
      setMessage('Acta publicada e inmutable.');
      await refreshSelected(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo publicar el acta.');
    } finally {
      setActing(false);
    }
  };

  const attendanceIds = useMemo(
    () => new Set(attendance.map((item) => item.eligibility_snapshot_id)),
    [attendance],
  );

  return (
    <section className="assemblies-workspace" aria-label="Asambleas y actas">
      <div className="assemblies-workspace__heading">
        <div>
          <span>Gobernanza formal</span>
          <h2>Asambleas, actas y resoluciones</h2>
          <p>Programa reuniones, congela elegibilidad al iniciar y conserva decisiones publicadas.</p>
        </div>
        {canManage ? <Button onClick={() => setDrawer('create')}>Nueva asamblea</Button> : null}
      </div>

      {message ? <div className="governance-inline-alert">{message}</div> : null}
      {error ? <div className="governance-inline-alert">{error}</div> : null}

      {loading ? (
        <Surface>Cargando asambleas…</Surface>
      ) : assemblies.length ? (
        <div className="assemblies-workspace__grid">
          {assemblies.map((assembly) => (
            <button key={assembly.id} onClick={() => void openDetail(assembly)} type="button">
              <span>{statusLabels[assembly.status]}</span>
              <strong>{assembly.title}</strong>
              <small>{formatDateTime(assembly.scheduled_at)}</small>
              <small>{assembly.location || 'Ubicación por definir'}</small>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Las reuniones formales aparecerán aquí cuando sean creadas."
          title="Aún no hay asambleas"
        />
      )}

      {drawer === 'create' ? (
        <CreateAssemblyDrawer
          condominiumId={condominiumId}
          onClose={() => setDrawer(null)}
          onCreated={async (assembly) => {
            setDrawer(null);
            setMessage('Asamblea creada en borrador.');
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
          <div className="assemblies-detail">
            <div className="assemblies-detail__meta">
              <strong>{statusLabels[selected.status]}</strong>
              <span>{formatDateTime(selected.scheduled_at)}</span>
              <span>{selected.location || 'Ubicación por definir'}</span>
              <span>
                {selected.voting_basis === 'one_per_unit' ? 'Un voto por unidad' : 'Un voto por propietario'} · Quórum {selected.quorum_percentage}%
              </span>
            </div>

            {canManage ? (
              <div className="assemblies-detail__actions">
                {selected.status === 'draft' ? (
                  <>
                    <Button disabled={acting} onClick={() => void transition('schedule')}>Programar</Button>
                    <Button disabled={acting} onClick={() => void transition('cancel')} variant="secondary">Cancelar</Button>
                  </>
                ) : null}
                {selected.status === 'scheduled' ? (
                  <>
                    <Button disabled={acting} onClick={() => void transition('start')}>Iniciar y congelar elegibilidad</Button>
                    <Button disabled={acting} onClick={() => void transition('cancel')} variant="secondary">Cancelar</Button>
                  </>
                ) : null}
                {selected.status === 'in_progress' ? (
                  <Button disabled={acting} onClick={() => void transition('complete')}>Completar asamblea</Button>
                ) : null}
              </div>
            ) : null}

            <Surface>
              <h3>Agenda</h3>
              {agenda.length ? (
                <ol className="assemblies-detail__list">
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
              {canManage && ['draft', 'scheduled'].includes(selected.status) ? (
                <AgendaItemForm
                  assembly={selected}
                  condominiumId={condominiumId}
                  nextSortOrder={agenda.length}
                  onCreated={() => void refreshSelected(selected)}
                  session={session}
                />
              ) : null}
            </Surface>

            {canManage && selected.status === 'in_progress' ? (
              <Surface>
                <h3>Asistencia y quórum</h3>
                {quorum ? (
                  <p>
                    {quorum.present} de {quorum.eligible} presentes · {quorum.percentage}% ·{' '}
                    <strong>{quorum.quorumMet ? 'Quórum alcanzado' : 'Quórum pendiente'}</strong>
                  </p>
                ) : null}
                <div className="assemblies-attendance">
                  {eligibility.map((snapshot) => (
                    <div key={snapshot.id}>
                      <span>{snapshot.label}</span>
                      {attendanceIds.has(snapshot.id) ? (
                        <strong>Presente</strong>
                      ) : (
                        <Button
                          disabled={acting}
                          onClick={async () => {
                            setActing(true);
                            try {
                              await apiRequest(
                                `/v1/condominiums/${condominiumId}/assemblies/${selected.id}/attendance`,
                                session,
                                {
                                  method: 'POST',
                                  body: JSON.stringify({ snapshotId: snapshot.id, mode: 'in_person' }),
                                },
                              );
                              await refreshSelected(selected);
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

            {canManage && ['in_progress', 'completed'].includes(selected.status) ? (
              <Surface>
                <h3>Acta</h3>
                <textarea
                  className="textarea"
                  disabled={Boolean(selected.minutes_published_at)}
                  onChange={(event) => setMinutes(event.target.value)}
                  rows={10}
                  value={minutes}
                />
                <div className="assemblies-detail__actions">
                  {!selected.minutes_published_at ? (
                    <Button disabled={acting || !minutes.trim()} onClick={() => void saveMinutes()}>
                      Guardar borrador
                    </Button>
                  ) : <strong>Acta publicada</strong>}
                  {selected.status === 'completed' && !selected.minutes_published_at && selected.minutes_body ? (
                    <Button disabled={acting} onClick={() => void publishMinutes()} variant="secondary">
                      Publicar acta
                    </Button>
                  ) : null}
                </div>
              </Surface>
            ) : null}

            <Surface>
              <h3>Resoluciones</h3>
              {resolutions.length ? (
                <div className="assemblies-detail__list">
                  {resolutions.map((resolution) => (
                    <article key={resolution.id}>
                      <strong>{resolution.title}</strong>
                      <p>{resolution.resolution_text}</p>
                      <small>{resolution.published_at ? 'Publicada' : 'Borrador'}</small>
                    </article>
                  ))}
                </div>
              ) : <p>Sin resoluciones registradas.</p>}
              {canManage && ['in_progress', 'completed'].includes(selected.status) ? (
                <ResolutionForm
                  assembly={selected}
                  condominiumId={condominiumId}
                  onCreated={() => void refreshSelected(selected)}
                  session={session}
                />
              ) : null}
            </Surface>
          </div>
        </Drawer>
      ) : null}
    </section>
  );
}

function CreateAssemblyDrawer({ condominiumId, session, onClose, onCreated }: Props & {
  onClose: () => void;
  onCreated: (assembly: Assembly) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState(toInputDateTime(new Date(Date.now() + 86_400_000)));
  const [location, setLocation] = useState('');
  const [basis, setBasis] = useState<VotingBasis>('one_per_unit');
  const [quorum, setQuorum] = useState('50');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const assembly = await apiRequest<Assembly>(`/v1/condominiums/${condominiumId}/assemblies`, session, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description || null,
          scheduledAt: new Date(scheduledAt).toISOString(),
          location: location || null,
          votingBasis: basis,
          quorumPercentage: Number(quorum),
        }),
      });
      await onCreated(assembly);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer eyebrow="Gobernanza formal" onClose={onClose} prefix="governance" title="Nueva asamblea">
      <form className="governance-form" onSubmit={(event) => void submit(event)}>
        <Field label="Título"><input className="input" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Descripción"><textarea className="textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="Fecha y hora"><input className="input" required type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></Field>
        <Field label="Ubicación"><input className="input" value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
        <Field label="Base de elegibilidad">
          <Select value={basis} onChange={(event) => setBasis(event.target.value as VotingBasis)}>
            <option value="one_per_unit">Una por unidad</option>
            <option value="one_per_owner">Una por propietario</option>
          </Select>
        </Field>
        <Field label="Quórum requerido (%)"><input className="input" max="100" min="0" step="0.01" type="number" value={quorum} onChange={(event) => setQuorum(event.target.value)} /></Field>
        <Button disabled={saving || !title.trim()} type="submit">{saving ? 'Creando…' : 'Crear borrador'}</Button>
      </form>
    </Drawer>
  );
}

function AgendaItemForm({ condominiumId, assembly, nextSortOrder, session, onCreated }: Props & {
  assembly: Assembly;
  nextSortOrder: number;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  return (
    <form
      className="assemblies-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        await apiRequest(`/v1/condominiums/${condominiumId}/assemblies/${assembly.id}/agenda`, session, {
          method: 'POST',
          body: JSON.stringify({ title, description: description || null, sortOrder: nextSortOrder }),
        });
        setTitle('');
        setDescription('');
        onCreated();
      }}
    >
      <Field label="Nuevo punto"><input className="input" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Descripción"><input className="input" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <Button size="sm" type="submit">Agregar a agenda</Button>
    </form>
  );
}

function ResolutionForm({ condominiumId, assembly, session, onCreated }: Props & {
  assembly: Assembly;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <form
      className="assemblies-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        await apiRequest(`/v1/condominiums/${condominiumId}/assemblies/${assembly.id}/resolutions`, session, {
          method: 'POST',
          body: JSON.stringify({ title, body }),
        });
        setTitle('');
        setBody('');
        onCreated();
      }}
    >
      <Field label="Nueva resolución"><input className="input" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Texto"><textarea className="textarea" required rows={4} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
      <Button size="sm" type="submit">Registrar resolución</Button>
    </form>
  );
}
