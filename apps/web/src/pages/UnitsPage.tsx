import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../components/Dialog';
import { PageHeader } from '../components/PageHeader';
import {
  InlineNotice,
  WorkspaceMetricCard,
  WorkspaceMetrics,
  WorkspaceSection,
} from '../components/WorkspaceUi';
import { CheckCircleIcon, HomeIcon, PeopleIcon, UnitsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Select, Skeleton } from '../components/ui';
import { UnitDetailDrawer } from '../features/units/UnitDetailDrawer';
import { UnitEditor } from '../features/units/UnitEditor';
import type { UnitEditorInput } from '../features/units/UnitEditor';
import type { CondominiumProfile, DirectoryUnit, UnitsDirectory } from '../features/units/types';
import { apiRequest } from '../lib/api';
import { canManage, useCondominiumRoles } from '../lib/roles';
import {
  supportsBuildingStructure,
  UNIT_TYPE_LABELS,
  unitReferenceLabel,
  unitTypeOptions,
} from '../lib/unit-domain';
import type { PropertyTopology, UnitType } from '../lib/unit-domain';
import '../units-v3.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
  onConfigureStructure?: () => void;
};

type StatusFilter = 'all' | 'active' | 'inactive';
type BuildingFilter = 'all' | string;
type Building = { id: string; condominium_id: string; name: string };
type Notice = { tone: 'success' | 'error'; text: string } | null;

const personSummary = (people: Array<{ firstName: string; lastName: string }>) => {
  if (!people.length) return 'Sin registro activo';
  const names = people.map((person) => `${person.firstName} ${person.lastName}`.trim());
  return names.length > 2
    ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    : names.join(', ');
};

const participationSummary = (unit: DirectoryUnit) => {
  if (!unit.owners.length) return 'Sin propietarios';
  const percentages = unit.owners
    .map((owner) => Number(owner.ownershipPercentage))
    .filter((value) => Number.isFinite(value));
  if (!percentages.length) return 'Participación no indicada';
  const total = percentages.reduce((sum, value) => sum + value, 0);
  return `${total.toLocaleString('es-VE', { maximumFractionDigits: 4 })}% asignado`;
};

const topologyGuidance: Record<PropertyTopology, string | null> = {
  unspecified:
    'Define la estructura del condominio antes de tomar decisiones sobre edificios o tipos de unidad.',
  house_community: null,
  single_building: null,
  multi_building_complex: null,
  mixed: null,
};

