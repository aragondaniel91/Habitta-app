import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRightIcon, CommunityIcon, PeopleIcon, UnitsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import {
  countUnitsByStatus,
  filterPeople,
  filterUnits,
  getBuildingName,
  getPersonInitials,
  getPersonName,
  getPersonStatusLabel,
  getUnitStatusLabel,
  getUnitTypeLabel,
  isCurrentAssignment,
} from '../lib/community-directory';
import type {
  DirectoryBuilding,
  DirectoryPerson,
  DirectoryUnit,
  UnitOccupancyAssignment,
  UnitOwnerAssignment,
} from '../lib/community-directory';

const unitTypes = [
  ['apartment', 'Apartamento'],
  ['house', 'Casa'],
  ['commercial', 'Local'],
  ['parking', 'Estacionamiento'],
  ['storage', 'Depósito'],
] as const;

const occupancyTypes = [
  ['tenant', 'Inquilino'],
  ['owner_occupant', 'Propietario residente'],
  ['family_member', 'Familiar'],
  ['authorized_occupant', 'Ocupante autorizado'],
] as const;

type PanelState =
  | { kind: 'unit-detail'; unitId: string }
  | { kind: 'person-detail'; personId: string }
  | { kind: 'create-unit' }
  | { kind: 'create-person' }
  | { kind: 'create-building' }
  | null;

type UnitDetail = {
  unitId: string;
  owners: UnitOwnerAssignment[];
  occupancies: UnitOccupancyAssignment[];
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  mode: 'units' | 'people';
  session: Session;
};

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function GridIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="3" y="14" />
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="14" y="14" />
    </svg>
  );
}

function ListIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M9 6h12M9 12h12M9 18h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="4" cy="6" fill="currentColor" r="1.2" />
      <circle cx="4" cy="12" fill="currentColor" r="1.2" />
      <circle cx="4" cy="18" fill="currentColor" r="1.2" />
    </svg>
  );
}

function DirectoryMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Surface className="directory-metric">
      <span className="directory-metric__icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </Surface>
  );
}

function DirectoryLoading() {
  return (
    <div className="directory-page" aria-label="Cargando directorio">
      <Skeleton className="directory-heading-skeleton" />
      <div className="directory-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="directory-content-skeleton" />
    </div>
  );
}

