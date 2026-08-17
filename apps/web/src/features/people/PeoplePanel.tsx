import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../../components/Dialog';
import { Drawer } from '../../components/Drawer';
import { CheckCircleIcon, PeopleIcon, UnitsIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import {
  createResidentInvitation,
  listResidentInvitationDeliveryEvents,
  listResidentInvitations,
  residentDeliveryLabel,
  residentRoleLabel,
  revokeResidentInvitation,
  type ResidentInvitation,
  type ResidentInvitationDelivery,
  type ResidentInvitationDeliveryEvent,
  type ResidentRole,
} from '../../lib/residentAccess';
import { peopleApi } from './api';
import {
  condominiumRelationshipLabels,
  directoryUnitLabel,
  occupancyLabels,
  personSearchText,
  residentAccessOptions,
  residentInvitationDisplayStatus,
  residentInvitationStatusLabels,
  unitContextLabel,
} from './relationship-model';
import type {
  Building,
  CondominiumRelationship,
  CondominiumRelationshipType,
  Occupancy,
  Ownership,
  Person,
  PersonRelationshipView,
  Preview,
  Unit,
} from './types';
import './people-workspace.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type PersonDraft = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive';
};

type PendingClose =
  | { kind: 'ownership'; id: string; label: string }
  | { kind: 'occupancy'; id: string; label: string }
  | { kind: 'condominium'; id: string; label: string }
  | null;

type LatestInvitation = {
  url: string;
  role: ResidentRole;
  unitLabel: string;
  delivery: ResidentInvitationDelivery;
};

const emptyPersonDraft: PersonDraft = {
  firstName: '',
  lastName: '',
  documentType: '',
  documentNumber: '',
  email: '',
  phone: '',
  status: 'active',
};

const occupancyTypeOptions = Object.entries(occupancyLabels) as [
  Occupancy['occupancy_type'],
  string,
][];
const condominiumRelationshipOptions = Object.entries(condominiumRelationshipLabels) as [
  CondominiumRelationshipType,
  string,
][];

function personName(person: Person) {
  return `${person.first_name} ${person.last_name}`.trim();
}

function personInitials(person: Person) {
  return (
    `${person.first_name.trim().charAt(0)}${person.last_name.trim().charAt(0)}`.toUpperCase() || '—'
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value));
}

function invitationTone(status: ResidentInvitation['status']) {
  if (status === 'accepted') return 'success' as const;
  if (status === 'pending') return 'info' as const;
  if (status === 'expired') return 'warning' as const;
  return 'neutral' as const;
}

function deliveryTone(event?: ResidentInvitationDeliveryEvent) {
  if (event?.event_type === 'email_sent') return 'success' as const;
  if (event?.event_type === 'email_failed') return 'warning' as const;
  return 'neutral' as const;
}

