import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../components/Dialog';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Select, Skeleton, Surface } from '../components/ui';
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
import '../units-v2.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
  onConfigureStructure?: () => void;
};
type StatusFilter = 'all' | 'active' | 'inactive';
type BuildingFilter = 'all' | string;
type Building = { id: string; condominium_id: string; name: string };

const personSummary = (people: Array<{ firstName: string; lastName: string }>) =>
  people.length
    ? people.map((person) => `${person.firstName} ${person.lastName}`).join(', ')
    : 'Sin registro activo';

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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
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
        if (active)
          setError(
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
  const buildings = configuredBuildings.map(({ id, name }) => ({ id, name }));
  const singleBuildingReady = topology !== 'single_building' || buildings.length === 1;
  const canCreate = canMutate && topology !== 'unspecified' && singleBuildingReady;
  const refreshDirectory = async () => {
    const directory = await apiRequest<UnitsDirectory>(
      `/v1/condominiums/${condominiumId}/units-directory`,
      session,
    );
    setUnits(directory.units);
  };
  const saveUnit = async (input: UnitEditorInput) => {
    if (!editor) return;
    setSaving(true);
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/units${editor.mode === 'edit' ? `/${editor.unit?.id}` : ''}`,
        session,
        { method: editor.mode === 'edit' ? 'PATCH' : 'POST', body: JSON.stringify(input) },
      );
      await refreshDirectory();
      setEditor(null);
      setSelectedUnit(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la unidad.');
    } finally {
      setSaving(false);
    }
  };
  const setUnitStatus = async (unit: DirectoryUnit, status: 'active' | 'inactive') => {
    setSaving(true);
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/units/${unit.id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await refreshDirectory();
      setArchiveTarget(null);
      setSelectedUnit(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el estado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="units-v2-page">
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
            <Button onClick={onConfigureStructure} variant="secondary">
              {topology === 'unspecified' ? 'Definir tipo de propiedad' : 'Configurar estructura'}
            </Button>
          </>
        }
        description={`Inventario físico, propiedad y ocupación de ${condominiumName}.`}
        eyebrow="Administración del condominio"
        title="Unidades"
      />
      {topologyGuidance[topology] ? (
        <Surface className="units-v2-guidance">
          <strong>Estructura pendiente de definir.</strong> {topologyGuidance[topology]}
        </Surface>
      ) : null}
      {topology === 'single_building' && !singleBuildingReady ? (
        <Surface className="units-v2-guidance">
          <strong>Edificio pendiente.</strong> Un edificio residencial requiere exactamente un
          edificio configurado antes de crear unidades.
        </Surface>
      ) : null}
      {loading ? (
        <div className="units-v2-metrics">
          {[0, 1, 2].map((item) => (
            <Skeleton className="units-v2-skeleton" key={item} />
          ))}
        </div>
      ) : null}
      {!loading ? (
        <div className="units-v2-metrics">
          <Surface>
            <span>Total</span>
            <strong>{units.length}</strong>
          </Surface>
          <Surface>
            <span>Activas</span>
            <strong>{activeUnits}</strong>
          </Surface>
          <Surface>
            <span>Archivadas</span>
            <strong>{units.length - activeUnits}</strong>
          </Surface>
        </div>
      ) : null}
      <Surface className="units-v2-directory">
        <div className="units-v2-filters">
          <input
            aria-label="Buscar unidades"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por unidad, edificio, piso o persona"
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
        </div>
        {error ? (
          <EmptyState description={error} icon="!" title="No pudimos cargar las unidades" />
        ) : null}
        {!error && !loading && !filteredUnits.length ? (
          <EmptyState
            description={
              search ? 'Prueba con otra búsqueda o filtro.' : 'Aún no hay unidades registradas.'
            }
            icon="⌂"
            title={search ? 'Sin coincidencias' : 'Sin unidades'}
          />
        ) : null}
        {!error && !loading && filteredUnits.length ? (
          <div className="units-v2-list">
            {filteredUnits.map((unit) => (
              <button
                className="units-v2-card"
                key={unit.id}
                onClick={() => setSelectedUnit(unit)}
                type="button"
              >
                <div>
                  <strong>
                    {unitReferenceLabel({
                      code: unit.code,
                      buildingName: unit.building?.name ?? null,
                    })}
                  </strong>
                  <span>
                    {UNIT_TYPE_LABELS[unit.type]}
                    {unit.floor ? ` · Piso ${unit.floor}` : ''}
                  </span>
                </div>
                <Badge tone={unit.status === 'active' ? 'success' : 'neutral'}>
                  {unit.status === 'active' ? 'Activa' : 'Archivada'}
                </Badge>
                <p>
                  <b>Propiedad:</b> {personSummary(unit.owners)}
                </p>
                <p>
                  <b>Ocupación:</b> {personSummary(unit.occupancies)}
                </p>
              </button>
            ))}
          </div>
        ) : null}
      </Surface>
      {selectedUnit ? (
        <UnitDetailDrawer
          canMutate={canMutate}
          onArchive={() =>
            selectedUnit.status === 'active'
              ? setArchiveTarget(selectedUnit)
              : void setUnitStatus(selectedUnit, 'active')
          }
          onClose={() => setSelectedUnit(null)}
          onEdit={() => setEditor({ mode: 'edit', unit: selectedUnit })}
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
