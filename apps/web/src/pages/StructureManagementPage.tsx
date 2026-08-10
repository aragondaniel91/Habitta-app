import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, SettingsIcon, UnitsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';

type Building = {
  id: string;
  condominium_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type Unit = {
  id: string;
  condominium_id: string;
  building_id: string | null;
  code: string;
  type: 'apartment' | 'house' | 'commercial' | 'parking' | 'storage';
  floor: string | null;
  ownership_percentage: number | string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type EditorState =
  { kind: 'building'; building: Building | null } | { kind: 'unit'; unit: Unit | null } | null;

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const unitTypeLabels: Record<Unit['type'], string> = {
  apartment: 'Apartamento',
  house: 'Casa',
  commercial: 'Local comercial',
  parking: 'Estacionamiento',
  storage: 'Depósito',
};

const unitTypeOptions = Object.entries(unitTypeLabels) as Array<[Unit['type'], string]>;

function normalizePercentage(value: Unit['ownership_percentage']) {
  if (value === null || value === '') return '';
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? String(numberValue) : '';
}

function StructureSkeleton() {
  return (
    <div className="structure-page">
      <Skeleton className="structure-skeleton structure-skeleton--hero" />
      <div className="structure-metrics">
        <Skeleton className="structure-skeleton" />
        <Skeleton className="structure-skeleton" />
        <Skeleton className="structure-skeleton" />
      </div>
      <Skeleton className="structure-skeleton structure-skeleton--content" />
    </div>
  );
}

export function StructureManagementPage({ condominiumId, condominiumName, session }: Props) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [activeView, setActiveView] = useState<'units' | 'buildings'>('units');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadStructure = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [buildingItems, unitItems] = await Promise.all([
        apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
        apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
      ]);
      setBuildings(buildingItems);
      setUnits(unitItems);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo cargar la estructura física.',
      });
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  const buildingById = useMemo(
    () => new Map(buildings.map((building) => [building.id, building])),
    [buildings],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase('es');
  const filteredUnits = useMemo(
    () =>
      units.filter((unit) => {
        if (!normalizedSearch) return true;
        const buildingName = unit.building_id
          ? (buildingById.get(unit.building_id)?.name ?? '')
          : '';
        return [unit.code, unit.floor ?? '', unitTypeLabels[unit.type], buildingName, unit.status]
          .join(' ')
          .toLocaleLowerCase('es')
          .includes(normalizedSearch);
      }),
    [buildingById, normalizedSearch, units],
  );

  const filteredBuildings = useMemo(
    () =>
      buildings.filter(
        (building) =>
          !normalizedSearch || building.name.toLocaleLowerCase('es').includes(normalizedSearch),
      ),
    [buildings, normalizedSearch],
  );

  const activeUnits = units.filter((unit) => unit.status === 'active').length;
  const unassignedUnits = units.filter((unit) => !unit.building_id).length;

  async function saveBuilding(event: FormEvent<HTMLFormElement>, building: Building | null) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;

    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(
        building
          ? `/v1/condominiums/${condominiumId}/buildings/${building.id}`
          : `/v1/condominiums/${condominiumId}/buildings`,
        session,
        {
          method: building ? 'PATCH' : 'POST',
          body: JSON.stringify({ name }),
        },
      );
      await loadStructure();
      setEditor(null);
      setMessage({
        tone: 'success',
        text: building ? 'La torre o edificio fue actualizado.' : 'La torre o edificio fue creado.',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo guardar la torre o edificio.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveUnit(event: FormEvent<HTMLFormElement>, unit: Unit | null) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const percentage = String(form.get('ownershipPercentage') ?? '').trim();
    const payload = {
      code: String(form.get('code') ?? '').trim(),
      buildingId: String(form.get('buildingId') ?? '') || null,
      type: String(form.get('type') ?? 'apartment'),
      floor: String(form.get('floor') ?? '').trim() || null,
      ownershipPercentage: percentage ? Number(percentage) : null,
      status: String(form.get('status') ?? 'active'),
    };

    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(
        unit
          ? `/v1/condominiums/${condominiumId}/units/${unit.id}`
          : `/v1/condominiums/${condominiumId}/units`,
        session,
        {
          method: unit ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      await loadStructure();
      setEditor(null);
      setMessage({
        tone: 'success',
        text: unit ? 'La unidad fue actualizada.' : 'La unidad fue creada.',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo guardar la unidad.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !units.length && !buildings.length) return <StructureSkeleton />;

  return (
    <div className="structure-page">
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => setEditor({ kind: 'building', building: null })}
              variant="secondary"
            >
              Nueva torre o edificio
            </Button>
            <Button onClick={() => setEditor({ kind: 'unit', unit: null })}>Nueva unidad</Button>
          </>
        }
        description={`Organiza la estructura física de ${condominiumName}. Los cambios preservan el historial: una unidad se inactiva en lugar de eliminarse.`}
        eyebrow="Estructura del condominio"
        title="Unidades, torres y edificios"
      />

      {message ? (
        <div className="structure-message" data-tone={message.tone} role="status">
          {message.tone === 'success' ? <CheckCircleIcon size={18} /> : <SettingsIcon size={18} />}
          <span>{message.text}</span>
          {message.tone === 'error' ? (
            <button onClick={() => void loadStructure()} type="button">
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="structure-metrics">
        <Surface className="structure-metric">
          <span>Unidades registradas</span>
          <strong>{units.length}</strong>
          <small>{activeUnits} activas</small>
        </Surface>
        <Surface className="structure-metric">
          <span>Torres y edificios</span>
          <strong>{buildings.length}</strong>
          <small>Estructura administrable</small>
        </Surface>
        <Surface className="structure-metric">
          <span>Sin torre asignada</span>
          <strong>{unassignedUnits}</strong>
          <small>Casas, locales o áreas independientes</small>
        </Surface>
      </div>

      <Surface className="structure-workspace">
        <div className="structure-toolbar">
          <div className="structure-tabs" aria-label="Vista de estructura" role="tablist">
            <button
              aria-selected={activeView === 'units'}
              data-active={activeView === 'units'}
              onClick={() => setActiveView('units')}
              role="tab"
              type="button"
            >
              Unidades <span>{units.length}</span>
            </button>
            <button
              aria-selected={activeView === 'buildings'}
              data-active={activeView === 'buildings'}
              onClick={() => setActiveView('buildings')}
              role="tab"
              type="button"
            >
              Torres y edificios <span>{buildings.length}</span>
            </button>
          </div>
          <label className="structure-search">
            <span className="sr-only">Buscar</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                activeView === 'units' ? 'Buscar unidad, piso o torre' : 'Buscar torre o edificio'
              }
              type="search"
              value={search}
            />
          </label>
        </div>

        {activeView === 'units' ? (
          filteredUnits.length ? (
            <div className="structure-unit-list">
              <div className="structure-unit-list__head" aria-hidden="true">
                <span>Unidad</span>
                <span>Ubicación</span>
                <span>Tipo</span>
                <span>Alícuota</span>
                <span>Estado</span>
                <span />
              </div>
              {filteredUnits.map((unit) => {
                const building = unit.building_id ? buildingById.get(unit.building_id) : null;
                return (
                  <article className="structure-unit-row" key={unit.id}>
                    <div className="structure-unit-row__identity">
                      <span className="structure-unit-icon">
                        <UnitsIcon size={19} />
                      </span>
                      <div>
                        <strong>{unit.code}</strong>
                        <small>{unit.floor ? `Piso ${unit.floor}` : 'Piso no indicado'}</small>
                      </div>
                    </div>
                    <div data-label="Ubicación">
                      <strong>{building?.name ?? 'Sin torre asignada'}</strong>
                      <small>{building ? 'Torre o edificio' : 'Unidad independiente'}</small>
                    </div>
                    <div data-label="Tipo">{unitTypeLabels[unit.type]}</div>
                    <div data-label="Alícuota">
                      {unit.ownership_percentage === null
                        ? 'No definida'
                        : `${normalizePercentage(unit.ownership_percentage)}%`}
                    </div>
                    <div data-label="Estado">
                      <Badge tone={unit.status === 'active' ? 'success' : 'neutral'}>
                        {unit.status === 'active' ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                    <Button
                      onClick={() => setEditor({ kind: 'unit', unit })}
                      size="sm"
                      variant="ghost"
                    >
                      Editar
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              actionLabel="Crear unidad"
              description={
                search
                  ? 'No encontramos unidades con esos criterios.'
                  : 'Registra apartamentos, casas, locales, depósitos o estacionamientos.'
              }
              icon={<UnitsIcon size={25} />}
              onAction={() => setEditor({ kind: 'unit', unit: null })}
              title={search ? 'Sin coincidencias' : 'Aún no hay unidades'}
            />
          )
        ) : filteredBuildings.length ? (
          <div className="structure-building-grid">
            {filteredBuildings.map((building) => {
              const buildingUnits = units.filter((unit) => unit.building_id === building.id);
              const activeBuildingUnits = buildingUnits.filter(
                (unit) => unit.status === 'active',
              ).length;
              return (
                <article className="structure-building-card" key={building.id}>
                  <div className="structure-building-card__top">
                    <span className="structure-building-card__icon">
                      <UnitsIcon size={23} />
                    </span>
                    <Button
                      onClick={() => setEditor({ kind: 'building', building })}
                      size="sm"
                      variant="ghost"
                    >
                      Editar
                    </Button>
                  </div>
                  <h2>{building.name}</h2>
                  <p>
                    {buildingUnits.length}{' '}
                    {buildingUnits.length === 1 ? 'unidad registrada' : 'unidades registradas'}
                  </p>
                  <div className="structure-building-card__stats">
                    <span>
                      <strong>{activeBuildingUnits}</strong> activas
                    </span>
                    <span>
                      <strong>{buildingUnits.length - activeBuildingUnits}</strong> inactivas
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            actionLabel="Crear torre o edificio"
            description={
              search
                ? 'No encontramos torres o edificios con ese nombre.'
                : 'Crea las torres o edificios antes de asignarles unidades. Las casas independientes pueden quedar sin torre.'
            }
            icon={<UnitsIcon size={25} />}
            onAction={() => setEditor({ kind: 'building', building: null })}
            title={search ? 'Sin coincidencias' : 'Aún no hay torres o edificios'}
          />
        )}
      </Surface>

      {editor ? (
        <div className="structure-dialog-backdrop" onMouseDown={() => !saving && setEditor(null)}>
          <section
            aria-labelledby="structure-dialog-title"
            aria-modal="true"
            className="structure-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="structure-dialog__header">
              <div>
                <span>{editor.kind === 'unit' ? 'UNIDAD' : 'TORRE O EDIFICIO'}</span>
                <h2 id="structure-dialog-title">
                  {editor.kind === 'unit'
                    ? editor.unit
                      ? `Editar ${editor.unit.code}`
                      : 'Crear unidad'
                    : editor.building
                      ? `Editar ${editor.building.name}`
                      : 'Crear torre o edificio'}
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                disabled={saving}
                onClick={() => setEditor(null)}
                type="button"
              >
                ×
              </button>
            </div>

            {editor.kind === 'building' ? (
              <form onSubmit={(event) => void saveBuilding(event, editor.building)}>
                <div className="structure-dialog__body">
                  <Field
                    hint="Ejemplos: Torre A, Edificio Norte, Bloque 3."
                    label="Nombre de la torre o edificio"
                  >
                    <input defaultValue={editor.building?.name ?? ''} name="name" required />
                  </Field>
                  <div className="structure-form-note">
                    Cambiar el nombre actualiza la ubicación mostrada en todas sus unidades. No
                    elimina ni modifica el historial.
                  </div>
                </div>
                <div className="structure-dialog__footer">
                  <Button
                    disabled={saving}
                    onClick={() => setEditor(null)}
                    type="button"
                    variant="ghost"
                  >
                    Cancelar
                  </Button>
                  <Button disabled={saving} type="submit">
                    {saving ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={(event) => void saveUnit(event, editor.unit)}>
                <div className="structure-dialog__body structure-form-grid">
                  <Field label="Código o número de unidad">
                    <input
                      defaultValue={editor.unit?.code ?? ''}
                      maxLength={40}
                      name="code"
                      required
                    />
                  </Field>
                  <Field label="Torre o edificio">
                    <Select defaultValue={editor.unit?.building_id ?? ''} name="buildingId">
                      <option value="">Sin torre asignada</option>
                      {buildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Tipo">
                    <Select defaultValue={editor.unit?.type ?? 'apartment'} name="type">
                      {unitTypeOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    hint="Puede ser un número, PB, PH o nivel descriptivo."
                    label="Piso o nivel"
                  >
                    <input defaultValue={editor.unit?.floor ?? ''} maxLength={20} name="floor" />
                  </Field>
                  <Field hint="Porcentaje de participación entre 0 y 100." label="Alícuota (%)">
                    <input
                      defaultValue={normalizePercentage(editor.unit?.ownership_percentage ?? null)}
                      max="100"
                      min="0.0001"
                      name="ownershipPercentage"
                      step="0.0001"
                      type="number"
                    />
                  </Field>
                  <Field
                    hint="Inactiva conserva pagos, cuotas, propietarios y ocupaciones históricas."
                    label="Estado"
                  >
                    <Select defaultValue={editor.unit?.status ?? 'active'} name="status">
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva / archivada</option>
                    </Select>
                  </Field>
                </div>
                <div className="structure-dialog__footer">
                  <Button
                    disabled={saving}
                    onClick={() => setEditor(null)}
                    type="button"
                    variant="ghost"
                  >
                    Cancelar
                  </Button>
                  <Button disabled={saving} type="submit">
                    {saving ? 'Guardando…' : 'Guardar unidad'}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
