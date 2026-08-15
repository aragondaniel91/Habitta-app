import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  createResidentInvitation,
  listResidentInvitations,
  residentRoleLabel,
  revokeResidentInvitation,
  type ResidentInvitation,
  type ResidentRole,
} from '../../lib/residentAccess';
import { peopleApi } from './api';
import { PanelMessage } from './components/PanelMessage';
import {
  activeOccupancies,
  activeOwnerships,
  condominiumRelationshipLabels,
  occupancyLabels,
  personSearchText,
  unitContextLabel,
} from './relationship-model';
import type {
  CondominiumRelationship,
  CondominiumRelationshipType,
  Occupancy,
  Ownership,
  Person,
  PersonRelationshipView,
  Preview,
  Unit,
} from './types';

type Props = { condominiumId: string; units: Unit[]; session: Session };

export function PeoplePanel({ condominiumId, units, session }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [ownerships, setOwnerships] = useState<Ownership[]>([]);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);
  const [condominiumRelationships, setCondominiumRelationships] = useState<
    CondominiumRelationship[]
  >([]);
  const [invitations, setInvitations] = useState<ResidentInvitation[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inviteRole, setInviteRole] = useState<ResidentRole>('owner');
  const [inviteUnitId, setInviteUnitId] = useState('');
  const [latestInvitationUrl, setLatestInvitationUrl] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadPeople = async () => {
    if (!condominiumId) return;
    setPeople(await peopleApi<Person[]>(`/v1/condominiums/${condominiumId}/people`, session));
  };

  useEffect(() => {
    void loadPeople();
  }, [condominiumId, session.access_token]);

  const loadRelationships = async (personId: string) => {
    const view = await peopleApi<PersonRelationshipView>(
      `/v1/condominiums/${condominiumId}/people/${personId}/relationships`,
      session,
    );
    setSelected(view.person);
    setOwnerships(view.ownerships);
    setOccupancies(view.occupancies);
    setCondominiumRelationships(view.condominiumRelationships);
  };

  const loadInvitations = async (personId: string) => {
    setInvitations(await listResidentInvitations(condominiumId, personId));
  };

  const selectPerson = async (person: Person) => {
    setMessage('');
    setLatestInvitationUrl('');
    await Promise.all([loadRelationships(person.id), loadInvitations(person.id)]);
  };

  const startNewPerson = () => {
    setSelected(null);
    setOwnerships([]);
    setOccupancies([]);
    setCondominiumRelationships([]);
    setInvitations([]);
    setLatestInvitationUrl('');
    setMessage('');
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return people;
    return people.filter((person) => personSearchText(person).includes(normalizedQuery));
  }, [people, query]);

  const activeOwnerUnits = useMemo(() => activeOwnerships(ownerships), [ownerships]);
  const activeTenantUnits = useMemo(() => activeOccupancies(occupancies), [occupancies]);
  const inviteUnits = inviteRole === 'owner' ? activeOwnerUnits : activeTenantUnits;

  useEffect(() => {
    setInviteUnitId((current) => {
      if (current && inviteUnits.some((item) => item.unit_id === current)) return current;
      return inviteUnits[0]?.unit_id ?? '';
    });
  }, [inviteRole, ownerships, occupancies]);

  const submitPerson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const personId = selected?.id;
    const path = personId
      ? `/v1/condominiums/${condominiumId}/people/${personId}`
      : `/v1/condominiums/${condominiumId}/people`;

    await peopleApi(path, session, {
      method: personId ? 'PATCH' : 'POST',
      body: JSON.stringify({
        firstName: values.firstName,
        lastName: values.lastName,
        documentType: values.documentType || undefined,
        documentNumber: values.documentNumber || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
      }),
    });

    setMessage(personId ? 'Persona actualizada.' : 'Persona creada.');
    await loadPeople();
    if (personId) await loadRelationships(personId);
    else event.currentTarget.reset();
  };

  const createOwnership = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await peopleApi(`/v1/condominiums/${condominiumId}/people/${selected.id}/ownerships`, session, {
      method: 'POST',
      body: JSON.stringify({
        unitId: values.unitId,
        ownershipPercentage: values.ownershipPercentage
          ? Number(values.ownershipPercentage)
          : undefined,
        isPrimaryContact: true,
      }),
    });
    setMessage('Propiedad asociada.');
    await loadRelationships(selected.id);
  };

  const createOccupancy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await peopleApi(
      `/v1/condominiums/${condominiumId}/people/${selected.id}/occupancies`,
      session,
      {
        method: 'POST',
        body: JSON.stringify({
          unitId: values.unitId,
          occupancyType: values.occupancyType,
          isPrimaryContact: true,
        }),
      },
    );
    setMessage('Ocupación asociada.');
    await loadRelationships(selected.id);
  };

  const closeUnitRelationship = async (kind: 'unit-owners' | 'unit-occupancies', id: string) => {
    if (!selected) return;
    await peopleApi(`/v1/condominiums/${condominiumId}/${kind}/${id}`, session, {
      method: 'PATCH',
      body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
    });
    await loadRelationships(selected.id);
    setMessage('Relación cerrada; el historial se conserva.');
  };

  const createCondominiumRelationship = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await peopleApi(
      `/v1/condominiums/${condominiumId}/people/${selected.id}/condominium-relationships`,
      session,
      {
        method: 'POST',
        body: JSON.stringify({
          relationshipType: values.relationshipType,
          title: values.title || undefined,
        }),
      },
    );
    event.currentTarget.reset();
    setMessage('Relación con el condominio agregada.');
    await loadRelationships(selected.id);
  };

  const closeCondominiumRelationship = async (relationshipId: string) => {
    if (!selected) return;
    await peopleApi(
      `/v1/condominiums/${condominiumId}/people/${selected.id}/condominium-relationships/${relationshipId}`,
      session,
      {
        method: 'PATCH',
        body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
      },
    );
    setMessage('Relación cerrada; el historial se conserva.');
    await loadRelationships(selected.id);
  };

  const createInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !inviteUnitId) return;
    if (!selected.email) {
      setMessage('Agrega un correo válido a la persona antes de invitarla.');
      return;
    }
    setInviting(true);
    setMessage('');
    setLatestInvitationUrl('');
    try {
      const result = await createResidentInvitation({
        condominiumId,
        personId: selected.id,
        unitId: inviteUnitId,
        role: inviteRole,
      });
      setLatestInvitationUrl(result.invitationUrl);
      setMessage('Invitación creada. Comparte el enlace con el residente.');
      await loadInvitations(selected.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la invitación.');
    } finally {
      setInviting(false);
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    if (!selected) return;
    try {
      await revokeResidentInvitation(invitationId);
      setMessage('Invitación revocada.');
      setLatestInvitationUrl('');
      await loadInvitations(selected.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo revocar la invitación.');
    }
  };

  const copyLatestInvitation = async () => {
    if (!latestInvitationUrl) return;
    await navigator.clipboard.writeText(latestInvitationUrl);
    setMessage('Enlace de invitación copiado.');
  };

  const previewCsv = async () => {
    if (!file) return;
    setPreview(
      await peopleApi(`/v1/condominiums/${condominiumId}/people/import/preview`, session, {
        method: 'POST',
        body: JSON.stringify({ csv: await file.text() }),
      }),
    );
  };

  const commit = async () => {
    if (!preview) return;
    const result = await peopleApi(
      `/v1/condominiums/${condominiumId}/people/import/commit`,
      session,
      {
        method: 'POST',
        body: JSON.stringify({ rows: preview.valid, idempotencyKey: crypto.randomUUID() }),
      },
    );
    setMessage(`Importación completada: ${JSON.stringify(result)}`);
    await loadPeople();
  };

  return (
    <section className="people-panel">
      <h2>Personas</h2>
      <p>
        Una persona puede estar asociada a varias propiedades u ocupaciones sin duplicar sus datos.
      </p>
      <PanelMessage>{message}</PanelMessage>

      <div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar nombre, documento, correo o teléfono"
        />
        <button type="button" onClick={startNewPerson}>
          Nueva persona
        </button>
      </div>

      <form key={selected?.id ?? 'new-person'} onSubmit={(event) => void submitPerson(event)}>
        <input name="firstName" defaultValue={selected?.first_name} required placeholder="Nombre" />
        <input name="lastName" defaultValue={selected?.last_name} required placeholder="Apellido" />
        <input
          name="documentType"
          defaultValue={selected?.document_type ?? ''}
          list="person-document-types"
          placeholder="Tipo de documento"
        />
        <datalist id="person-document-types">
          <option value="Cédula" />
          <option value="RIF" />
          <option value="Pasaporte" />
        </datalist>
        <input
          name="documentNumber"
          defaultValue={selected?.document_number ?? ''}
          placeholder="Número de documento"
        />
        <input name="email" defaultValue={selected?.email ?? ''} placeholder="Correo" />
        <input name="phone" defaultValue={selected?.phone ?? ''} placeholder="Teléfono" />
        <button>{selected ? 'Actualizar persona' : 'Crear persona'}</button>
      </form>

      <div>
        {filtered.map((person) => (
          <button key={person.id} type="button" onClick={() => void selectPerson(person)}>
            {person.first_name} {person.last_name}
            {person.document_number
              ? ` · ${person.document_type ?? 'Documento'} ${person.document_number}`
              : ''}
          </button>
        ))}
      </div>

      {selected && (
        <>
          <h3>
            {selected.first_name} {selected.last_name}
          </h3>
          {selected.document_number ? (
            <p>
              {selected.document_type ?? 'Documento'}: {selected.document_number}
            </p>
          ) : null}

          <h4>Propiedades</h4>
          <form onSubmit={(event) => void createOwnership(event)}>
            <select name="unitId" required>
              <option value="">Seleccionar unidad</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code}
                </option>
              ))}
            </select>
            <input
              name="ownershipPercentage"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              placeholder="Participación %"
            />
            <button>Asociar propiedad</button>
          </form>
          {ownerships.length === 0 ? <p>Sin propiedades registradas.</p> : null}
          {ownerships.map((item) => (
            <p key={item.id}>
              {unitContextLabel(item.units)}
              {item.ownership_percentage ? ` · ${item.ownership_percentage}%` : ''}{' '}
              {item.ends_at ? (
                `(histórica · hasta ${item.ends_at})`
              ) : (
                <button
                  type="button"
                  onClick={() => void closeUnitRelationship('unit-owners', item.id)}
                >
                  Cerrar
                </button>
              )}
            </p>
          ))}

          <h4>Ocupaciones</h4>
          <form onSubmit={(event) => void createOccupancy(event)}>
            <select name="unitId" required>
              <option value="">Seleccionar unidad</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code}
                </option>
              ))}
            </select>
            <select name="occupancyType" defaultValue="tenant">
              <option value="tenant">Inquilino</option>
              <option value="owner_occupant">Propietario ocupante</option>
              <option value="family_member">Familiar</option>
              <option value="authorized_occupant">Ocupante autorizado</option>
            </select>
            <button>Asociar ocupación</button>
          </form>
          {occupancies.length === 0 ? <p>Sin ocupaciones registradas.</p> : null}
          {occupancies.map((item) => (
            <p key={item.id}>
              {unitContextLabel(item.units)} · {occupancyLabels[item.occupancy_type]}{' '}
              {item.ends_at ? (
                `(histórica · hasta ${item.ends_at})`
              ) : (
                <button
                  type="button"
                  onClick={() => void closeUnitRelationship('unit-occupancies', item.id)}
                >
                  Cerrar
                </button>
              )}
            </p>
          ))}

          <h4>Relaciones con el condominio</h4>
          <p>
            Junta, representación y contactos se registran aquí aunque la persona no tenga una
            unidad.
          </p>
          <form onSubmit={(event) => void createCondominiumRelationship(event)}>
            <select name="relationshipType" defaultValue="board_member">
              {(
                Object.entries(condominiumRelationshipLabels) as [
                  CondominiumRelationshipType,
                  string,
                ][]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Cargo o detalle (opcional)" maxLength={120} />
            <button>Agregar relación</button>
          </form>
          {condominiumRelationships.length === 0 ? <p>Sin relaciones registradas.</p> : null}
          {condominiumRelationships.map((relationship) => (
            <p key={relationship.id}>
              {condominiumRelationshipLabels[relationship.relationship_type]}
              {relationship.title ? ` · ${relationship.title}` : ''}{' '}
              {relationship.ends_at ? (
                `(histórica · hasta ${relationship.ends_at})`
              ) : (
                <button
                  type="button"
                  onClick={() => void closeCondominiumRelationship(relationship.id)}
                >
                  Cerrar
                </button>
              )}
            </p>
          ))}

          <h4>Acceso de residente</h4>
          <p>
            El acceso a Habitta es independiente de las relaciones administrativas y requiere una
            propiedad u ocupación activa.
          </p>
          <form onSubmit={(event) => void createInvitation(event)}>
            <select
              aria-label="Rol del residente"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as ResidentRole)}
            >
              <option value="owner">Propietario</option>
              <option value="tenant">Inquilino</option>
            </select>
            <select
              aria-label="Unidad del residente"
              value={inviteUnitId}
              onChange={(event) => setInviteUnitId(event.target.value)}
              required
            >
              <option value="">Seleccionar unidad</option>
              {inviteUnits.map((item) => (
                <option key={item.unit_id} value={item.unit_id}>
                  {unitContextLabel(item.units)}
                </option>
              ))}
            </select>
            <button disabled={inviting || !selected.email || !inviteUnitId}>
              {inviting
                ? 'Creando…'
                : `Invitar como ${residentRoleLabel(inviteRole).toLowerCase()}`}
            </button>
          </form>
          {!selected.email ? (
            <p>Agrega un correo a esta persona para habilitar invitaciones.</p>
          ) : null}
          {inviteUnits.length === 0 ? (
            <p>No hay una relación activa compatible con el rol seleccionado.</p>
          ) : null}
          {latestInvitationUrl ? (
            <div>
              <input aria-label="Enlace de invitación" readOnly value={latestInvitationUrl} />
              <button onClick={() => void copyLatestInvitation()} type="button">
                Copiar enlace
              </button>
            </div>
          ) : null}

          <h4>Invitaciones</h4>
          {invitations.length === 0 ? <p>No hay invitaciones para esta persona.</p> : null}
          {invitations.map((invitation) => (
            <p key={invitation.id}>
              {residentRoleLabel(invitation.intended_role)} · {invitation.status} · vence{' '}
              {new Date(invitation.expires_at).toLocaleDateString('es')}{' '}
              {invitation.status === 'pending' ? (
                <button onClick={() => void revokeInvitation(invitation.id)} type="button">
                  Revocar
                </button>
              ) : null}
            </p>
          ))}
        </>
      )}

      <h3>Importar personas</h3>
      <input
        type="file"
        accept=".csv"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button onClick={() => void previewCsv()} type="button">
        Previsualizar CSV
      </button>
      {preview && (
        <>
          <p>
            Filas válidas: {preview.valid.length}. Errores: {preview.errors.length}.
          </p>
          {preview.errors.map((error) => (
            <p key={error.row}>
              Fila {error.row}: {error.error}
            </p>
          ))}
          <button onClick={() => void commit()} type="button">
            Confirmar importación
          </button>
        </>
      )}
    </section>
  );
}
