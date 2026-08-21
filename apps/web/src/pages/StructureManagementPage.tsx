import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Dialog, DialogBody, DialogFooter } from '../components/Dialog';
import { FormGrid } from '../components/FormLayout';
import { CheckCircleIcon, SettingsIcon, UnitsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { useCondominiumRoles } from '../lib/roles';
import {
  defaultUnitType,
  type PropertyTopology,
  UNIT_TYPE_LABELS,
  type UnitType,
  unitTypeOptions,
} from '../lib/unit-domain';
import '../structure-management.css';

type CondominiumProfile = {
  id: string;
  property_topology?: PropertyTopology;
  declared_unit_count?: number | null;
  declared_building_count?: number | null;
};

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
  type: UnitType;
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
  showUnitManagement?: boolean;
  onBackToUnits?: () => void;
};

export function topologyRemediationPayload(
  propertyTopology: Exclude<PropertyTopology, 'unspecified'>,
  declaredUnitCount: number | null,
  declaredBuildingCount: number | null,
) {
  return {
    propertyTopology,
    declaredUnitCount:
      propertyTopology === 'house_community' ||
      propertyTopology === 'single_building' ||
      propertyTopology === 'mixed'
        ? declaredUnitCount
        : null,
    declaredBuildingCount:
      propertyTopology === 'multi_building_complex' || propertyTopology === 'mixed'
        ? declaredBuildingCount
        : null,
  };
}

const topologyLabels: Record<PropertyTopology, string> = {
  unspecified: 'Estructura pendiente de definir',
  house_community: 'Conjunto de casas',
  single_building: 'Edificio residencial',
  multi_building_complex: 'Conjunto residencial',
  mixed: 'Estructura mixta',
};

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

