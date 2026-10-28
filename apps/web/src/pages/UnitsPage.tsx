import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../components/Dialog';
import { PageHeader } from '../components/PageHeader';
import {
  InlineNotice,
  WorkspaceMetricCard,
  WorkspaceMetrics,
  WorkspaceSection,
} from '../components/WorkspaceUi';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  HomeIcon,
  PeopleIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Select, Skeleton } from '../components/ui';
import { UnitDetailDrawer } from '../features/units/UnitDetailDrawer';
import { UnitEditor } from '../features/units/UnitEditor';
import type { UnitEditorInput } from '../features/units/UnitEditor';
import {
  paginateDirectoryUnits,
  sortDirectoryUnits,
  unitDirectoryPageLinks,
  UNIT_DIRECTORY_PAGE_SIZES,
  type UnitDirectoryPageSize,
  type UnitDirectorySort,
} from '../features/units/unit-directory-view';
import type { CondominiumProfile, DirectoryUnit, UnitsDirectory } from '../features/units/types';
import { apiRequest } from '../lib/api';
import { canAccessRoute, canManage, useCondominiumRoles } from '../lib/roles';
import { APP_ROUTES } from '../navigation';
import {
  consumeDirectoryDetailHint,
  directoryRequestedId,
  findDirectoryTarget,
} from '../lib/directory-deep-links';
import {
  supportsBuildingStructure,
  UNIT_TYPE_LABELS,
  unitReferenceLabel,
  unitTypeOptions,
} from '../lib/unit-domain';
import type { ChargeScope, PropertyTopology, UnitType } from '../lib/unit-domain';
import '../units-v3.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
  onConfigureStructure?: () => void;
  onOpenPerson?: ((personId: string) => void) | undefined;
  onOpenReceivables?: ((unitId: string) => void) | undefined;
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

const updatedSummary = (updatedAt: string) => {
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        timestamp,
      )
    : 'No registrada';
};

