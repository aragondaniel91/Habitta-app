import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Select, Skeleton, Surface } from '../components/ui';
import { UnitDetailDrawer } from '../features/units/UnitDetailDrawer';
import type { CondominiumProfile, DirectoryUnit, UnitsDirectory } from '../features/units/types';
import { apiRequest } from '../lib/api';
import {
  supportsBuildingStructure,
  UNIT_TYPE_LABELS,
  unitReferenceLabel,
  unitTypeOptions,
} from '../lib/unit-domain';
import type { PropertyTopology, UnitType } from '../lib/unit-domain';
import '../units-v2.css';

type Props = { condominiumId: string; condominiumName: string; session: Session };
type StatusFilter = 'all' | 'active' | 'inactive';
type BuildingFilter = 'all' | string;

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

export function UnitsPage({ condominiumId, condominiumName, session }: Props) {
  const [profile, setProfile] = useState<CondominiumProfile | null>(null);
  const [units, setUnits] = useState<DirectoryUnit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<'all' | UnitType>('all');
  const [building, setBuilding] = useState<BuildingFilter>('all');
  const [selectedUnit, setSelectedUnit] = useState<DirectoryUnit | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      apiRequest<CondominiumProfile[]>(`/v1/condominiums/${condominiumId}`, session),
      apiRequest<UnitsDirectory>(`/v1/condominiums/${condominiumId}/units-directory`, session),
    ])
      .then(([profileRows, directory]) => {
        if (!active) return;
        setProfile(profileRows[0] ?? null);
        setUnits(directory.units);
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
  const buildingOptions = useMemo(
    () => [
      ...new Map(
        units.flatMap((unit) =>
          unit.building ? [[unit.building.id, unit.building.name] as const] : [],
        ),
      ).entries(),
    ],
    [units],
  );
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

  return (
    <div className="units-v2-page">
      <PageHeader
        actions={
          <>
            <Button disabled title="El editor canónico se incorpora en el siguiente hito">
              {topology === 'house_community' ? 'Nueva casa' : 'Nueva unidad'}
            </Button>
            <Button variant="secondary">Configurar estructura</Button>
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
        <UnitDetailDrawer onClose={() => setSelectedUnit(null)} unit={selectedUnit} />
      ) : null}
    </div>
  );
}