export function PeoplePanel({ condominiumId, condominiumName, session }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [ownerships, setOwnerships] = useState<Ownership[]>([]);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);
  const [condominiumRelationships, setCondominiumRelationships] = useState<
    CondominiumRelationship[]
  >([]);
  const [invitations, setInvitations] = useState<ResidentInvitation[]>([]);
  const [deliveryEvents, setDeliveryEvents] = useState<ResidentInvitationDeliveryEvent[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [personEditorOpen, setPersonEditorOpen] = useState(false);
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPersonDraft);
  const [editingPersonId, setEditingPersonId] = useState('');
  const [ownershipDraft, setOwnershipDraft] = useState({ unitId: '', percentage: '' });
  const [occupancyDraft, setOccupancyDraft] = useState({
    unitId: '',
    occupancyType: 'tenant' as Occupancy['occupancy_type'],
  });
  const [relationshipDraft, setRelationshipDraft] = useState({
    relationshipType: 'board_member' as CondominiumRelationshipType,
    title: '',
  });
  const [inviteRole, setInviteRole] = useState<ResidentRole>('owner');
  const [inviteUnitId, setInviteUnitId] = useState('');
  const [latestInvitation, setLatestInvitation] = useState<LatestInvitation | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingClose>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ResidentInvitation | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [peopleItems, unitItems, buildingItems] = await Promise.all([
        peopleApi<Person[]>(`/v1/condominiums/${condominiumId}/people`, session),
        peopleApi<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
        peopleApi<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
      ]);
      setPeople(peopleItems);
      setUnits(unitItems);
      setBuildings(buildingItems);
      setSelected((current) =>
        current ? (peopleItems.find((person) => person.id === current.id) ?? current) : current,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cargar Personas.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  const loadPersonContext = useCallback(
    async (personId: string) => {
      const [view, invitationItems, deliveryItems] = await Promise.all([
        peopleApi<PersonRelationshipView>(
          `/v1/condominiums/${condominiumId}/people/${personId}/relationships`,
          session,
        ),
        listResidentInvitations(condominiumId, personId),
        listResidentInvitationDeliveryEvents(condominiumId, personId),
      ]);
      setSelected(view.person);
      setOwnerships(view.ownerships);
      setOccupancies(view.occupancies);
      setCondominiumRelationships(view.condominiumRelationships);
      setInvitations(invitationItems);
      setDeliveryEvents(deliveryItems);
    },
    [condominiumId, session],
  );

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    setSelected(null);
    setOwnerships([]);
    setOccupancies([]);
    setCondominiumRelationships([]);
    setInvitations([]);
    setDeliveryEvents([]);
    setLatestInvitation(null);
    setPendingClose(null);
    setPendingRevoke(null);
  }, [condominiumId]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return people.filter((person) => {
      const matchesQuery = !normalizedQuery || personSearchText(person).includes(normalizedQuery);
      const status = person.status === 'inactive' ? 'inactive' : 'active';
      return matchesQuery && (!statusFilter || status === statusFilter);
    });
  }, [people, query, statusFilter]);

  const accessOptions = useMemo(
    () => residentAccessOptions(ownerships, occupancies),
    [ownerships, occupancies],
  );
  const deliveryByInvitationId = useMemo(() => {
    const latest = new Map<string, ResidentInvitationDeliveryEvent>();
    for (const event of deliveryEvents) {
      if (!latest.has(event.invitation_id)) latest.set(event.invitation_id, event);
    }
    return latest;
  }, [deliveryEvents]);
  const inviteUnits = accessOptions.filter((option) => option.role === inviteRole);

  useEffect(() => {
    setInviteUnitId((current) => {
      if (current && inviteUnits.some((option) => option.unitId === current)) return current;
      return inviteUnits[0]?.unitId ?? '';
    });
  }, [inviteRole, accessOptions]);

  const activePeople = people.filter((person) => person.status !== 'inactive').length;
  const connectedPeople = people.filter((person) => Boolean(person.email || person.phone)).length;
  const selectedActiveRelationships =
    ownerships.filter((item) => !item.ends_at).length +
    occupancies.filter((item) => !item.ends_at).length +
    condominiumRelationships.filter((item) => !item.ends_at).length;

  const selectPerson = async (person: Person) => {
    setDetailLoading(true);
    setError('');
    setMessage('');
    setLatestInvitation(null);
    try {
      await loadPersonContext(person.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el perfil de la persona.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const openNewPerson = () => {
    setEditingPersonId('');
    setPersonDraft(emptyPersonDraft);
    setPersonEditorOpen(true);
  };

  const openEditPerson = () => {
    if (!selected) return;
    setEditingPersonId(selected.id);
    setPersonDraft({
      firstName: selected.first_name,
      lastName: selected.last_name,
      documentType: selected.document_type ?? '',
      documentNumber: selected.document_number ?? '',
      email: selected.email ?? '',
      phone: selected.phone ?? '',
      status: selected.status === 'inactive' ? 'inactive' : 'active',
    });
    setPersonEditorOpen(true);
  };

  const savePerson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyAction('person');
    setError('');
    setMessage('');
    const path = editingPersonId
      ? `/v1/condominiums/${condominiumId}/people/${editingPersonId}`
      : `/v1/condominiums/${condominiumId}/people`;
    try {
      const result = await peopleApi<Person[]>(path, session, {
        method: editingPersonId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          firstName: personDraft.firstName,
          lastName: personDraft.lastName,
          documentType: personDraft.documentType,
          documentNumber: personDraft.documentNumber,
          ...(personDraft.email ? { email: personDraft.email } : {}),
          ...(personDraft.phone ? { phone: personDraft.phone } : {}),
          status: personDraft.status,
        }),
      });
      const savedPerson = result[0];
      setPersonEditorOpen(false);
      await loadDirectory();
      if (savedPerson) await loadPersonContext(savedPerson.id);
      setMessage(editingPersonId ? 'Perfil actualizado.' : 'Persona creada y lista para vincular.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar la persona.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const createOwnership = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !ownershipDraft.unitId) return;
    setBusyAction('ownership');
    setError('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${selected.id}/ownerships`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            unitId: ownershipDraft.unitId,
            ...(ownershipDraft.percentage
              ? { ownershipPercentage: Number(ownershipDraft.percentage) }
              : {}),
            isPrimaryContact: true,
          }),
        },
      );
      setOwnershipDraft({ unitId: '', percentage: '' });
      await loadPersonContext(selected.id);
      setMessage(
        'Propiedad asociada; la persona sigue siendo un único registro aunque tenga varias unidades.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo asociar la propiedad.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const createOccupancy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !occupancyDraft.unitId) return;
    setBusyAction('occupancy');
    setError('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${selected.id}/occupancies`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            unitId: occupancyDraft.unitId,
            occupancyType: occupancyDraft.occupancyType,
            isPrimaryContact: true,
          }),
        },
      );
      setOccupancyDraft({ unitId: '', occupancyType: 'tenant' });
      await loadPersonContext(selected.id);
      setMessage('Ocupación asociada correctamente.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo asociar la ocupación.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const createCondominiumRelationship = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusyAction('condominium-relationship');
    setError('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${selected.id}/condominium-relationships`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            relationshipType: relationshipDraft.relationshipType,
            ...(relationshipDraft.title ? { title: relationshipDraft.title } : {}),
          }),
        },
      );
      setRelationshipDraft({ relationshipType: 'board_member', title: '' });
      await loadPersonContext(selected.id);
      setMessage('Relación con el condominio agregada.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo agregar la relación.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const confirmCloseRelationship = async () => {
    if (!selected || !pendingClose) return;
    setBusyAction(`close:${pendingClose.id}`);
    setError('');
    try {
      if (pendingClose.kind === 'condominium') {
        await peopleApi(
          `/v1/condominiums/${condominiumId}/people/${selected.id}/condominium-relationships/${pendingClose.id}`,
          session,
          {
            method: 'PATCH',
            body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
          },
        );
      } else {
        await peopleApi(
          `/v1/condominiums/${condominiumId}/${pendingClose.kind === 'ownership' ? 'unit-owners' : 'unit-occupancies'}/${pendingClose.id}`,
          session,
          {
            method: 'PATCH',
            body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
          },
        );
      }
      setPendingClose(null);
      await loadPersonContext(selected.id);
      setMessage('Relación cerrada. El historial se conserva y sigue siendo auditable.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cerrar la relación.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const issueInvitation = async (role: ResidentRole, unitId: string) => {
    if (!selected || !unitId) return;
    if (!selected.email) {
      setError('Agrega un correo válido a la persona antes de invitarla.');
      return;
    }
    const option = accessOptions.find((item) => item.role === role && item.unitId === unitId);
    if (!option) {
      setError(
        'La relación activa ya no es compatible con ese acceso. Actualiza el perfil e intenta nuevamente.',
      );
      return;
    }
    setBusyAction('invitation');
    setError('');
    setMessage('');
    setLatestInvitation(null);
    try {
      const result = await createResidentInvitation({
        condominiumId,
        personId: selected.id,
        unitId,
        role,
        session,
      });
      setLatestInvitation({
        url: result.invitationUrl,
        role,
        unitLabel: option.unitLabel,
        delivery: result.emailDelivery,
      });
      const [nextInvitations, nextDeliveryEvents] = await Promise.all([
        listResidentInvitations(condominiumId, selected.id),
        listResidentInvitationDeliveryEvents(condominiumId, selected.id),
      ]);
      setInvitations(nextInvitations);
      setDeliveryEvents(nextDeliveryEvents);
      if (result.emailDelivery.status === 'sent') {
        setMessage(
          result.emailDelivery.mode === 'sandbox'
            ? 'Invitación creada y correo transaccional enviado al buzón de pruebas de este ambiente.'
            : 'Invitación creada y correo transaccional enviado al residente.',
        );
      } else if (result.emailDelivery.status === 'failed') {
        setMessage(
          'Invitación creada, pero el correo no pudo enviarse. Usa el enlace seguro de respaldo.',
        );
      } else {
        setMessage(
          'Invitación creada. El envío automático está desactivado; usa el enlace seguro de respaldo.',
        );
      }
      if (!result.auditPersisted) {
        setError(
          'El resultado del correo no pudo guardarse en la auditoría. Conserva el enlace y revisa la integración antes de reenviar.',
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la invitación.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await issueInvitation(inviteRole, inviteUnitId);
  };

  const confirmRevokeInvitation = async () => {
    if (!selected || !pendingRevoke) return;
    setBusyAction(`revoke:${pendingRevoke.id}`);
    setError('');
    try {
      await revokeResidentInvitation(pendingRevoke.id);
      setPendingRevoke(null);
      setLatestInvitation(null);
      setInvitations(await listResidentInvitations(condominiumId, selected.id));
      setMessage('Invitación revocada. Ese enlace ya no podrá utilizarse.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo revocar la invitación.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const copyLatestInvitation = async () => {
    if (!latestInvitation) return;
    try {
      await navigator.clipboard.writeText(latestInvitation.url);
      setMessage('Enlace seguro copiado al portapapeles.');
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.');
    }
  };

  const previewCsv = async () => {
    if (!file) return;
    setBusyAction('preview-import');
    setError('');
    try {
      setPreview(
        await peopleApi(`/v1/condominiums/${condominiumId}/people/import/preview`, session, {
          method: 'POST',
          body: JSON.stringify({ csv: await file.text() }),
        }),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo revisar el CSV.');
    } finally {
      setBusyAction('');
    }
  };

  const commitImport = async () => {
    if (!preview) return;
    setBusyAction('commit-import');
    setError('');
    try {
      await peopleApi(`/v1/condominiums/${condominiumId}/people/import/commit`, session, {
        method: 'POST',
        body: JSON.stringify({ rows: preview.valid, idempotencyKey: crypto.randomUUID() }),
      });
      setPreview(null);
      setFile(null);
      await loadDirectory();
      setMessage('Importación de personas completada.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo importar el CSV.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const invitationUnitLabel = (unitId: string) => {
    const unit = units.find((item) => item.id === unitId);
    return unit ? directoryUnitLabel(unit, buildings) : 'Unidad no disponible';
  };

  if (loading && !people.length) {
    return (
      <div className="people-workspace" aria-label="Cargando personas">
        <Skeleton className="skeleton--title" />
        <div className="people-workspace__loading-grid">
          <Skeleton className="skeleton--card" />
          <Skeleton className="skeleton--card" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="people-workspace">
        <PageHeader
          actions={
            <Button onClick={openNewPerson}>
              <PeopleIcon size={17} /> Nueva persona
            </Button>
          }
          description="Un registro por persona, con todas sus propiedades, ocupaciones, responsabilidades y acceso a Habitta."
          eyebrow={`Comunidad · ${condominiumName}`}
          title="Personas"
        />

        {error ? (
          <div className="people-alert" role="alert">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="people-success" role="status">
            <CheckCircleIcon size={17} /> {message}
          </div>
        ) : null}

        <section className="people-metrics" aria-label="Resumen de personas">
          <Surface>
            <span>Personas</span>
            <strong>{people.length}</strong>
            <small>Registros únicos</small>
          </Surface>
          <Surface>
            <span>Activas</span>
            <strong>{activePeople}</strong>
            <small>Vigentes en la comunidad</small>
          </Surface>
          <Surface>
            <span>Con contacto</span>
            <strong>{connectedPeople}</strong>
            <small>Correo o teléfono disponible</small>
          </Surface>
        </section>

        <div className="people-workspace__layout">
          <Surface className="people-directory">
            <div className="people-directory__heading">
              <div>
                <span className="people-kicker">Directorio</span>
                <h2>Personas registradas</h2>
              </div>
              <Badge tone="info">{filtered.length}</Badge>
            </div>
            <Field label="Buscar">
              <input
                className="input"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, documento, correo o teléfono"
                type="search"
                value={query}
              />
            </Field>
            <Field label="Estado">
              <Select
                onChange={(event) => setStatusFilter(event.target.value)}
                value={statusFilter}
              >
                <option value="">Todos</option>
                <option value="active">Activas</option>
                <option value="inactive">Inactivas</option>
              </Select>
            </Field>

            {filtered.length ? (
              <div className="people-directory__list">
                {filtered.map((person) => (
                  <button
                    className="people-directory__person"
                    data-selected={selected?.id === person.id || undefined}
                    key={person.id}
                    onClick={() => void selectPerson(person)}
                    type="button"
                  >
                    <span className="people-avatar">{personInitials(person)}</span>
                    <span>
                      <strong>{personName(person)}</strong>
                      <small>
                        {person.document_number
                          ? `${person.document_type ?? 'Documento'} ${person.document_number}`
                          : person.email || person.phone || 'Sin datos de contacto'}
                      </small>
                    </span>
                    <Badge tone={person.status === 'inactive' ? 'neutral' : 'success'}>
                      {person.status === 'inactive' ? 'Inactiva' : 'Activa'}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                actionLabel="Limpiar filtros"
                description="Prueba otra búsqueda o muestra todos los estados."
                icon={<PeopleIcon size={26} />}
                onAction={() => {
                  setQuery('');
                  setStatusFilter('');
                }}
                title="No encontramos personas"
              />
            )}
          </Surface>

          <Surface className="people-detail">
            {detailLoading ? (
              <Skeleton className="people-detail__skeleton" />
            ) : selected ? (
              <>
                <div className="people-profile-header">
                  <span className="people-avatar people-avatar--large">
                    {personInitials(selected)}
                  </span>
                  <div>
                    <span className="people-kicker">Perfil operativo</span>
                    <h2>{personName(selected)}</h2>
                    <p>
                      {selected.document_number
                        ? `${selected.document_type ?? 'Documento'} · ${selected.document_number}`
                        : 'Documento no registrado'}
                    </p>
                  </div>
                  <div className="people-profile-header__actions">
                    <Badge tone={selected.status === 'inactive' ? 'neutral' : 'success'}>
                      {selected.status === 'inactive' ? 'Inactiva' : 'Activa'}
                    </Badge>
                    <Button onClick={openEditPerson} size="sm" variant="secondary">
                      Editar perfil
                    </Button>
                  </div>
                </div>

                <div className="people-contact-grid">
                  <div>
                    <span>Correo</span>
                    <strong>{selected.email ?? 'No registrado'}</strong>
                  </div>
                  <div>
                    <span>Teléfono</span>
                    <strong>{selected.phone ?? 'No registrado'}</strong>
                  </div>
                  <div>
                    <span>Relaciones activas</span>
                    <strong>{selectedActiveRelationships}</strong>
                  </div>
                </div>

                <section className="people-section">
                  <div className="people-section__heading">
                    <div>
                      <span className="people-kicker">Propiedad</span>
                      <h3>Unidades como propietario</h3>
                      <p>Una persona puede tener varias unidades sin duplicar su identidad.</p>
                    </div>
                    <Badge tone="info">{ownerships.filter((item) => !item.ends_at).length}</Badge>
                  </div>
                  <form
                    className="people-inline-form"
                    onSubmit={(event) => void createOwnership(event)}
                  >
                    <Field label="Unidad">
                      <Select
                        onChange={(event) =>
                          setOwnershipDraft((current) => ({
                            ...current,
                            unitId: event.target.value,
                          }))
                        }
                        required
                        value={ownershipDraft.unitId}
                      >
                        <option value="">Selecciona una unidad</option>
                        {units
                          .filter((unit) => unit.status !== 'inactive')
                          .map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {directoryUnitLabel(unit, buildings)}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field hint="Opcional, de 0 a 100%." label="Participación">
                      <input
                        className="input"
                        max="100"
                        min="0.01"
                        onChange={(event) =>
                          setOwnershipDraft((current) => ({
                            ...current,
                            percentage: event.target.value,
                          }))
                        }
                        step="0.01"
                        type="number"
                        value={ownershipDraft.percentage}
                      />
                    </Field>
                    <Button disabled={busyAction === 'ownership'} type="submit">
                      {busyAction === 'ownership' ? 'Asociando…' : 'Asociar propiedad'}
                    </Button>
                  </form>
                  <div className="people-relationship-list">
                    {ownerships.map((item) => {
                      const current = !item.ends_at;
                      return (
                        <article key={item.id}>
                          <span className="people-relationship-icon">
                            <UnitsIcon size={18} />
                          </span>
                          <div>
                            <strong>{unitContextLabel(item.units)}</strong>
                            <small>
                              {item.ownership_percentage
                                ? `Participación ${item.ownership_percentage}%`
                                : 'Participación no indicada'}
                              {' · '}desde {formatDate(item.starts_at)}
                            </small>
                          </div>
                          <Badge tone={current ? 'success' : 'neutral'}>
                            {current ? 'Actual' : `Hasta ${formatDate(item.ends_at!)}`}
                          </Badge>
                          {current ? (
                            <Button
                              onClick={() =>
                                setPendingClose({
                                  kind: 'ownership',
                                  id: item.id,
                                  label: `Propiedad en ${unitContextLabel(item.units)}`,
                                })
                              }
                              size="sm"
                              variant="ghost"
                            >
                              Cerrar
                            </Button>
                          ) : null}
                        </article>
                      );
                    })}
                    {!ownerships.length ? (
                      <p className="people-muted">Sin propiedades registradas.</p>
                    ) : null}
                  </div>
                </section>

                <section className="people-section">
                  <div className="people-section__heading">
                    <div>
                      <span className="people-kicker">Ocupación</span>
                      <h3>Residencia y ocupantes</h3>
                      <p>
                        Registra al inquilino, propietario residente, familiar u ocupante
                        autorizado.
                      </p>
                    </div>
                    <Badge tone="info">{occupancies.filter((item) => !item.ends_at).length}</Badge>
                  </div>
                  <form
                    className="people-inline-form"
                    onSubmit={(event) => void createOccupancy(event)}
                  >
                    <Field label="Unidad">
                      <Select
                        onChange={(event) =>
                          setOccupancyDraft((current) => ({
                            ...current,
                            unitId: event.target.value,
                          }))
                        }
                        required
                        value={occupancyDraft.unitId}
                      >
                        <option value="">Selecciona una unidad</option>
                        {units
                          .filter((unit) => unit.status !== 'inactive')
                          .map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {directoryUnitLabel(unit, buildings)}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label="Tipo de ocupación">
                      <Select
                        onChange={(event) =>
                          setOccupancyDraft((current) => ({
                            ...current,
                            occupancyType: event.target.value as Occupancy['occupancy_type'],
                          }))
                        }
                        value={occupancyDraft.occupancyType}
                      >
                        {occupancyTypeOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button disabled={busyAction === 'occupancy'} type="submit">
                      {busyAction === 'occupancy' ? 'Asociando…' : 'Asociar ocupación'}
                    </Button>
                  </form>
                  <div className="people-relationship-list">
                    {occupancies.map((item) => {
                      const current = !item.ends_at;
                      return (
                        <article key={item.id}>
                          <span className="people-relationship-icon">
                            <PeopleIcon size={18} />
                          </span>
                          <div>
                            <strong>{unitContextLabel(item.units)}</strong>
                            <small>
                              {occupancyLabels[item.occupancy_type]} · desde{' '}
                              {formatDate(item.starts_at)}
                            </small>
                          </div>
                          <Badge tone={current ? 'success' : 'neutral'}>
                            {current ? 'Actual' : `Hasta ${formatDate(item.ends_at!)}`}
                          </Badge>
                          {current ? (
                            <Button
                              onClick={() =>
                                setPendingClose({
                                  kind: 'occupancy',
                                  id: item.id,
                                  label: `${occupancyLabels[item.occupancy_type]} en ${unitContextLabel(item.units)}`,
                                })
                              }
                              size="sm"
                              variant="ghost"
                            >
                              Cerrar
                            </Button>
                          ) : null}
                        </article>
                      );
                    })}
                    {!occupancies.length ? (
                      <p className="people-muted">Sin ocupaciones registradas.</p>
                    ) : null}
                  </div>
                </section>

                <section className="people-section">
                  <div className="people-section__heading">
                    <div>
                      <span className="people-kicker">Responsabilidades</span>
                      <h3>Relaciones con el condominio</h3>
                      <p>Junta, administración, representación legal y contactos, con historia.</p>
                    </div>
                    <Badge tone="info">
                      {condominiumRelationships.filter((item) => !item.ends_at).length}
                    </Badge>
                  </div>
                  <form
                    className="people-inline-form"
                    onSubmit={(event) => void createCondominiumRelationship(event)}
                  >
                    <Field label="Relación">
                      <Select
                        onChange={(event) =>
                          setRelationshipDraft((current) => ({
                            ...current,
                            relationshipType: event.target.value as CondominiumRelationshipType,
                          }))
                        }
                        value={relationshipDraft.relationshipType}
                      >
                        {condominiumRelationshipOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Cargo o detalle">
                      <input
                        className="input"
                        maxLength={120}
                        onChange={(event) =>
                          setRelationshipDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        placeholder="Ej. Presidente de la junta"
                        value={relationshipDraft.title}
                      />
                    </Field>
                    <Button disabled={busyAction === 'condominium-relationship'} type="submit">
                      {busyAction === 'condominium-relationship'
                        ? 'Agregando…'
                        : 'Agregar relación'}
                    </Button>
                  </form>
                  <div className="people-relationship-list">
                    {condominiumRelationships.map((relationship) => {
                      const current = !relationship.ends_at;
                      return (
                        <article key={relationship.id}>
                          <span className="people-relationship-icon">
                            <PeopleIcon size={18} />
                          </span>
                          <div>
                            <strong>
                              {condominiumRelationshipLabels[relationship.relationship_type]}
                            </strong>
                            <small>
                              {relationship.title ? `${relationship.title} · ` : ''}desde{' '}
                              {formatDate(relationship.starts_at)}
                            </small>
                          </div>
                          <Badge tone={current ? 'success' : 'neutral'}>
                            {current ? 'Actual' : `Hasta ${formatDate(relationship.ends_at!)}`}
                          </Badge>
                          {current ? (
                            <Button
                              onClick={() =>
                                setPendingClose({
                                  kind: 'condominium',
                                  id: relationship.id,
                                  label:
                                    condominiumRelationshipLabels[relationship.relationship_type],
                                })
                              }
                              size="sm"
                              variant="ghost"
                            >
                              Cerrar
                            </Button>
                          ) : null}
                        </article>
                      );
                    })}
                    {!condominiumRelationships.length ? (
                      <p className="people-muted">Sin relaciones institucionales registradas.</p>
                    ) : null}
                  </div>
                </section>

                <section className="people-section people-access-section">
                  <div className="people-section__heading">
                    <div>
                      <span className="people-kicker">Acceso digital</span>
                      <h3>Invitar a Habitta</h3>
                      <p>
                        El acceso se concede solo desde una propiedad activa o una ocupación activa
                        como inquilino.
                      </p>
                    </div>
                    <Badge tone={accessOptions.length ? 'success' : 'neutral'}>
                      {accessOptions.length ? 'Elegible' : 'Sin relación elegible'}
                    </Badge>
                  </div>

                  <form
                    className="people-invitation-form"
                    onSubmit={(event) => void createInvitation(event)}
                  >
                    <Field label="Rol que recibirá">
                      <Select
                        onChange={(event) => setInviteRole(event.target.value as ResidentRole)}
                        value={inviteRole}
                      >
                        <option value="owner">Propietario</option>
                        <option value="tenant">Inquilino</option>
                      </Select>
                    </Field>
                    <Field label="Unidad vinculada">
                      <Select
                        onChange={(event) => setInviteUnitId(event.target.value)}
                        required
                        value={inviteUnitId}
                      >
                        <option value="">Selecciona una unidad compatible</option>
                        {inviteUnits.map((option) => (
                          <option key={`${option.role}:${option.unitId}`} value={option.unitId}>
                            {option.unitLabel}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="people-access-summary" role="note">
                      <span>Se concederá acceso a</span>
                      <strong>{condominiumName}</strong>
                      <span>
                        {inviteUnitId
                          ? `${inviteUnits.find((option) => option.unitId === inviteUnitId)?.unitLabel ?? 'Unidad'} · ${residentRoleLabel(inviteRole)}`
                          : 'Selecciona una relación activa'}
                      </span>
                    </div>
                    <Button
                      disabled={busyAction === 'invitation' || !selected.email || !inviteUnitId}
                      type="submit"
                    >
                      {busyAction === 'invitation' ? 'Creando…' : 'Crear invitación'}
                    </Button>
                  </form>

                  {!selected.email ? (
                    <p className="people-muted">
                      Agrega un correo al perfil para habilitar invitaciones.
                    </p>
                  ) : null}
                  {selected.email && !accessOptions.length ? (
                    <p className="people-muted">
                      Registra primero una propiedad o una ocupación de tipo Inquilino que esté
                      activa.
                    </p>
                  ) : null}

                  {latestInvitation ? (
                    <div className="people-invitation-link-card">
                      <div>
                        <span className="people-kicker">Enlace seguro listo</span>
                        <strong>
                          {residentRoleLabel(latestInvitation.role)} · {latestInvitation.unitLabel}
                        </strong>
                        <Badge
                          tone={
                            latestInvitation.delivery.status === 'sent'
                              ? 'success'
                              : latestInvitation.delivery.status === 'failed'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {latestInvitation.delivery.status === 'sent'
                            ? 'Correo enviado'
                            : latestInvitation.delivery.status === 'failed'
                              ? 'Error de envío'
                              : 'Envío desactivado'}
                        </Badge>
                        <small>
                          Habitta almacena solo el hash del token. El enlace seguro queda disponible
                          como respaldo aunque el correo transaccional falle o esté desactivado.
                        </small>
                      </div>
                      <input
                        aria-label="Enlace seguro de invitación"
                        className="input"
                        readOnly
                        value={latestInvitation.url}
                      />
                      <div>
                        <Button onClick={() => void copyLatestInvitation()} size="sm" type="button">
                          Copiar enlace seguro
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="people-invitation-history">
                    <div className="people-subheading">
                      <strong>Historial de invitaciones</strong>
                      <span>{invitations.length} registradas</span>
                    </div>
                    {invitations.length ? (
                      invitations.map((invitation) => {
                        const displayStatus = residentInvitationDisplayStatus(invitation);
                        const deliveryEvent = deliveryByInvitationId.get(invitation.id);
                        const eligible = accessOptions.some(
                          (option) =>
                            option.role === invitation.intended_role &&
                            option.unitId === invitation.unit_id,
                        );
                        return (
                          <article key={invitation.id}>
                            <div>
                              <strong>
                                {residentRoleLabel(invitation.intended_role)} ·{' '}
                                {invitationUnitLabel(invitation.unit_id)}
                              </strong>
                              <small>
                                Creada {formatDate(invitation.created_at)} · vence{' '}
                                {formatDate(invitation.expires_at)}
                              </small>
                            </div>
                            <Badge tone={invitationTone(displayStatus)}>
                              {residentInvitationStatusLabels[displayStatus]}
                            </Badge>
                            <Badge tone={deliveryTone(deliveryEvent)}>
                              {residentDeliveryLabel(deliveryEvent)}
                            </Badge>
                            <div className="people-invitation-history__actions">
                              {displayStatus === 'pending' && eligible ? (
                                <Button
                                  disabled={busyAction === 'invitation'}
                                  onClick={() =>
                                    void issueInvitation(
                                      invitation.intended_role,
                                      invitation.unit_id,
                                    )
                                  }
                                  size="sm"
                                  type="button"
                                  variant="secondary"
                                >
                                  Renovar enlace
                                </Button>
                              ) : null}
                              {displayStatus === 'pending' ? (
                                <Button
                                  onClick={() => setPendingRevoke(invitation)}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  Revocar
                                </Button>
                              ) : null}
                              {(displayStatus === 'expired' || displayStatus === 'revoked') &&
                              eligible ? (
                                <Button
                                  disabled={busyAction === 'invitation'}
                                  onClick={() =>
                                    void issueInvitation(
                                      invitation.intended_role,
                                      invitation.unit_id,
                                    )
                                  }
                                  size="sm"
                                  type="button"
                                  variant="secondary"
                                >
                                  Nueva invitación
                                </Button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <p className="people-muted">
                        No hay invitaciones registradas para esta persona.
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <EmptyState
                actionLabel="Crear persona"
                description="Selecciona una persona para ver sus unidades, ocupaciones, responsabilidades e invitaciones."
                icon={<PeopleIcon size={30} />}
                onAction={openNewPerson}
                title="Selecciona un perfil"
              />
            )}
          </Surface>
        </div>

        <Surface className="people-import">
          <div className="people-section__heading">
            <div>
              <span className="people-kicker">Carga masiva</span>
              <h3>Importar personas por CSV</h3>
              <p>Conservamos la previsualización y validación antes de confirmar la importación.</p>
            </div>
          </div>
          <div className="people-import__controls">
            <Field label="Archivo CSV">
              <input
                accept=".csv,text/csv"
                className="input"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                }}
                type="file"
              />
            </Field>
            <Button
              disabled={!file || busyAction === 'preview-import'}
              onClick={() => void previewCsv()}
              type="button"
              variant="secondary"
            >
              {busyAction === 'preview-import' ? 'Revisando…' : 'Previsualizar CSV'}
            </Button>
          </div>
          {preview ? (
            <div className="people-import__preview">
              <div>
                <Badge tone="success">{preview.valid.length} válidas</Badge>
                <Badge tone={preview.errors.length ? 'warning' : 'neutral'}>
                  {preview.errors.length} errores
                </Badge>
              </div>
              {preview.errors.slice(0, 8).map((item) => (
                <p key={`${item.row}:${item.error}`}>
                  Fila {item.row}: {item.error}
                </p>
              ))}
              <Button
                disabled={!preview.valid.length || busyAction === 'commit-import'}
                onClick={() => void commitImport()}
                type="button"
              >
                {busyAction === 'commit-import' ? 'Importando…' : 'Confirmar importación'}
              </Button>
            </div>
          ) : null}
        </Surface>
      </div>

      {personEditorOpen ? (
        <Drawer
          eyebrow={editingPersonId ? 'Perfil de persona' : 'Nueva persona'}
          onClose={() => !busyAction && setPersonEditorOpen(false)}
          prefix="people"
          title={editingPersonId ? 'Editar persona' : 'Agregar persona'}
        >
          <form className="people-editor" onSubmit={(event) => void savePerson(event)}>
            <p>
              La identidad se registra una sola vez. Después podrás asociarla a varias unidades y
              responsabilidades sin duplicar la persona.
            </p>
            <div className="people-editor__grid">
              <Field label="Nombre">
                <input
                  autoFocus
                  className="input"
                  onChange={(event) =>
                    setPersonDraft((current) => ({ ...current, firstName: event.target.value }))
                  }
                  required
                  value={personDraft.firstName}
                />
              </Field>
              <Field label="Apellido">
                <input
                  className="input"
                  onChange={(event) =>
                    setPersonDraft((current) => ({ ...current, lastName: event.target.value }))
                  }
                  required
                  value={personDraft.lastName}
                />
              </Field>
              <Field hint="Cédula, RIF, pasaporte u otro identificador." label="Tipo de documento">
                <input
                  className="input"
                  list="habitta-person-document-types"
                  onChange={(event) =>
                    setPersonDraft((current) => ({ ...current, documentType: event.target.value }))
                  }
                  value={personDraft.documentType}
                />
                <datalist id="habitta-person-document-types">
                  <option value="Cédula" />
                  <option value="RIF" />
                  <option value="Pasaporte" />
                </datalist>
              </Field>
              <Field label="Número de documento">
                <input
                  className="input"
                  onChange={(event) =>
                    setPersonDraft((current) => ({
                      ...current,
                      documentNumber: event.target.value,
                    }))
                  }
                  value={personDraft.documentNumber}
                />
              </Field>
              <Field label="Correo electrónico">
                <input
                  className="input"
                  onChange={(event) =>
                    setPersonDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  type="email"
                  value={personDraft.email}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className="input"
                  onChange={(event) =>
                    setPersonDraft((current) => ({ ...current, phone: event.target.value }))
                  }
                  value={personDraft.phone}
                />
              </Field>
              <Field label="Estado">
                <Select
                  onChange={(event) =>
                    setPersonDraft((current) => ({
                      ...current,
                      status: event.target.value as PersonDraft['status'],
                    }))
                  }
                  value={personDraft.status}
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </Select>
              </Field>
            </div>
            <div className="people-editor__footer">
              <Button
                disabled={busyAction === 'person'}
                onClick={() => setPersonEditorOpen(false)}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button disabled={busyAction === 'person'} type="submit">
                {busyAction === 'person'
                  ? 'Guardando…'
                  : editingPersonId
                    ? 'Guardar cambios'
                    : 'Crear persona'}
              </Button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {pendingClose ? (
        <ConfirmDialog
          busy={busyAction === `close:${pendingClose.id}`}
          busyLabel="Cerrando relación…"
          confirmLabel="Cerrar relación"
          description={`${pendingClose.label} dejará de estar activa desde hoy. Habitta conservará el registro histórico y cualquier nueva relación deberá registrarse explícitamente.`}
          onCancel={() => !busyAction && setPendingClose(null)}
          onConfirm={() => void confirmCloseRelationship()}
          title="Cerrar relación activa"
        />
      ) : null}

      {pendingRevoke ? (
        <ConfirmDialog
          busy={busyAction === `revoke:${pendingRevoke.id}`}
          busyLabel="Revocando…"
          confirmLabel="Revocar invitación"
          description={`El enlace pendiente de ${residentRoleLabel(pendingRevoke.intended_role).toLowerCase()} para ${invitationUnitLabel(pendingRevoke.unit_id)} dejará de ser válido. La persona y su relación con la unidad no se eliminan.`}
          destructive
          onCancel={() => !busyAction && setPendingRevoke(null)}
          onConfirm={() => void confirmRevokeInvitation()}
          title="Revocar acceso pendiente"
        />
      ) : null}
    </>
  );
}