export function StructureManagementPage({
  condominiumId,
  condominiumName,
  session,
  showUnitManagement = true,
  onBackToUnits,
}: Props) {
  const roles = useCondominiumRoles();
  const [profile, setProfile] = useState<CondominiumProfile | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [activeView, setActiveView] = useState<'units' | 'buildings'>(
    showUnitManagement ? 'units' : 'buildings',
  );
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [remediating, setRemediating] = useState(false);
  const [remediationTopology, setRemediationTopology] =
    useState<Exclude<PropertyTopology, 'unspecified'>>('house_community');
  const [remediationUnitCount, setRemediationUnitCount] = useState('');
  const [remediationBuildingCount, setRemediationBuildingCount] = useState('');
  const [remediationError, setRemediationError] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const topology = profile?.property_topology ?? 'unspecified';
  const houseMode = topology === 'house_community';
  const singleBuildingMode = topology === 'single_building';
  const multiBuildingMode = topology === 'multi_building_complex';
  const showBuildings = !houseMode;
  const canCreateBuilding = showBuildings && (!singleBuildingMode || buildings.length === 0);
  const availableUnitTypes = useMemo(() => unitTypeOptions(topology), [topology]);
  const canRemediate = roles.includes('condominium_admin');

  const loadStructure = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [profileRows, buildingItems, unitItems] = await Promise.all([
        apiRequest<CondominiumProfile[]>(`/v1/condominiums/${condominiumId}`, session),
        apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
        apiRequest<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
      ]);
      setProfile(profileRows[0] ?? null);
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

  useEffect(() => {
    if (houseMode && activeView === 'buildings') setActiveView('units');
  }, [activeView, houseMode]);

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
        return [unit.code, unit.floor ?? '', UNIT_TYPE_LABELS[unit.type], buildingName, unit.status]
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
        text: building ? 'El edificio fue actualizado.' : 'El edificio fue creado.',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo guardar el edificio.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveUnit(event: FormEvent<HTMLFormElement>, unit: Unit | null) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const percentage = String(form.get('ownershipPercentage') ?? '').trim();
    const selectedBuildingId = houseMode
      ? null
      : singleBuildingMode
        ? (buildings[0]?.id ?? null)
        : String(form.get('buildingId') ?? '') || null;
    const payload = {
      code: String(form.get('code') ?? '').trim(),
      buildingId: selectedBuildingId,
      type: String(form.get('type') ?? defaultUnitType(topology)),
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

  async function remediateTopology(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRemediationError('');
    const unitCount = remediationUnitCount ? Number(remediationUnitCount) : null;
    const buildingCount = remediationBuildingCount ? Number(remediationBuildingCount) : null;
    setSaving(true);
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/topology-remediation`, session, {
        method: 'POST',
        body: JSON.stringify(
          topologyRemediationPayload(remediationTopology, unitCount, buildingCount),
        ),
      });
      await loadStructure();
      setRemediating(false);
      setMessage({ tone: 'success', text: 'El tipo de propiedad fue definido.' });
    } catch (error) {
      setRemediationError(
        error instanceof Error ? error.message : 'No se pudo definir el tipo de propiedad.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !units.length && !buildings.length) return <StructureSkeleton />;

  const pageTitle = houseMode
    ? 'Casas y unidades'
    : singleBuildingMode
      ? 'Apartamentos y unidades'
      : 'Unidades, torres y edificios';
  const newUnitLabel = houseMode ? 'Nueva casa' : 'Nueva unidad';
  const declaredStructure =
    houseMode || singleBuildingMode
      ? profile?.declared_unit_count
      : profile?.declared_building_count;
  const unitEmptyDescription = houseMode
    ? 'Registra las casas, locales, depósitos o estacionamientos que forman parte de este condominio.'
    : singleBuildingMode || multiBuildingMode
      ? 'Registra apartamentos, locales, depósitos o estacionamientos de la estructura declarada.'
      : 'Registra las unidades que forman parte de este condominio.';

  const editorTitle = editor
    ? editor.kind === 'unit'
      ? editor.unit
        ? `Editar ${editor.unit.code}`
        : houseMode
          ? 'Crear casa'
          : 'Crear unidad'
      : editor.building
        ? `Editar ${editor.building.name}`
        : 'Crear edificio'
    : '';

  return (
    <div className="structure-page">
      <PageHeader
        actions={
          <>
            {canCreateBuilding ? (
              <Button
                onClick={() => setEditor({ kind: 'building', building: null })}
                variant="secondary"
              >
                {singleBuildingMode ? 'Crear edificio' : 'Nueva torre o edificio'}
              </Button>
            ) : null}
            {showUnitManagement ? (
              <Button
                disabled={singleBuildingMode && buildings.length !== 1}
                onClick={() => setEditor({ kind: 'unit', unit: null })}
              >
                {newUnitLabel}
              </Button>
            ) : null}
            {topology === 'unspecified' && canRemediate ? (
              <Button variant="secondary" onClick={() => setRemediating(true)}>
                Definir tipo de propiedad
              </Button>
            ) : null}
            {onBackToUnits ? (
              <Button onClick={onBackToUnits} variant="ghost">
                Volver a Unidades
              </Button>
            ) : null}
          </>
        }
        description={`Organiza la estructura física de ${condominiumName}. Habitta adapta las opciones al tipo de propiedad definido durante el onboarding.`}
        eyebrow={topologyLabels[topology]}
        title={pageTitle}
      />

      {topology === 'unspecified' ? (
        <div className="structure-message" data-tone="error" role="status">
          <SettingsIcon size={18} />
          <span>
            Este condominio fue creado con el modelo anterior. Completa su tipo de propiedad para
            activar la experiencia adaptativa.
          </span>
        </div>
      ) : null}

      {singleBuildingMode && buildings.length !== 1 ? (
        <div className="structure-message" data-tone="error" role="status">
          <SettingsIcon size={18} />
          <span>
            Antes de crear unidades configura el único edificio de este condominio. La base de datos
            también exige esa asociación para evitar unidades huérfanas.
          </span>
        </div>
      ) : null}

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
          <span>{houseMode ? 'Casas registradas' : 'Unidades registradas'}</span>
          <strong>{units.length}</strong>
          <small>{activeUnits} activas</small>
        </Surface>
        <Surface className="structure-metric">
          <span>
            {houseMode || singleBuildingMode ? 'Unidades declaradas' : 'Edificios declarados'}
          </span>
          <strong>{declaredStructure ?? '—'}</strong>
          <small>{topologyLabels[topology]}</small>
        </Surface>
        <Surface className="structure-metric">
          <span>{showBuildings ? 'Sin edificio asignado' : 'Unidades inactivas'}</span>
          <strong>{showBuildings ? unassignedUnits : units.length - activeUnits}</strong>
          <small>
            {showBuildings ? 'Áreas comunes o pendientes de ubicar' : 'Historial preservado'}
          </small>
        </Surface>
      </div>

      <Surface className="structure-workspace">
        <div className="structure-toolbar">
          <div className="structure-tabs" aria-label="Vista de estructura" role="tablist">
            {showUnitManagement ? (
              <button
                aria-selected={activeView === 'units'}
                data-active={activeView === 'units'}
                onClick={() => setActiveView('units')}
                role="tab"
                type="button"
              >
                {houseMode ? 'Casas' : 'Unidades'} <span>{units.length}</span>
              </button>
            ) : null}
            {showBuildings ? (
              <button
                aria-selected={activeView === 'buildings'}
                data-active={activeView === 'buildings'}
                onClick={() => setActiveView('buildings')}
                role="tab"
                type="button"
              >
                {singleBuildingMode ? 'Edificio' : 'Torres y edificios'}{' '}
                <span>{buildings.length}</span>
              </button>
            ) : null}
          </div>
          <label className="structure-search">
            <span className="sr-only">Buscar</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                activeView === 'units'
                  ? houseMode
                    ? 'Buscar casa o unidad'
                    : 'Buscar unidad, piso o edificio'
                  : 'Buscar torre o edificio'
              }
              type="search"
              value={search}
            />
          </label>
        </div>

        {showUnitManagement && activeView === 'units' ? (
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
                        <small>
                          {houseMode
                            ? 'Casa / unidad independiente'
                            : unit.floor
                              ? `Piso ${unit.floor}`
                              : 'Piso no indicado'}
                        </small>
                      </div>
                    </div>
                    <div data-label="Ubicación">
                      <strong>
                        {houseMode ? condominiumName : (building?.name ?? 'Sin edificio asignado')}
                      </strong>
                      <small>
                        {houseMode
                          ? 'Conjunto de casas'
                          : building
                            ? `${building.name} · ${unit.code}`
                            : 'Área común / sin edificio'}
                      </small>
                    </div>
                    <div data-label="Tipo">{UNIT_TYPE_LABELS[unit.type]}</div>
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
              actionLabel={newUnitLabel}
              description={
                search ? 'No encontramos unidades con esos criterios.' : unitEmptyDescription
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
            actionLabel={
              canCreateBuilding
                ? singleBuildingMode
                  ? 'Crear edificio'
                  : 'Crear torre o edificio'
                : undefined
            }
            description={
              search
                ? 'No encontramos torres o edificios con ese nombre.'
                : 'Configura los edificios físicos antes de asignarles unidades.'
            }
            icon={<UnitsIcon size={25} />}
            onAction={
              canCreateBuilding ? () => setEditor({ kind: 'building', building: null }) : undefined
            }
            title={search ? 'Sin coincidencias' : 'Aún no hay edificios'}
          />
        )}
      </Surface>

      {editor ? (
        <Dialog
          closeDisabled={saving}
          eyebrow={editor.kind === 'unit' ? 'Unidad' : 'Edificio'}
          onClose={() => setEditor(null)}
          size="md"
          title={editorTitle}
        >
          {editor.kind === 'building' ? (
            <form onSubmit={(event) => void saveBuilding(event, editor.building)}>
              <DialogBody>
                <Field
                  hint="Ejemplos: Torre A, Edificio Norte, Bloque 3."
                  label="Nombre del edificio"
                >
                  <input
                    autoFocus
                    defaultValue={editor.building?.name ?? ''}
                    name="name"
                    required
                  />
                </Field>
                <div className="structure-form-note">
                  Cambiar el nombre conserva unidades e historial asociados.
                </div>
              </DialogBody>
              <DialogFooter>
                <Button
                  disabled={saving}
                  onClick={() => setEditor(null)}
                  type="button"
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button disabled={saving} type="submit">
                  {saving ? 'Guardando…' : 'Guardar edificio'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={(event) => void saveUnit(event, editor.unit)}>
              <DialogBody>
                <FormGrid>
                  <Field
                    label={houseMode ? 'Código o número de casa' : 'Código o número de unidad'}
                  >
                    <input
                      autoFocus
                      defaultValue={editor.unit?.code ?? ''}
                      maxLength={40}
                      name="code"
                      required
                    />
                  </Field>

                  {!houseMode && !singleBuildingMode ? (
                    <Field
                      hint={
                        multiBuildingMode ? 'El mismo código puede existir en otra torre.' : undefined
                      }
                      label="Torre o edificio"
                    >
                      <Select defaultValue={editor.unit?.building_id ?? ''} name="buildingId">
                        <option value="">Sin edificio / área común</option>
                        {buildings.map((building) => (
                          <option key={building.id} value={building.id}>
                            {building.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}

                  {singleBuildingMode ? (
                    <div className="structure-form-note" data-span="full">
                      Edificio: <strong>{buildings[0]?.name ?? 'Pendiente de configurar'}</strong>. La
                      unidad se asociará automáticamente y su código será único dentro de este
                      edificio.
                    </div>
                  ) : null}

                  <Field
                    hint={
                      houseMode
                        ? 'Habitta oculta Apartamento porque este condominio fue definido como conjunto de casas.'
                        : singleBuildingMode || multiBuildingMode
                          ? 'Habitta oculta Casa porque la estructura fue definida por edificios.'
                          : undefined
                    }
                    label="Tipo"
                  >
                    <Select defaultValue={editor.unit?.type ?? defaultUnitType(topology)} name="type">
                      {availableUnitTypes.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {!houseMode ? (
                    <Field
                      hint="Puede ser un número, PB, PH o nivel descriptivo."
                      label="Piso o nivel"
                    >
                      <input defaultValue={editor.unit?.floor ?? ''} maxLength={20} name="floor" />
                    </Field>
                  ) : null}

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
                </FormGrid>
              </DialogBody>
              <DialogFooter>
                <Button
                  disabled={saving}
                  onClick={() => setEditor(null)}
                  type="button"
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button disabled={saving} type="submit">
                  {saving ? 'Guardando…' : houseMode ? 'Guardar casa' : 'Guardar unidad'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </Dialog>
      ) : null}
      {remediating ? (
        <Dialog
          closeDisabled={saving}
          eyebrow="Remediación legacy"
          onClose={() => setRemediating(false)}
          size="md"
          title="Definir tipo de propiedad"
        >
          <form onSubmit={(event) => void remediateTopology(event)}>
            <DialogBody>
              <Field label="Tipo de propiedad">
                <Select
                  value={remediationTopology}
                  onChange={(event) =>
                    setRemediationTopology(
                      event.target.value as Exclude<PropertyTopology, 'unspecified'>,
                    )
                  }
                >
                  <option value="house_community">Conjunto de casas</option>
                  <option value="single_building">Edificio residencial</option>
                  <option value="multi_building_complex">Conjunto residencial</option>
                  <option value="mixed">Estructura mixta</option>
                </Select>
              </Field>
              {remediationTopology === 'house_community' ||
              remediationTopology === 'single_building' ||
              remediationTopology === 'mixed' ? (
                <Field
                  label={
                    remediationTopology === 'house_community'
                      ? 'Cantidad declarada de casas'
                      : 'Cantidad declarada de unidades'
                  }
                >
                  <input
                    min={Math.max(1, units.length)}
                    onChange={(event) => setRemediationUnitCount(event.target.value)}
                    type="number"
                    value={remediationUnitCount}
                    required={remediationTopology !== 'mixed'}
                  />
                </Field>
              ) : null}
              {remediationTopology === 'multi_building_complex' ||
              remediationTopology === 'mixed' ? (
                <Field label="Cantidad declarada de edificios o torres">
                  <input
                    min={Math.max(2, buildings.length)}
                    onChange={(event) => setRemediationBuildingCount(event.target.value)}
                    type="number"
                    value={remediationBuildingCount}
                    required={remediationTopology === 'multi_building_complex'}
                  />
                </Field>
              ) : null}
              {remediationTopology === 'single_building' ? (
                <div className="structure-form-note">
                  {buildings.length === 0
                    ? 'Después de guardar, configura el único edificio.'
                    : buildings.length === 1
                      ? 'Se conservará el edificio existente.'
                      : 'La estructura actual es incompatible y no se modificará.'}
                </div>
              ) : null}
              {remediationError ? (
                <div className="structure-message" data-tone="error">
                  {remediationError}
                </div>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button
                disabled={saving}
                onClick={() => setRemediating(false)}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? 'Guardando…' : 'Guardar tipo de propiedad'}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