export function CommunityDirectoryPage({ condominiumId, condominiumName, mode, session }: Props) {
  const [units, setUnits] = useState<DirectoryUnit[]>([]);
  const [buildings, setBuildings] = useState<DirectoryBuilding[]>([]);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [panel, setPanel] = useState<PanelState>(null);
  const [unitDetail, setUnitDetail] = useState<UnitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unitDraft, setUnitDraft] = useState({
    buildingId: '',
    code: '',
    type: 'apartment',
    floor: '',
    ownershipPercentage: '',
    status: 'active',
  });
  const [personDraft, setPersonDraft] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'active',
  });
  const [buildingName, setBuildingName] = useState('');
  const [assignmentDraft, setAssignmentDraft] = useState({
    role: 'occupant',
    personId: '',
    occupancyType: 'tenant',
    ownershipPercentage: '',
    isPrimaryContact: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [unitItems, buildingItems, personItems] = await Promise.all([
        apiRequest<DirectoryUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
        apiRequest<DirectoryBuilding[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
        apiRequest<DirectoryPerson[]>(`/v1/condominiums/${condominiumId}/people`, session),
      ]);
      setUnits(unitItems);
      setBuildings(buildingItems);
      setPeople(personItems);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cargar el directorio.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredUnits = useMemo(
    () =>
      filterUnits(units, buildings, { query, buildingId: buildingFilter, status: statusFilter }),
    [units, buildings, query, buildingFilter, statusFilter],
  );
  const filteredPeople = useMemo(
    () => filterPeople(people, { query, status: statusFilter }),
    [people, query, statusFilter],
  );
  const unitSummary = countUnitsByStatus(units);
  const activePeople = people.filter((person) => person.status !== 'inactive').length;
  const selectedUnit =
    panel?.kind === 'unit-detail' ? units.find((unit) => unit.id === panel.unitId) : undefined;
  const selectedPerson =
    panel?.kind === 'person-detail'
      ? people.find((person) => person.id === panel.personId)
      : undefined;

  const loadUnitDetail = async (unitId: string) => {
    setPanel({ kind: 'unit-detail', unitId });
    setDetailLoading(true);
    setMessage('');
    try {
      const [owners, occupancies] = await Promise.all([
        apiRequest<UnitOwnerAssignment[]>(
          `/v1/condominiums/${condominiumId}/units/${unitId}/owners`,
          session,
        ),
        apiRequest<UnitOccupancyAssignment[]>(
          `/v1/condominiums/${condominiumId}/units/${unitId}/occupancies`,
          session,
        ),
      ]);
      setUnitDetail({ unitId, owners, occupancies });
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo cargar la unidad.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const createUnit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await apiRequest<DirectoryUnit[]>(`/v1/condominiums/${condominiumId}/units`, session, {
        method: 'POST',
        body: JSON.stringify({
          ...(unitDraft.buildingId ? { buildingId: unitDraft.buildingId } : {}),
          code: unitDraft.code,
          type: unitDraft.type,
          ...(unitDraft.floor ? { floor: unitDraft.floor } : {}),
          ...(unitDraft.ownershipPercentage
            ? { ownershipPercentage: Number(unitDraft.ownershipPercentage) }
            : {}),
          status: unitDraft.status,
        }),
      });
      setUnitDraft({
        buildingId: '',
        code: '',
        type: 'apartment',
        floor: '',
        ownershipPercentage: '',
        status: 'active',
      });
      setPanel(null);
      await load();
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la unidad.',
      );
    } finally {
      setSaving(false);
    }
  };

  const savePerson = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const path = selectedPerson
      ? `/v1/condominiums/${condominiumId}/people/${selectedPerson.id}`
      : `/v1/condominiums/${condominiumId}/people`;
    try {
      await apiRequest<DirectoryPerson[]>(path, session, {
        method: selectedPerson ? 'PATCH' : 'POST',
        body: JSON.stringify({
          firstName: personDraft.firstName,
          lastName: personDraft.lastName,
          ...(personDraft.email ? { email: personDraft.email } : {}),
          ...(personDraft.phone ? { phone: personDraft.phone } : {}),
          status: personDraft.status,
        }),
      });
      setPersonDraft({ firstName: '', lastName: '', email: '', phone: '', status: 'active' });
      setPanel(null);
      await load();
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar la persona.',
      );
    } finally {
      setSaving(false);
    }
  };

  const createBuilding = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const created = await apiRequest<DirectoryBuilding[]>(
        `/v1/condominiums/${condominiumId}/buildings`,
        session,
        { method: 'POST', body: JSON.stringify({ name: buildingName }) },
      );
      setBuildingName('');
      await load();
      const firstCreated = created[0];
      if (firstCreated) setUnitDraft((current) => ({ ...current, buildingId: firstCreated.id }));
      setPanel({ kind: 'create-unit' });
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la torre.',
      );
    } finally {
      setSaving(false);
    }
  };

  const assignPerson = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUnit) return;
    setSaving(true);
    setMessage('');
    try {
      const owner = assignmentDraft.role === 'owner';
      const path = owner
        ? `/v1/condominiums/${condominiumId}/units/${selectedUnit.id}/owners`
        : `/v1/condominiums/${condominiumId}/units/${selectedUnit.id}/occupancies`;
      await apiRequest(path, session, {
        method: 'POST',
        body: JSON.stringify(
          owner
            ? {
                personId: assignmentDraft.personId,
                ...(assignmentDraft.ownershipPercentage
                  ? { ownershipPercentage: Number(assignmentDraft.ownershipPercentage) }
                  : {}),
                isPrimaryContact: assignmentDraft.isPrimaryContact,
              }
            : {
                personId: assignmentDraft.personId,
                occupancyType: assignmentDraft.occupancyType,
                isPrimaryContact: assignmentDraft.isPrimaryContact,
              },
        ),
      });
      setAssignmentDraft({
        role: 'occupant',
        personId: '',
        occupancyType: 'tenant',
        ownershipPercentage: '',
        isPrimaryContact: false,
      });
      await loadUnitDetail(selectedUnit.id);
      setMessage('Relación registrada correctamente.');
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo registrar la relación.',
      );
    } finally {
      setSaving(false);
    }
  };

  const closeAssignment = async (assignmentId: string, owner: boolean) => {
    if (!selectedUnit) return;
    setSaving(true);
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/${owner ? 'unit-owners' : 'unit-occupancies'}/${assignmentId}`,
        session,
        {
          method: 'PATCH',
          body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
        },
      );
      await loadUnitDetail(selectedUnit.id);
      setMessage('La relación quedó cerrada en el historial.');
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo cerrar la relación.',
      );
    } finally {
      setSaving(false);
    }
  };

  const openPerson = (person: DirectoryPerson) => {
    setPersonDraft({
      firstName: person.first_name,
      lastName: person.last_name,
      email: person.email ?? '',
      phone: person.phone ?? '',
      status: person.status === 'inactive' ? 'inactive' : 'active',
    });
    setMessage('');
    setPanel({ kind: 'person-detail', personId: person.id });
  };

  if (loading && !units.length && !people.length) return <DirectoryLoading />;

  if (error && !units.length && !people.length) {
    return (
      <Surface>
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error}
          icon={<CommunityIcon size={27} />}
          onAction={() => void load()}
          title="No pudimos cargar el directorio"
        />
      </Surface>
    );
  }

  const isUnits = mode === 'units';
  const resultCount = isUnits ? filteredUnits.length : filteredPeople.length;

  return (
    <div className="directory-page">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setMessage('');
              if (isUnits) setPanel({ kind: 'create-unit' });
              else {
                setPersonDraft({
                  firstName: '',
                  lastName: '',
                  email: '',
                  phone: '',
                  status: 'active',
                });
                setPanel({ kind: 'create-person' });
              }
            }}
          >
            <PlusIcon />
            {isUnits ? 'Nueva unidad' : 'Nueva persona'}
          </Button>
        }
        description={
          isUnits
            ? 'Organiza el inventario y abre cada unidad para administrar propietarios y residentes.'
            : 'Un directorio centralizado para contactos, residentes, propietarios e inquilinos.'
        }
        eyebrow={`Comunidad · ${condominiumName}`}
        title={isUnits ? 'Unidades' : 'Personas'}
      />

      {error ? (
        <div className="directory-inline-alert">
          {error} Se muestran los últimos datos cargados.
        </div>
      ) : null}

      <section className="directory-metrics" aria-label="Resumen del directorio">
        <DirectoryMetric
          detail="Inventario total"
          icon={<UnitsIcon size={20} />}
          label="Unidades"
          value={units.length}
        />
        <DirectoryMetric
          detail="Disponibles en operación"
          icon={<ArrowRightIcon size={20} />}
          label="Activas"
          value={unitSummary.active}
        />
        <DirectoryMetric
          detail="Contactos vigentes"
          icon={<PeopleIcon size={20} />}
          label="Personas activas"
          value={activePeople}
        />
        <DirectoryMetric
          detail="Estructura física"
          icon={<CommunityIcon size={20} />}
          label="Torres"
          value={buildings.length}
        />
      </section>

      <Surface className="directory-workspace">
        <div className="directory-toolbar">
          <label className="directory-search">
            <SearchIcon />
            <input
              aria-label={isUnits ? 'Buscar unidades' : 'Buscar personas'}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                isUnits
                  ? 'Buscar por unidad, torre, piso o tipo…'
                  : 'Buscar por nombre, correo o teléfono…'
              }
              type="search"
              value={query}
            />
          </label>
          <div className="directory-filters">
            {isUnits ? (
              <Select
                aria-label="Filtrar por torre"
                onChange={(event) => setBuildingFilter(event.target.value)}
                value={buildingFilter}
              >
                <option value="">Todas las torres</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              aria-label="Filtrar por estado"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
            <div className="directory-view-toggle" aria-label="Cambiar vista">
              <button
                aria-label="Vista de tarjetas"
                data-active={view === 'grid'}
                onClick={() => setView('grid')}
                type="button"
              >
                <GridIcon />
              </button>
              <button
                aria-label="Vista de lista"
                data-active={view === 'list'}
                onClick={() => setView('list')}
                type="button"
              >
                <ListIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="directory-results-heading">
          <strong>{resultCount} resultados</strong>
          <span>
            {query || statusFilter || buildingFilter ? 'Filtros aplicados' : 'Directorio completo'}
          </span>
        </div>

        {isUnits ? (
          filteredUnits.length ? (
            <div className="directory-unit-grid" data-view={view}>
              {filteredUnits.map((unit) => (
                <button key={unit.id} onClick={() => void loadUnitDetail(unit.id)} type="button">
                  <div className="directory-unit-card__top">
                    <span className="directory-unit-card__icon">
                      <UnitsIcon size={20} />
                    </span>
                    <Badge tone={unit.status === 'active' ? 'success' : 'neutral'}>
                      {getUnitStatusLabel(unit.status)}
                    </Badge>
                  </div>
                  <div className="directory-unit-card__identity">
                    <strong>{unit.code}</strong>
                    <span>{getBuildingName(unit, buildings)}</span>
                  </div>
                  <div className="directory-unit-card__meta">
                    <span>{getUnitTypeLabel(unit.type)}</span>
                    <span>{unit.floor ? `Piso ${unit.floor}` : 'Piso no indicado'}</span>
                    <ArrowRightIcon size={17} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              actionLabel="Limpiar filtros"
              description="Prueba otra búsqueda o elimina los filtros aplicados."
              icon={<UnitsIcon size={27} />}
              onAction={() => {
                setQuery('');
                setBuildingFilter('');
                setStatusFilter('');
              }}
              title="No encontramos unidades"
            />
          )
        ) : filteredPeople.length ? (
          <div className="directory-people-grid" data-view={view}>
            {filteredPeople.map((person) => (
              <button key={person.id} onClick={() => openPerson(person)} type="button">
                <span className="directory-avatar">{getPersonInitials(person)}</span>
                <div>
                  <strong>{getPersonName(person)}</strong>
                  <span>{person.email || person.phone || 'Sin datos de contacto'}</span>
                </div>
                <Badge tone={person.status === 'inactive' ? 'neutral' : 'success'}>
                  {getPersonStatusLabel(person.status)}
                </Badge>
                <ArrowRightIcon size={17} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            actionLabel="Limpiar filtros"
            description="Prueba otra búsqueda o elimina los filtros aplicados."
            icon={<PeopleIcon size={27} />}
            onAction={() => {
              setQuery('');
              setStatusFilter('');
            }}
            title="No encontramos personas"
          />
        )}
      </Surface>

      {panel ? (
        <div className="directory-drawer-layer">
          <button
            aria-label="Cerrar panel"
            className="directory-drawer-backdrop"
            onClick={() => setPanel(null)}
            type="button"
          />
          <aside aria-modal="true" className="directory-drawer" role="dialog">
            <button
              aria-label="Cerrar"
              className="directory-drawer__close"
              onClick={() => setPanel(null)}
              type="button"
            >
              <CloseIcon />
            </button>

            {panel.kind === 'create-unit' ? (
              <form
                className="directory-drawer__content"
                onSubmit={(event) => void createUnit(event)}
              >
                <div className="directory-drawer__heading">
                  <span className="directory-drawer__icon">
                    <UnitsIcon size={22} />
                  </span>
                  <div>
                    <span>Nueva unidad</span>
                    <h2>Agregar al inventario</h2>
                    <p>Registra la ubicación y características básicas.</p>
                  </div>
                </div>
                <div className="directory-form-grid">
                  <Field label="Código de unidad">
                    <input
                      onChange={(event) =>
                        setUnitDraft((current) => ({ ...current, code: event.target.value }))
                      }
                      placeholder="Ej. A-2B"
                      required
                      value={unitDraft.code}
                    />
                  </Field>
                  <Field label="Tipo">
                    <Select
                      onChange={(event) =>
                        setUnitDraft((current) => ({ ...current, type: event.target.value }))
                      }
                      value={unitDraft.type}
                    >
                      {unitTypes.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Torre o edificio">
                    <Select
                      onChange={(event) =>
                        setUnitDraft((current) => ({ ...current, buildingId: event.target.value }))
                      }
                      value={unitDraft.buildingId}
                    >
                      <option value="">Sin torre</option>
                      {buildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <button
                    className="directory-inline-action"
                    onClick={() => setPanel({ kind: 'create-building' })}
                    type="button"
                  >
                    <PlusIcon size={16} /> Crear nueva torre
                  </button>
                  <Field label="Piso">
                    <input
                      onChange={(event) =>
                        setUnitDraft((current) => ({ ...current, floor: event.target.value }))
                      }
                      placeholder="Ej. 2"
                      value={unitDraft.floor}
                    />
                  </Field>
                  <Field label="Alícuota" hint="Porcentaje opcional entre 0 y 100.">
                    <input
                      max="100"
                      min="0.01"
                      onChange={(event) =>
                        setUnitDraft((current) => ({
                          ...current,
                          ownershipPercentage: event.target.value,
                        }))
                      }
                      step="0.01"
                      type="number"
                      value={unitDraft.ownershipPercentage}
                    />
                  </Field>
                  <Field label="Estado">
                    <Select
                      onChange={(event) =>
                        setUnitDraft((current) => ({ ...current, status: event.target.value }))
                      }
                      value={unitDraft.status}
                    >
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva</option>
                    </Select>
                  </Field>
                </div>
                {message ? <div className="directory-form-message">{message}</div> : null}
                <div className="directory-drawer__actions">
                  <Button onClick={() => setPanel(null)} type="button" variant="ghost">
                    Cancelar
                  </Button>
                  <Button disabled={saving} type="submit">
                    {saving ? 'Guardando…' : 'Crear unidad'}
                  </Button>
                </div>
              </form>
            ) : null}

            {panel.kind === 'create-building' ? (
              <form
                className="directory-drawer__content"
                onSubmit={(event) => void createBuilding(event)}
              >
                <div className="directory-drawer__heading">
                  <span className="directory-drawer__icon">
                    <CommunityIcon size={22} />
                  </span>
                  <div>
                    <span>Estructura</span>
                    <h2>Nueva torre</h2>
                    <p>La torre quedará disponible inmediatamente en el formulario de unidad.</p>
                  </div>
                </div>
                <Field label="Nombre de la torre">
                  <input
                    onChange={(event) => setBuildingName(event.target.value)}
                    placeholder="Ej. Torre Norte"
                    required
                    value={buildingName}
                  />
                </Field>
                {message ? <div className="directory-form-message">{message}</div> : null}
                <div className="directory-drawer__actions">
                  <Button
                    onClick={() => setPanel({ kind: 'create-unit' })}
                    type="button"
                    variant="ghost"
                  >
                    Volver
                  </Button>
                  <Button disabled={saving} type="submit">
                    {saving ? 'Guardando…' : 'Crear torre'}
                  </Button>
                </div>
              </form>
            ) : null}

            {panel.kind === 'create-person' || panel.kind === 'person-detail' ? (
              <form
                className="directory-drawer__content"
                onSubmit={(event) => void savePerson(event)}
              >
                <div className="directory-drawer__heading">
                  <span className="directory-avatar directory-avatar--large">
                    {selectedPerson ? getPersonInitials(selectedPerson) : <PeopleIcon size={22} />}
                  </span>
                  <div>
                    <span>{selectedPerson ? 'Perfil de contacto' : 'Nueva persona'}</span>
                    <h2>
                      {selectedPerson ? getPersonName(selectedPerson) : 'Agregar al directorio'}
                    </h2>
                    <p>
                      {selectedPerson
                        ? 'Actualiza sus datos sin perder el historial de relaciones.'
                        : 'Registra los datos de contacto básicos.'}
                    </p>
                  </div>
                </div>
                <div className="directory-form-grid directory-form-grid--two">
                  <Field label="Nombre">
                    <input
                      onChange={(event) =>
                        setPersonDraft((current) => ({ ...current, firstName: event.target.value }))
                      }
                      required
                      value={personDraft.firstName}
                    />
                  </Field>
                  <Field label="Apellido">
                    <input
                      onChange={(event) =>
                        setPersonDraft((current) => ({ ...current, lastName: event.target.value }))
                      }
                      required
                      value={personDraft.lastName}
                    />
                  </Field>
                  <Field label="Correo electrónico">
                    <input
                      onChange={(event) =>
                        setPersonDraft((current) => ({ ...current, email: event.target.value }))
                      }
                      type="email"
                      value={personDraft.email}
                    />
                  </Field>
                  <Field label="Teléfono">
                    <input
                      onChange={(event) =>
                        setPersonDraft((current) => ({ ...current, phone: event.target.value }))
                      }
                      value={personDraft.phone}
                    />
                  </Field>
                  <Field label="Estado">
                    <Select
                      onChange={(event) =>
                        setPersonDraft((current) => ({ ...current, status: event.target.value }))
                      }
                      value={personDraft.status}
                    >
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva</option>
                    </Select>
                  </Field>
                </div>
                {message ? <div className="directory-form-message">{message}</div> : null}
                <div className="directory-drawer__actions">
                  <Button onClick={() => setPanel(null)} type="button" variant="ghost">
                    Cancelar
                  </Button>
                  <Button disabled={saving} type="submit">
                    {saving ? 'Guardando…' : selectedPerson ? 'Guardar cambios' : 'Crear persona'}
                  </Button>
                </div>
              </form>
            ) : null}

            {panel.kind === 'unit-detail' && selectedUnit ? (
              <div className="directory-drawer__content">
                <div className="directory-drawer__heading">
                  <span className="directory-drawer__icon">
                    <UnitsIcon size={22} />
                  </span>
                  <div>
                    <span>{getBuildingName(selectedUnit, buildings)}</span>
                    <h2>Unidad {selectedUnit.code}</h2>
                    <p>
                      {getUnitTypeLabel(selectedUnit.type)} ·{' '}
                      {selectedUnit.floor ? `Piso ${selectedUnit.floor}` : 'Piso no indicado'}
                    </p>
                  </div>
                </div>
                <div className="directory-unit-summary">
                  <div>
                    <span>Estado</span>
                    <Badge tone={selectedUnit.status === 'active' ? 'success' : 'neutral'}>
                      {getUnitStatusLabel(selectedUnit.status)}
                    </Badge>
                  </div>
                  <div>
                    <span>Alícuota</span>
                    <strong>
                      {selectedUnit.ownership_percentage
                        ? `${selectedUnit.ownership_percentage}%`
                        : 'No indicada'}
                    </strong>
                  </div>
                </div>
                {detailLoading ? (
                  <Skeleton className="directory-detail-skeleton" />
                ) : (
                  <>
                    <section className="directory-relations">
                      <div className="directory-subheading">
                        <div>
                          <span>Relaciones actuales</span>
                          <h3>Propietarios y residentes</h3>
                        </div>
                        <Badge tone="info">
                          {(unitDetail?.owners.filter(isCurrentAssignment).length ?? 0) +
                            (unitDetail?.occupancies.filter(isCurrentAssignment).length ?? 0)}
                        </Badge>
                      </div>
                      <div className="directory-relation-list">
                        {[
                          ...(unitDetail?.owners ?? []).map((item) => ({
                            ...item,
                            relation: 'Propietario',
                            owner: true,
                          })),
                          ...(unitDetail?.occupancies ?? []).map((item) => ({
                            ...item,
                            relation:
                              occupancyTypes.find(
                                ([value]) => value === item.occupancy_type,
                              )?.[1] ?? 'Residente',
                            owner: false,
                          })),
                        ].map((assignment) => {
                          const person = people.find((item) => item.id === assignment.person_id);
                          const current = isCurrentAssignment(assignment);
                          return (
                            <article
                              key={`${assignment.owner ? 'owner' : 'occupant'}-${assignment.id}`}
                              data-current={current}
                            >
                              <span className="directory-avatar">
                                {person ? getPersonInitials(person) : '—'}
                              </span>
                              <div>
                                <strong>
                                  {person ? getPersonName(person) : 'Persona no encontrada'}
                                </strong>
                                <span>
                                  {assignment.relation}
                                  {assignment.is_primary_contact ? ' · Contacto principal' : ''}
                                </span>
                              </div>
                              <Badge tone={current ? 'success' : 'neutral'}>
                                {current ? 'Actual' : 'Histórico'}
                              </Badge>
                              {current ? (
                                <button
                                  disabled={saving}
                                  onClick={() =>
                                    void closeAssignment(assignment.id, assignment.owner)
                                  }
                                  type="button"
                                >
                                  Cerrar
                                </button>
                              ) : null}
                            </article>
                          );
                        })}
                        {!unitDetail?.owners.length && !unitDetail?.occupancies.length ? (
                          <p className="directory-empty-copy">
                            Todavía no hay propietarios ni residentes vinculados.
                          </p>
                        ) : null}
                      </div>
                    </section>
                    <form
                      className="directory-assignment-form"
                      onSubmit={(event) => void assignPerson(event)}
                    >
                      <div className="directory-subheading">
                        <div>
                          <span>Nueva relación</span>
                          <h3>Vincular una persona</h3>
                        </div>
                      </div>
                      <Field label="Persona">
                        <Select
                          onChange={(event) =>
                            setAssignmentDraft((current) => ({
                              ...current,
                              personId: event.target.value,
                            }))
                          }
                          required
                          value={assignmentDraft.personId}
                        >
                          <option value="">Selecciona una persona</option>
                          {people
                            .filter((person) => person.status !== 'inactive')
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {getPersonName(person)}
                              </option>
                            ))}
                        </Select>
                      </Field>
                      <div className="directory-form-grid directory-form-grid--two">
                        <Field label="Relación">
                          <Select
                            onChange={(event) =>
                              setAssignmentDraft((current) => ({
                                ...current,
                                role: event.target.value,
                              }))
                            }
                            value={assignmentDraft.role}
                          >
                            <option value="occupant">Residente</option>
                            <option value="owner">Propietario</option>
                          </Select>
                        </Field>
                        {assignmentDraft.role === 'owner' ? (
                          <Field label="Porcentaje">
                            <input
                              max="100"
                              min="0.01"
                              onChange={(event) =>
                                setAssignmentDraft((current) => ({
                                  ...current,
                                  ownershipPercentage: event.target.value,
                                }))
                              }
                              step="0.01"
                              type="number"
                              value={assignmentDraft.ownershipPercentage}
                            />
                          </Field>
                        ) : (
                          <Field label="Tipo de ocupación">
                            <Select
                              onChange={(event) =>
                                setAssignmentDraft((current) => ({
                                  ...current,
                                  occupancyType: event.target.value,
                                }))
                              }
                              value={assignmentDraft.occupancyType}
                            >
                              {occupancyTypes.map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        )}
                      </div>
                      <label className="directory-checkbox">
                        <input
                          checked={assignmentDraft.isPrimaryContact}
                          onChange={(event) =>
                            setAssignmentDraft((current) => ({
                              ...current,
                              isPrimaryContact: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                        <span>Marcar como contacto principal</span>
                      </label>
                      <Button disabled={saving || !assignmentDraft.personId} type="submit">
                        <PlusIcon size={17} />
                        {saving ? 'Guardando…' : 'Registrar relación'}
                      </Button>
                    </form>
                  </>
                )}
                {message ? <div className="directory-form-message">{message}</div> : null}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