export function UnitsPage({
  condominiumId,
  condominiumName,
  session,
  onConfigureStructure,
}: Props) {
  const canMutate = canManage(useCondominiumRoles());
  const [profile, setProfile] = useState<CondominiumProfile | null>(null);
  const [units, setUnits] = useState<DirectoryUnit[]>([]);
  const [configuredBuildings, setConfiguredBuildings] = useState<Building[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<'all' | UnitType>('all');
  const [building, setBuilding] = useState<BuildingFilter>('all');
  const [selectedUnit, setSelectedUnit] = useState<DirectoryUnit | null>(null);
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit';
    unit: DirectoryUnit | null;
  } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DirectoryUnit | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setNotice(null);
    void Promise.all([
      apiRequest<CondominiumProfile[]>(`/v1/condominiums/${condominiumId}`, session),
      apiRequest<UnitsDirectory>(`/v1/condominiums/${condominiumId}/units-directory`, session),
      apiRequest<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
    ])
      .then(([profileRows, directory, buildingItems]) => {
        if (!active) return;
        setProfile(profileRows[0] ?? null);
        setUnits(directory.units);
        setConfiguredBuildings(buildingItems);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadError(
          reason instanceof Error ? reason.message : 'No se pudieron cargar las unidades.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [condominiumId, session]);

  useEffect(() => {
    setSelectedUnit(null);
    setEditor(null);
    setArchiveTarget(null);
    setSearch('');
    setStatus('all');
    setType('all');
    setBuilding('all');
  }, [condominiumId]);

  const topology = profile?.property_topology ?? 'unspecified';
  const buildingOptions = configuredBuildings.map(({ id, name }) => [id, name] as const);
  const filteredUnits = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es-VE');
    return units.filter((unit) => {
      const searchable = [
        unit.code,
        unit.building?.name,
        unit.floor,
        UNIT_TYPE_LABELS[unit.type],
        ...unit.owners,
        ...unit.occupancies,
      ]
        .map((value) =>
          typeof value === 'string'
            ? value
            : value && 'firstName' in value
              ? `${value.firstName} ${value.lastName}`
              : '',
        )
        .join(' ')
        .toLocaleLowerCase('es-VE');
      return (
        (status === 'all' || unit.status === status) &&
        (type === 'all' || unit.type === type) &&
        (building === 'all' || unit.buildingId === building) &&
        (!normalizedSearch || searchable.includes(normalizedSearch))
      );
    });
  }, [building, search, status, type, units]);

  const activeUnits = units.filter((unit) => unit.status === 'active').length;
  const unitsWithOwners = units.filter((unit) => unit.owners.length > 0).length;
  const occupiedUnits = units.filter((unit) => unit.occupancies.length > 0).length;
  const buildings = configuredBuildings.map(({ id, name }) => ({ id, name }));
  const singleBuildingReady = topology !== 'single_building' || buildings.length === 1;
  const canCreate = canMutate && topology !== 'unspecified' && singleBuildingReady;
  const filtersActive = Boolean(
    search.trim() || status !== 'all' || type !== 'all' || building !== 'all',
  );

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setType('all');
    setBuilding('all');
  };

  const refreshDirectory = async () => {
    const directory = await apiRequest<UnitsDirectory>(
      `/v1/condominiums/${condominiumId}/units-directory`,
      session,
    );
    setUnits(directory.units);
    return directory.units;
  };

  const saveUnit = async (input: UnitEditorInput) => {
    if (!editor) return;
    setSaving(true);
    setNotice(null);
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/units${editor.mode === 'edit' ? `/${editor.unit?.id}` : ''}`,
        session,
        { method: editor.mode === 'edit' ? 'PATCH' : 'POST', body: JSON.stringify(input) },
      );
      await refreshDirectory();
      setEditor(null);
      setSelectedUnit(null);
      setNotice({
        tone: 'success',
        text: editor.mode === 'edit' ? 'Unidad actualizada correctamente.' : 'Unidad creada.',
      });
    } catch (reason) {
      setNotice({
        tone: 'error',
        text: reason instanceof Error ? reason.message : 'No se pudo guardar la unidad.',
      });
    } finally {
      setSaving(false);
    }
  };

  const setUnitStatus = async (unit: DirectoryUnit, nextStatus: 'active' | 'inactive') => {
    setSaving(true);
    setNotice(null);
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/units/${unit.id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await refreshDirectory();
      setArchiveTarget(null);
      setSelectedUnit(null);
      setNotice({
        tone: 'success',
        text:
          nextStatus === 'inactive'
            ? 'Unidad archivada sin eliminar su historial.'
            : 'Unidad reactivada.',
      });
    } catch (reason) {
      setNotice({
        tone: 'error',
        text: reason instanceof Error ? reason.message : 'No se pudo actualizar el estado.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (unit: DirectoryUnit) => {
    setSelectedUnit(null);
    setEditor({ mode: 'edit', unit });
  };

  return (
    <div className="units-v3-page">
      <PageHeader
        actions={
          <>
            <Button
              disabled={!canCreate}
              onClick={() => setEditor({ mode: 'create', unit: null })}
              title={
                !singleBuildingReady
                  ? 'Configura exactamente un edificio antes de registrar unidades.'
                  : undefined
              }
            >
              {topology === 'house_community' ? 'Nueva casa' : 'Nueva unidad'}
            </Button>
            {onConfigureStructure ? (
              <Button onClick={onConfigureStructure} variant="secondary">
                {topology === 'unspecified' ? 'Definir tipo de propiedad' : 'Configurar estructura'}
              </Button>
            ) : null}
          </>
        }
        description={`Inventario físico, propiedad y ocupación de ${condominiumName}.`}
        eyebrow="Administración del condominio"
        title="Unidades"
      />

      {topologyGuidance[topology] ? (
        <InlineNotice tone="info" title="Estructura pendiente de definir">
          {topologyGuidance[topology]}
        </InlineNotice>
      ) : null}
      {topology === 'single_building' && !singleBuildingReady ? (
        <InlineNotice tone="info" title="Edificio pendiente">
          Un edificio residencial requiere exactamente un edificio configurado antes de crear
          unidades.
        </InlineNotice>
      ) : null}
      {notice ? (
        <InlineNotice
          tone={notice.tone}
          title={notice.tone === 'success' ? 'Listo' : 'No se pudo completar'}
        >
          {notice.text}
        </InlineNotice>
      ) : null}

      {loading ? (
        <div className="units-v3-loading-metrics">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton className="units-v3-skeleton" key={item} />
          ))}
        </div>
      ) : (
        <WorkspaceMetrics>
          <WorkspaceMetricCard
            icon={<UnitsIcon size={18} />}
            label="Unidades"
            value={units.length}
            detail="Inventario registrado"
          />
          <WorkspaceMetricCard
            icon={<CheckCircleIcon size={18} />}
            label="Activas"
            value={activeUnits}
            detail={`${units.length - activeUnits} archivadas`}
            tone="green"
          />
          <WorkspaceMetricCard
            icon={<PeopleIcon size={18} />}
            label="Con propietarios"
            value={unitsWithOwners}
            detail="Relación de propiedad activa"
          />
          <WorkspaceMetricCard
            icon={<HomeIcon size={18} />}
            label="Ocupadas"
            value={occupiedUnits}
            detail="Ocupación activa registrada"
            tone="neutral"
          />
        </WorkspaceMetrics>
      )}

      <WorkspaceSection
        actions={<Badge tone="info">{filteredUnits.length}</Badge>}
        className="units-v3-directory"
        description="Selecciona una unidad para revisar su resumen e historial de propiedad y ocupación."
        title="Directorio de unidades"
      >
        <div className="units-v3-filters">
          <input
            aria-label="Buscar unidades"
            className="input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar unidad, edificio, piso o persona"
            type="search"
            value={search}
          />
          <Select
            aria-label="Filtrar por estado"
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            value={status}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Archivadas</option>
          </Select>
          <Select
            aria-label="Filtrar por tipo"
            onChange={(event) => setType(event.target.value as 'all' | UnitType)}
            value={type}
          >
            <option value="all">Todos los tipos</option>
            {unitTypeOptions(topology).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {supportsBuildingStructure(topology) ? (
            <Select
              aria-label="Filtrar por edificio"
              onChange={(event) => setBuilding(event.target.value)}
              value={building}
            >
              <option value="all">Todos los edificios</option>
              {buildingOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          ) : null}
          {filtersActive ? (
            <Button onClick={clearFilters} size="sm" type="button" variant="ghost">
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        {loadError ? (
          <EmptyState
            description={loadError}
            icon={<UnitsIcon size={26} />}
            title="No pudimos cargar las unidades"
          />
        ) : null}
        {!loadError && loading ? (
          <div className="units-v3-list-loading">
            <Skeleton className="skeleton--card" />
            <Skeleton className="skeleton--card" />
            <Skeleton className="skeleton--card" />
          </div>
        ) : null}
        {!loadError && !loading && !filteredUnits.length ? (
          <EmptyState
            actionLabel={filtersActive ? 'Limpiar filtros' : canCreate ? 'Crear unidad' : undefined}
            description={
              filtersActive
                ? 'Prueba con otra búsqueda o muestra todos los estados.'
                : 'Aún no hay unidades registradas en este condominio.'
            }
            icon={<UnitsIcon size={26} />}
            onAction={
              filtersActive
                ? clearFilters
                : canCreate
                  ? () => setEditor({ mode: 'create', unit: null })
                  : undefined
            }
            title={filtersActive ? 'Sin coincidencias' : 'Sin unidades'}
          />
        ) : null}
        {!loadError && !loading && filteredUnits.length ? (
          <div className="units-v3-list">
            <div className="units-v3-list__head" aria-hidden="true">
              <span>Unidad</span>
              <span>Propiedad</span>
              <span>Participación</span>
              <span>Ocupación</span>
              <span>Estado</span>
            </div>
            {filteredUnits.map((unit) => (
              <button
                className="units-v3-row"
                key={unit.id}
                onClick={() => setSelectedUnit(unit)}
                type="button"
              >
                <span className="units-v3-row__identity">
                  <span className="units-v3-row__icon">
                    <UnitsIcon size={18} />
                  </span>
                  <span>
                    <strong>
                      {unitReferenceLabel({
                        code: unit.code,
                        buildingName: unit.building?.name ?? null,
                      })}
                    </strong>
                    <small>
                      {UNIT_TYPE_LABELS[unit.type]}
                      {unit.floor ? ` · Piso ${unit.floor}` : ''}
                    </small>
                  </span>
                </span>
                <span className="units-v3-row__fact" data-label="Propiedad">
                  <small>Propiedad</small>
                  <strong>{personSummary(unit.owners)}</strong>
                </span>
                <span className="units-v3-row__fact" data-label="Participación">
                  <small>Participación</small>
                  <strong>{participationSummary(unit)}</strong>
                </span>
                <span className="units-v3-row__fact" data-label="Ocupación">
                  <small>Ocupación</small>
                  <strong>{personSummary(unit.occupancies)}</strong>
                </span>
                <span className="units-v3-row__status" data-label="Estado">
                  <Badge tone={unit.status === 'active' ? 'success' : 'neutral'}>
                    {unit.status === 'active' ? 'Activa' : 'Archivada'}
                  </Badge>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </WorkspaceSection>

      {selectedUnit ? (
        <UnitDetailDrawer
          canMutate={canMutate}
          condominiumId={condominiumId}
          onArchive={() =>
            selectedUnit.status === 'active'
              ? setArchiveTarget(selectedUnit)
              : void setUnitStatus(selectedUnit, 'active')
          }
          onClose={() => setSelectedUnit(null)}
          onEdit={() => openEdit(selectedUnit)}
          session={session}
          unit={selectedUnit}
        />
      ) : null}
      {editor ? (
        <UnitEditor
          buildings={buildings}
          key={`${editor.mode}-${editor.unit?.id ?? 'new'}-${topology}`}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onSave={saveUnit}
          saving={saving}
          topology={topology}
          unit={editor.unit}
        />
      ) : null}
      {archiveTarget ? (
        <ConfirmDialog
          busy={saving}
          busyLabel="Archivando…"
          confirmLabel="Archivar unidad"
          description="Archivar esta unidad no elimina su historial. Habitta conservará pagos, cuotas, propietarios, ocupaciones y movimientos asociados."
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => void setUnitStatus(archiveTarget, 'inactive')}
          title="¿Archivar esta unidad?"
        />
      ) : null}
    </div>
  );
}
