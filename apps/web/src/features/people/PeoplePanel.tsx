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
import type { Assignment, Person, Preview, Unit } from './types';

type Props = { condominiumId: string; units: Unit[]; session: Session };

export function PeoplePanel({ condominiumId, units, session }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [owners, setOwners] = useState<Assignment[]>([]);
  const [occupancies, setOccupancies] = useState<Assignment[]>([]);
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

  const loadAssignments = async (person: Person) => {
    const entries = await Promise.all(
      units.map(async (unit) => ({
        unit,
        owners: await peopleApi<Assignment[]>(
          `/v1/condominiums/${condominiumId}/units/${unit.id}/owners`,
          session,
        ),
        occupancies: await peopleApi<Assignment[]>(
          `/v1/condominiums/${condominiumId}/units/${unit.id}/occupancies`,
          session,
        ),
      })),
    );
    setOwners(
      entries.flatMap(({ unit, owners: unitOwners }) =>
        unitOwners
          .filter((item) => item.person_id === person.id)
          .map((item) => ({ ...item, unitId: unit.id, unitCode: unit.code })),
      ),
    );
    setOccupancies(
      entries.flatMap(({ unit, occupancies: unitOccupancies }) =>
        unitOccupancies
          .filter((item) => item.person_id === person.id)
          .map((item) => ({ ...item, unitId: unit.id, unitCode: unit.code })),
      ),
    );
  };

  const loadInvitations = async (person: Person) => {
    setInvitations(await listResidentInvitations(condominiumId, person.id));
  };

  const selectPerson = async (person: Person) => {
    setSelected(person);
    setMessage('');
    setLatestInvitationUrl('');
    await Promise.all([loadAssignments(person), loadInvitations(person)]);
  };

  const filtered = useMemo(
    () =>
      people.filter((person) =>
        `${person.first_name} ${person.last_name} ${person.email ?? ''} ${person.phone ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [people, query],
  );

  const activeOwnerUnits = useMemo(
    () => owners.filter((item) => !item.ends_at && item.unitId),
    [owners],
  );
  const activeTenantUnits = useMemo(
    () => occupancies.filter((item) => !item.ends_at && item.unitId),
    [occupancies],
  );
  const inviteUnits = inviteRole === 'owner' ? activeOwnerUnits : activeTenantUnits;

  useEffect(() => {
    setInviteUnitId((current) => {
      if (current && inviteUnits.some((item) => item.unitId === current)) return current;
      return inviteUnits[0]?.unitId ?? '';
    });
  }, [inviteRole, owners, occupancies]);

  const submitPerson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const path = selected
      ? `/v1/condominiums/${condominiumId}/people/${selected.id}`
      : `/v1/condominiums/${condominiumId}/people`;
    await peopleApi(path, session, {
      method: selected ? 'PATCH' : 'POST',
      body: JSON.stringify({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email || undefined,
        phone: values.phone || undefined,
      }),
    });
    event.currentTarget.reset();
    setMessage('Persona guardada.');
    await loadPeople();
  };

  const createAssignment = async (
    event: React.FormEvent<HTMLFormElement>,
    kind: 'owners' | 'occupancies',
  ) => {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await peopleApi(`/v1/condominiums/${condominiumId}/units/${values.unitId}/${kind}`, session, {
      method: 'POST',
      body: JSON.stringify(
        kind === 'owners'
          ? {
              personId: selected.id,
              ownershipPercentage: values.ownershipPercentage
                ? Number(values.ownershipPercentage)
                : undefined,
              isPrimaryContact: true,
            }
          : { personId: selected.id, occupancyType: values.occupancyType, isPrimaryContact: true },
      ),
    });
    setMessage('Asignación creada.');
    await loadAssignments(selected);
  };

  const closeAssignment = async (kind: 'unit-owners' | 'unit-occupancies', id: string) => {
    await peopleApi(`/v1/condominiums/${condominiumId}/${kind}/${id}`, session, {
      method: 'PATCH',
      body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
    });
    if (selected) await loadAssignments(selected);
    setMessage('Asignación cerrada; se conservó el historial.');
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
      await loadInvitations(selected);
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
      await loadInvitations(selected);
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
    if (file)
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
      <PanelMessage>{message}</PanelMessage>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar nombre, correo o teléfono"
      />
      <form onSubmit={(event) => void submitPerson(event)}>
        <input name="firstName" defaultValue={selected?.first_name} required placeholder="Nombre" />
        <input name="lastName" defaultValue={selected?.last_name} required placeholder="Apellido" />
        <input name="email" defaultValue={selected?.email} placeholder="Correo" />
        <input name="phone" defaultValue={selected?.phone} placeholder="Teléfono" />
        <button>{selected ? 'Actualizar persona' : 'Crear persona'}</button>
      </form>
      <div>
        {filtered.map((person) => (
          <button key={person.id} onClick={() => void selectPerson(person)}>
            {person.first_name} {person.last_name}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <h3>
            {selected.first_name} {selected.last_name}
          </h3>
          <form onSubmit={(event) => void createAssignment(event, 'owners')}>
            <select name="unitId" required>
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
              placeholder="Alícuota %"
            />
            <button>Asignar propietario</button>
          </form>
          <form onSubmit={(event) => void createAssignment(event, 'occupancies')}>
            <select name="unitId" required>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code}
                </option>
              ))}
            </select>
            <select name="occupancyType">
              <option value="tenant">Inquilino</option>
              <option value="owner_occupant">Propietario ocupante</option>
              <option value="family_member">Familiar</option>
            </select>
            <button>Asignar ocupante</button>
          </form>
          <h4>Propiedades</h4>
          {owners.map((item) => (
            <p key={item.id}>
              {item.unitCode}{' '}
              {item.ends_at ? (
                '(cerrada)'
              ) : (
                <button onClick={() => void closeAssignment('unit-owners', item.id)}>Cerrar</button>
              )}
            </p>
          ))}
          <h4>Ocupaciones</h4>
          {occupancies.map((item) => (
            <p key={item.id}>
              {item.unitCode}{' '}
              {item.ends_at ? (
                '(cerrada)'
              ) : (
                <button onClick={() => void closeAssignment('unit-occupancies', item.id)}>
                  Cerrar
                </button>
              )}
            </p>
          ))}

          <h4>Acceso de residente</h4>
          <p>
            La invitación se liga al correo de la persona y a una relación activa con la unidad.
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
                <option key={item.unitId} value={item.unitId}>
                  {item.unitCode}
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
            <p>No hay una asignación activa compatible con el rol seleccionado.</p>
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
      <button onClick={() => void previewCsv()}>Previsualizar CSV</button>
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
          <button onClick={() => void commit()}>Confirmar importación</button>
        </>
      )}
    </section>
  );
}