const aliquotSummary = (unit: DirectoryUnit) => {
  if (unit.type === 'building') return 'No aplica';
  if (unit.ownershipPercentage == null) return 'No definida';
  const value = Number(unit.ownershipPercentage);
  return Number.isFinite(value)
    ? `${value.toLocaleString('es-VE', { maximumFractionDigits: 4 })}%`
    : 'No definida';
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
  onOpenPerson,
  onOpenReceivables,
}: Props) {
  const roles = useCondominiumRoles();
  const canMutate = canManage(roles);
  const peopleRoute = APP_ROUTES.find((route) => route.key === 'people');
  const canViewPeople = Boolean(peopleRoute && canAccessRoute(peopleRoute, roles));
  const feesRoute = APP_ROUTES.find((route) => route.key === 'fees');
  const canViewReceivables = Boolean(feesRoute && canAccessRoute(feesRoute, roles));
  const pendingRequestedUnitIdRef = useRef(directoryRequestedId('units', window.location.search));
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
  const [directorySort, setDirectorySort] = useState<UnitDirectorySort>('unit-asc');
  const [pageSize, setPageSize] = useState<UnitDirectoryPageSize>(10);
  const [requestedPage, setRequestedPage] = useState(1);
  const [selectedUnit, setSelectedUnit] = useState<DirectoryUnit | null>(null);
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit';
    unit: DirectoryUnit | null;
  } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DirectoryUnit | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

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
        const requestedUnitId = pendingRequestedUnitIdRef.current;
        if (requestedUnitId) {
          // Resolve the link only once, against the authorized directory. A later
          // refresh must never reopen a drawer the administrator has dismissed.
          pendingRequestedUnitIdRef.current = null;
          setSelectedUnit(findDirectoryTarget(directory.units, requestedUnitId));
          consumeDirectoryDetailHint('units', requestedUnitId);
        }
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
  }, [condominiumId, reloadNonce, session]);

  useEffect(() => {
    setSelectedUnit(null);
    setEditor(null);
    setArchiveTarget(null);
    setSearch('');
    setStatus('all');
    setType('all');
    setBuilding('all');
    setDirectorySort('unit-asc');
    setRequestedPage(1);
  }, [condominiumId]);

  const topology = profile?.property_topology ?? 'unspecified';
  const chargeScope: ChargeScope = profile?.charge_scope ?? 'unit';
  const buildingBilling = topology === 'multi_building_complex' && chargeScope === 'building';
  const occupiedBuildingIds = new Set(
    units.filter((item) => item.type === 'building').map((item) => item.buildingId),
  );
  const availableBuildings = configuredBuildings.filter(
    (item) => !occupiedBuildingIds.has(item.id),
  );
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
  const sortedUnits = useMemo(
    () => sortDirectoryUnits(filteredUnits, directorySort),
    [filteredUnits, directorySort],
  );
  const directoryPage = useMemo(
    () => paginateDirectoryUnits(sortedUnits, requestedPage, pageSize),
    [sortedUnits, requestedPage, pageSize],
  );

  const activeUnits = units.filter((unit) => unit.status === 'active').length;
  const unitsWithOwners = units.filter((unit) => unit.owners.length > 0).length;
  const occupiedUnits = units.filter((unit) => unit.occupancies.length > 0).length;
  const buildings = configuredBuildings.map(({ id, name }) => ({ id, name }));
  const singleBuildingReady = topology !== 'single_building' || buildings.length === 1;
  const canCreate =
    canMutate &&
    topology !== 'unspecified' &&
    singleBuildingReady &&
    (!buildingBilling || availableBuildings.length > 0);
  const structureNeedsAttention =
    Boolean(topologyGuidance[topology]) || (topology === 'single_building' && !singleBuildingReady);
  const canOfferBuildingStructure = Boolean(
    onConfigureStructure && supportsBuildingStructure(topology),
  );
  const filtersActive = Boolean(
    search.trim() || status !== 'all' || type !== 'all' || building !== 'all',
  );

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setType('all');
    setBuilding('all');
    setRequestedPage(1);
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
    let saved = false;
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/units${editor.mode === 'edit' ? `/${editor.unit?.id}` : ''}`,
        session,
        { method: editor.mode === 'edit' ? 'PATCH' : 'POST', body: JSON.stringify(input) },
      );
      saved = true;
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
        text: saved
          ? 'La unidad se guardó, pero no se pudo actualizar el directorio. Intenta recargarlo.'
          : reason instanceof Error
            ? reason.message
            : 'No se pudo guardar la unidad.',
      });
      if (saved) {
        setEditor(null);
        setSelectedUnit(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const setUnitStatus = async (unit: DirectoryUnit, nextStatus: 'active' | 'inactive') => {
    setSaving(true);
    setNotice(null);
    let saved = false;
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/units/${unit.id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      saved = true;
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
        text: saved
          ? 'El estado de la unidad se actualizó, pero no se pudo actualizar el directorio. Intenta recargarlo.'
          : reason instanceof Error
            ? reason.message
            : 'No se pudo actualizar el estado.',
      });
      if (saved) {
        setArchiveTarget(null);
        setSelectedUnit(null);
      }
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
              <span aria-hidden="true" className="units-v3-create-icon">
                +
              </span>
              {buildingBilling
                ? 'Vincular edificio para cobro'
                : topology === 'house_community'
                  ? 'Nueva casa'
                  : 'Nueva unidad'}
            </Button>
            {onConfigureStructure && canOfferBuildingStructure && !structureNeedsAttention ? (
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
        <div className="units-v3-structure-banner">
          <span aria-hidden="true" className="units-v3-structure-banner__icon">
            i
          </span>
          <div className="units-v3-structure-banner__copy">
            <strong>Estructura pendiente de definir</strong>
            <p>{topologyGuidance[topology]}</p>
          </div>
          {onConfigureStructure ? (
            <Button
              className="units-v3-structure-banner__action"
              onClick={onConfigureStructure}
              size="sm"
              type="button"
              variant="secondary"
            >
              Definir estructura <ArrowRightIcon size={16} />
            </Button>
          ) : null}
        </div>
      ) : null}
      {topology === 'single_building' && !singleBuildingReady ? (
        <div className="units-v3-structure-banner">
          <span aria-hidden="true" className="units-v3-structure-banner__icon">
            i
          </span>
          <div className="units-v3-structure-banner__copy">
            <strong>Edificio pendiente</strong>
            <p>Configura el edificio residencial antes de crear unidades.</p>
          </div>
          {onConfigureStructure ? (
            <Button
              className="units-v3-structure-banner__action"
              onClick={onConfigureStructure}
              size="sm"
              type="button"
              variant="secondary"
            >
              Configurar edificio <ArrowRightIcon size={16} />
            </Button>
          ) : null}
        </div>
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
        <WorkspaceMetrics className="units-v3-overview-metrics">
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
        className="units-v3-directory"
        description="Selecciona una unidad para revisar su resumen e historial de propiedad y ocupación."
        title="Directorio de unidades"
      >
        <div className="units-v3-filters">
          <input
            aria-label="Buscar unidades"
            className="input"
            onChange={(event) => {
              setSearch(event.target.value);
              setRequestedPage(1);
            }}
            placeholder="Buscar unidad, edificio, piso o persona"
            type="search"
            value={search}
          />
          <Select
            aria-label="Filtrar por estado"
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setRequestedPage(1);
            }}
            value={status}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Archivadas</option>
          </Select>
          <Select
            aria-label="Filtrar por tipo"
            onChange={(event) => {
              setType(event.target.value as 'all' | UnitType);
              setRequestedPage(1);
            }}
            value={type}
          >
            <option value="all">Todos los tipos</option>
            {unitTypeOptions(topology, chargeScope).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {supportsBuildingStructure(topology) ? (
            <Select
              aria-label="Filtrar por edificio"
              onChange={(event) => {
                setBuilding(event.target.value);
                setRequestedPage(1);
              }}
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

        {!loadError && !loading && filteredUnits.length ? (
          <div className="units-v3-directory-controls">
            <span className="units-v3-directory-controls__count">
              {filteredUnits.length} {filteredUnits.length === 1 ? 'resultado' : 'resultados'}
            </span>
            <label className="units-v3-directory-controls__sort">
              <span>Ordenar por</span>
              <Select
                aria-label="Ordenar unidades"
                onChange={(event) => {
                  setDirectorySort(event.target.value as UnitDirectorySort);
                  setRequestedPage(1);
                }}
                value={directorySort}
              >
                <option value="unit-asc">Unidad · A–Z</option>
                <option value="unit-desc">Unidad · Z–A</option>
                <option value="updated-desc">Actualización · reciente</option>
                <option value="updated-asc">Actualización · antigua</option>
                <option value="aliquot-desc">Alícuota · mayor</option>
                <option value="aliquot-asc">Alícuota · menor</option>
              </Select>
            </label>
          </div>
        ) : null}

        {loadError ? (
          <EmptyState
            actionLabel="Reintentar"
            description={loadError}
            icon={<UnitsIcon size={26} />}
            onAction={() => setReloadNonce((current) => current + 1)}
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
                : buildingBilling
                  ? 'Registra los edificios físicos desde Estructura y vincula cada uno como una cuenta facturable.'
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
              <span>Alícuota</span>
              <span>Ocupación</span>
              <span>Estado</span>
              <span>Actualización</span>
            </div>
            {directoryPage.rows.map((unit) => (
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
                <span className="units-v3-row__fact" data-label="Alícuota">
                  <small>Alícuota</small>
                  <strong>{aliquotSummary(unit)}</strong>
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
                <span
                  className="units-v3-row__fact units-v3-row__updated"
                  data-label="Actualización"
                >
                  <small>Actualización</small>
                  <strong>{updatedSummary(unit.updatedAt)}</strong>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {!loadError && !loading && filteredUnits.length ? (
          <div className="units-v3-pagination">
            <div className="units-v3-pagination__meta">
              <span aria-live="polite" className="units-v3-pagination__range">
                {directoryPage.first}–{directoryPage.last} de {directoryPage.total}{' '}
                {directoryPage.total === 1 ? 'unidad' : 'unidades'}
              </span>
              {directoryPage.total > 10 ? (
                <label className="units-v3-pagination__size">
                  <span>Mostrar</span>
                  <Select
                    aria-label="Unidades por página"
                    onChange={(event) => {
                      setPageSize(Number(event.target.value) as UnitDirectoryPageSize);
                      setRequestedPage(1);
                    }}
                    value={String(pageSize)}
                  >
                    {UNIT_DIRECTORY_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </Select>
                  <span>por página</span>
                </label>
              ) : null}
            </div>
            {directoryPage.totalPages > 1 ? (
              <nav
                aria-label="Paginación del directorio de unidades"
                className="units-v3-pagination__nav"
              >
                <Button
                  disabled={directoryPage.page <= 1}
                  onClick={() => setRequestedPage(directoryPage.page - 1)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Anterior
                </Button>
                <div className="units-v3-pagination__numbers">
                  {unitDirectoryPageLinks(directoryPage.page, directoryPage.totalPages).map(
                    (page, index) =>
                      page === null ? (
                        <span
                          aria-hidden="true"
                          className="units-v3-pagination__ellipsis"
                          key={`gap-${index}`}
                        >
                          …
                        </span>
                      ) : (
                        <button
                          aria-current={page === directoryPage.page ? 'page' : undefined}
                          aria-label={`Ir a la página ${page}`}
                          className="units-v3-pagination__number"
                          key={page}
                          onClick={() => setRequestedPage(page)}
                          type="button"
                        >
                          {page}
                        </button>
                      ),
                  )}
                </div>
                <Button
                  disabled={directoryPage.page >= directoryPage.totalPages}
                  onClick={() => setRequestedPage(directoryPage.page + 1)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Siguiente
                </Button>
                <span aria-live="polite" className="units-v3-visually-hidden">
                  Página {directoryPage.page} de {directoryPage.totalPages}
                </span>
              </nav>
            ) : null}
          </div>
        ) : null}
      </WorkspaceSection>

      {selectedUnit ? (
        <UnitDetailDrawer
          canMutate={canMutate}
          canViewPeople={canViewPeople}
          canViewReceivables={canViewReceivables}
          onOpenPerson={onOpenPerson}
          onOpenReceivables={onOpenReceivables}
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
          chargeScope={chargeScope}
          usedBuildingIds={units
            .filter((item) => item.type === 'building' && item.id !== editor.unit?.id)
            .map((item) => item.buildingId)
            .filter((id): id is string => Boolean(id))}
          unit={editor.unit}
        />
      ) : null}
      {archiveTarget ? (
        <ConfirmDialog
          busy={saving}
          busyLabel="Archivando…"
          confirmLabel="Archivar unidad"
          description="Archivar retira esta unidad de la operación diaria. Conserva la alícuota como participación estructural y los pagos, cuotas y movimientos financieros existentes, además de propietarios y ocupaciones históricas."
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => void setUnitStatus(archiveTarget, 'inactive')}
          title="¿Archivar esta unidad?"
        />
      ) : null}
    </div>
  );
}
