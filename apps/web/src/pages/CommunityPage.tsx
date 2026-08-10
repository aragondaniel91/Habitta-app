import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AnnouncementsIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CommunityIcon,
  PeopleIcon,
  RequestsIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { canManage, useCondominiumRoles } from '../lib/roles';
import {
  buildBuildingCommunityRows,
  getCommunityDirectoryRows,
  getCommunityStats,
  getUnitTypeRows,
} from '../lib/community';
import type { CommunityBuilding, CommunityPerson, CommunityUnit } from '../lib/community';
import { APP_ROUTES } from '../navigation';
import type { AppRoute } from '../navigation';

type CommunityData = {
  units: CommunityUnit[];
  buildings: CommunityBuilding[];
  people: CommunityPerson[];
};

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
  onNavigate: (route: AppRoute) => void;
};

const routeByKey = (key: AppRoute['key']) => APP_ROUTES.find((route) => route.key === key);

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
}) {
  return (
    <Surface className="community-metric" data-tone={tone}>
      <div className="community-metric__heading">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function CommunityLoading() {
  return (
    <div aria-label="Cargando comunidad" className="community-page">
      <PageHeader eyebrow="Vida del condominio" title="Comunidad" />
      <div className="community-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <div className="community-grid">
        <Skeleton className="community-panel-skeleton" />
        <Skeleton className="community-panel-skeleton" />
      </div>
    </div>
  );
}

export function CommunityPage({ condominiumId, condominiumName, session, onNavigate }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [units, buildings, people] = await Promise.all([
        apiRequest<CommunityUnit[]>(`/v1/condominiums/${condominiumId}/units`, session),
        apiRequest<CommunityBuilding[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
        apiRequest<CommunityPerson[]>(`/v1/condominiums/${condominiumId}/people`, session),
      ]);
      setData({ units, buildings, people });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cargar la comunidad.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => (data ? getCommunityStats(data.units, data.people) : null), [data]);
  const buildingRows = useMemo(
    () => (data ? buildBuildingCommunityRows(data.buildings, data.units) : []),
    [data],
  );
  const directoryRows = useMemo(() => (data ? getCommunityDirectoryRows(data.people) : []), [data]);
  const unitTypeRows = useMemo(() => (data ? getUnitTypeRows(data.units) : []), [data]);

  if (loading && !data) return <CommunityLoading />;

  if (!data || !stats) {
    return (
      <Surface className="community-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir el espacio comunitario.'}
          icon={<CommunityIcon size={28} />}
          onAction={() => void load()}
          title="Comunidad no disponible"
        />
      </Surface>
    );
  }

  const unitsRoute = routeByKey('units');
  const peopleRoute = routeByKey('people');
  const requestsRoute = routeByKey('requests');
  const announcementsRoute = routeByKey('announcements');
  const directoryComplete = stats.peopleWithoutContact === 0;

  return (
    <div className="community-page">
      <PageHeader
        actions={
          <>
            {manage ? (
              <Button
                disabled={!peopleRoute}
                onClick={() => peopleRoute && onNavigate(peopleRoute)}
                size="sm"
                variant="secondary"
              >
                Abrir directorio
              </Button>
            ) : null}
            <Button
              disabled={!requestsRoute}
              onClick={() => requestsRoute && onNavigate(requestsRoute)}
              size="sm"
            >
              Ver solicitudes
            </Button>
          </>
        }
        description={`${condominiumName} · directorio, cobertura de contacto y estructura residencial.`}
        eyebrow="Vida del condominio"
        title="Comunidad"
      />

      {error ? (
        <div className="community-inline-alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}

      <section aria-label="Indicadores de la comunidad" className="community-metrics-grid">
        <MetricCard
          detail={`${data.buildings.length} ${data.buildings.length === 1 ? 'torre registrada' : 'torres registradas'}.`}
          icon={<UnitsIcon size={20} />}
          label="Unidades activas"
          tone="blue"
          value={String(stats.activeUnits)}
        />
        <MetricCard
          detail={`${stats.inactivePeople} registros permanecen inactivos.`}
          icon={<PeopleIcon size={20} />}
          label="Personas activas"
          tone="green"
          value={String(stats.activePeople)}
        />
        <MetricCard
          detail="Personas con correo y teléfono disponibles."
          icon={<CheckCircleIcon size={20} />}
          label="Cobertura de contacto"
          tone="navy"
          value={`${stats.contactCoverage.toFixed(0)}%`}
        />
        <MetricCard
          detail="Registros que requieren completar correo o teléfono."
          icon={<CommunityIcon size={20} />}
          label="Sin contacto completo"
          tone="red"
          value={String(data.people.length - stats.peopleWithBoth)}
        />
      </section>

      <section className="community-grid">
        <Surface className="community-panel community-buildings-panel">
          <div className="community-section-heading">
            <div>
              <span className="community-kicker">Estructura residencial</span>
              <h2>Unidades por torre</h2>
              <p>Distribución real de las unidades registradas.</p>
            </div>
            <Button
              disabled={!unitsRoute}
              onClick={() => unitsRoute && onNavigate(unitsRoute)}
              size="sm"
              variant="ghost"
            >
              Ver unidades <ArrowRightIcon size={16} />
            </Button>
          </div>
          {buildingRows.length ? (
            <div className="community-building-list">
              {buildingRows.map((building) => (
                <article key={building.id}>
                  <div>
                    <strong>{building.name}</strong>
                    <span>
                      {building.activeUnits} activas de {building.units}
                    </span>
                  </div>
                  <div className="community-building-track">
                    <span style={{ width: `${building.percentage}%` }} />
                  </div>
                  <b>{building.units}</b>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              description="Crea una torre o edificio para visualizar la distribución."
              icon={<UnitsIcon size={26} />}
              title="Todavía no hay torres"
            />
          )}
        </Surface>

        <Surface className="community-panel community-health-panel">
          <div className="community-section-heading">
            <div>
              <span className="community-kicker">Calidad del directorio</span>
              <h2>Salud de los contactos</h2>
              <p>Qué tan preparada está la comunidad para recibir comunicaciones.</p>
            </div>
            <Badge tone={directoryComplete ? 'success' : 'warning'}>
              {directoryComplete ? 'Completo' : 'Requiere atención'}
            </Badge>
          </div>
          <div className="community-contact-score">
            <div
              aria-label={`${stats.contactCoverage.toFixed(0)} por ciento de cobertura`}
              className="community-contact-ring"
              role="img"
              style={{
                background: `conic-gradient(var(--green) ${stats.contactCoverage}%, var(--blue-soft) ${stats.contactCoverage}% 100%)`,
              }}
            >
              <div>
                <strong>{stats.contactCoverage.toFixed(0)}%</strong>
                <span>completo</span>
              </div>
            </div>
            <dl>
              <div>
                <dt>Con correo</dt>
                <dd>{stats.peopleWithEmail}</dd>
              </div>
              <div>
                <dt>Con teléfono</dt>
                <dd>{stats.peopleWithPhone}</dd>
              </div>
              <div>
                <dt>Sin ningún contacto</dt>
                <dd>{stats.peopleWithoutContact}</dd>
              </div>
            </dl>
          </div>
          <Button
            disabled={!peopleRoute}
            onClick={() => peopleRoute && onNavigate(peopleRoute)}
            size="sm"
            variant="secondary"
          >
            Completar directorio
          </Button>
        </Surface>
      </section>

      <section className="community-secondary-grid">
        <Surface className="community-panel community-directory-card">
          <div className="community-section-heading">
            <div>
              <span className="community-kicker">Directorio</span>
              <h2>Personas registradas</h2>
            </div>
            <Button
              disabled={!peopleRoute}
              onClick={() => peopleRoute && onNavigate(peopleRoute)}
              size="sm"
              variant="ghost"
            >
              Ver todas
            </Button>
          </div>
          {directoryRows.length ? (
            <div className="community-person-list">
              {directoryRows.map((person) => {
                const initials =
                  `${person.first_name[0] ?? ''}${person.last_name[0] ?? ''}`.toUpperCase();
                return (
                  <article key={person.id}>
                    <span>{initials}</span>
                    <div>
                      <strong>
                        {person.first_name} {person.last_name}
                      </strong>
                      <small>{person.email || person.phone || 'Contacto pendiente'}</small>
                    </div>
                    <Badge tone={person.status === 'inactive' ? 'neutral' : 'success'}>
                      {person.status === 'inactive' ? 'Inactivo' : 'Activo'}
                    </Badge>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              description="Agrega propietarios, inquilinos o personal autorizado."
              icon={<PeopleIcon size={26} />}
              title="Directorio vacío"
            />
          )}
        </Surface>

        <Surface className="community-panel community-types-card">
          <div className="community-section-heading">
            <div>
              <span className="community-kicker">Composición</span>
              <h2>Tipos de unidad</h2>
            </div>
          </div>
          {unitTypeRows.length ? (
            <div className="community-unit-type-list">
              {unitTypeRows.map((row, index) => (
                <article key={row.label}>
                  <span data-index={index % 4} />
                  <strong>{row.label}</strong>
                  <b>{row.count}</b>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              description="Los tipos se mostrarán cuando las unidades estén clasificadas."
              icon={<UnitsIcon size={26} />}
              title="Sin clasificación"
            />
          )}
        </Surface>

        <Surface className="community-panel community-actions-card">
          <div className="community-section-heading">
            <div>
              <span className="community-kicker">Comunicación</span>
              <h2>Accesos comunitarios</h2>
              <p>Continúa hacia los flujos especializados.</p>
            </div>
          </div>
          <div className="community-action-list">
            <button
              disabled={!requestsRoute}
              onClick={() => requestsRoute && onNavigate(requestsRoute)}
              type="button"
            >
              <span>
                <RequestsIcon size={19} />
              </span>
              <div>
                <strong>Solicitudes</strong>
                <small>Casos y requerimientos de residentes.</small>
              </div>
              <ArrowRightIcon size={17} />
            </button>
            <button
              disabled={!announcementsRoute}
              onClick={() => announcementsRoute && onNavigate(announcementsRoute)}
              type="button"
            >
              <span>
                <AnnouncementsIcon size={19} />
              </span>
              <div>
                <strong>Anuncios</strong>
                <small>Comunicaciones oficiales del condominio.</small>
              </div>
              <ArrowRightIcon size={17} />
            </button>
            <button
              disabled={!peopleRoute}
              onClick={() => peopleRoute && onNavigate(peopleRoute)}
              type="button"
            >
              <span>
                <PeopleIcon size={19} />
              </span>
              <div>
                <strong>Personas</strong>
                <small>Directorio y relaciones por unidad.</small>
              </div>
              <ArrowRightIcon size={17} />
            </button>
          </div>
        </Surface>
      </section>
    </div>
  );
}
