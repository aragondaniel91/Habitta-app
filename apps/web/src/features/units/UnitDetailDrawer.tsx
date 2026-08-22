import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import {
  InlineNotice,
  WorkspaceSection,
  WorkspaceTab,
  WorkspaceTabs,
} from '../../components/WorkspaceUi';
import { CheckCircleIcon, HomeIcon, PeopleIcon, UnitsIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Skeleton } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { UNIT_TYPE_LABELS, unitReferenceLabel } from '../../lib/unit-domain';
import type { DirectoryOccupancy, DirectoryOwner, DirectoryUnit } from './types';

type DetailTab = 'summary' | 'ownership' | 'occupancy' | 'actions';

type PersonRow = {
  id: string;
  first_name: string;
  last_name: string;
  status?: 'active' | 'inactive';
};

type OwnerHistoryRow = {
  id: string;
  person_id: string;
  unit_id: string;
  ownership_percentage: number | string | null;
  is_primary_contact: boolean;
  starts_at: string;
  ends_at: string | null;
};

type OccupancyHistoryRow = {
  id: string;
  person_id: string;
  unit_id: string;
  occupancy_type: DirectoryOccupancy['occupancyType'];
  is_primary_contact: boolean;
  starts_at: string;
  ends_at: string | null;
};

const occupancyLabels: Record<DirectoryOccupancy['occupancyType'], string> = {
  owner_occupant: 'Propietario residente',
  tenant: 'Inquilino',
  family_member: 'Familiar',
  authorized_occupant: 'Ocupante autorizado',
};

const personName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`.trim();

const percentage = (value: DirectoryOwner['ownershipPercentage']) =>
  value === null || value === '' ? 'No definida' : `${Number(value).toLocaleString('es-VE')}%`;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' }).format(new Date(value));

function RelationshipPeople({
  owners,
  occupancies,
}: {
  owners: DirectoryOwner[];
  occupancies: DirectoryOccupancy[];
}) {
  return (
    <div className="units-v3-detail-relations">
      <div>
        <span className="units-v3-detail-relations__icon">
          <PeopleIcon size={17} />
        </span>
        <div>
          <small>Propiedad actual</small>
          <strong>{owners.length ? owners.map(personName).join(', ') : 'Sin propietarios activos'}</strong>
        </div>
      </div>
      <div>
        <span className="units-v3-detail-relations__icon">
          <HomeIcon size={17} />
        </span>
        <div>
          <small>Ocupación actual</small>
          <strong>
            {occupancies.length
              ? occupancies.map((item) => personName(item)).join(', ')
              : 'Sin ocupantes activos'}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function UnitDetailDrawer({
  condominiumId,
  session,
  unit,
  onClose,
  canMutate,
  onEdit,
  onArchive,
}: {
  condominiumId: string;
  session: Session;
  unit: DirectoryUnit;
  onClose: () => void;
  canMutate: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('summary');
  const [ownersHistory, setOwnersHistory] = useState<OwnerHistoryRow[]>([]);
  const [occupanciesHistory, setOccupanciesHistory] = useState<OccupancyHistoryRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    let active = true;
    setTab('summary');
    setHistoryLoading(true);
    setHistoryError('');
    void Promise.all([
      apiRequest<OwnerHistoryRow[]>(
        `/v1/condominiums/${condominiumId}/units/${unit.id}/owners`,
        session,
      ),
      apiRequest<OccupancyHistoryRow[]>(
        `/v1/condominiums/${condominiumId}/units/${unit.id}/occupancies`,
        session,
      ),
      apiRequest<PersonRow[]>(`/v1/condominiums/${condominiumId}/people`, session),
    ])
      .then(([ownerRows, occupancyRows, peopleRows]) => {
        if (!active) return;
        setOwnersHistory(
          [...ownerRows].sort((left, right) => right.starts_at.localeCompare(left.starts_at)),
        );
        setOccupanciesHistory(
          [...occupancyRows].sort((left, right) => right.starts_at.localeCompare(left.starts_at)),
        );
        setPeople(peopleRows);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setHistoryError(
          reason instanceof Error ? reason.message : 'No se pudo cargar el historial de la unidad.',
        );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [condominiumId, session, unit.id]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const historyPersonName = (personId: string) => {
    const person = peopleById.get(personId);
    return person ? `${person.first_name} ${person.last_name}`.trim() : 'Persona no disponible';
  };

  const renderHistoryLoading = () => (
    <div className="units-v3-detail-history-loading">
      <Skeleton className="skeleton--card" />
      <Skeleton className="skeleton--card" />
    </div>
  );

  const renderSummary = () => (
    <div className="units-v3-detail-stack">
      <WorkspaceSection
        description="Datos físicos y estructurales vigentes de esta unidad."
        icon={<UnitsIcon size={18} />}
        title="Resumen"
      >
        <div className="units-v3-detail-facts">
          <div>
            <small>Tipo</small>
            <strong>{UNIT_TYPE_LABELS[unit.type]}</strong>
          </div>
          <div>
            <small>Ubicación</small>
            <strong>{unit.building?.name ?? 'Sin edificio asignado'}</strong>
          </div>
          <div>
            <small>Piso o nivel</small>
            <strong>{unit.floor || 'No indicado'}</strong>
          </div>
          <div>
            <small>Alícuota</small>
            <strong>{percentage(unit.ownershipPercentage)}</strong>
          </div>
          <div>
            <small>Estado</small>
            <Badge tone={unit.status === 'active' ? 'success' : 'neutral'}>
              {unit.status === 'active' ? 'Activa' : 'Archivada'}
            </Badge>
          </div>
          <div>
            <small>Última actualización</small>
            <strong>{formatDate(unit.updatedAt)}</strong>
          </div>
        </div>
      </WorkspaceSection>
      <WorkspaceSection
        description="La vista agrupa las relaciones actuales sin fusionar sus historiales."
        title="Relaciones actuales"
      >
        <RelationshipPeople owners={unit.owners} occupancies={unit.occupancies} />
      </WorkspaceSection>
    </div>
  );

  const renderOwnership = () => (
    <WorkspaceSection
      description="Las asignaciones cerradas siguen visibles; nunca se eliminan para simplificar la interfaz."
      title="Historial de propiedad"
    >
      {historyLoading ? renderHistoryLoading() : null}
      {!historyLoading && historyError ? <InlineNotice tone="error">{historyError}</InlineNotice> : null}
      {!historyLoading && !historyError && ownersHistory.length ? (
        <div className="units-v3-history-list">
          {ownersHistory.map((owner) => {
            const current = !owner.ends_at;
            return (
              <article key={owner.id}>
                <div>
                  <strong>{historyPersonName(owner.person_id)}</strong>
                  <span>{percentage(owner.ownership_percentage)}</span>
                  <small>
                    Desde {formatDate(owner.starts_at)}
                    {owner.ends_at ? ` · hasta ${formatDate(owner.ends_at)}` : ''}
                  </small>
                </div>
                <div className="units-v3-history-list__badges">
                  {owner.is_primary_contact ? <Badge tone="info">Contacto principal</Badge> : null}
                  <Badge tone={current ? 'success' : 'neutral'}>
                    {current ? 'Actual' : 'Histórica'}
                  </Badge>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {!historyLoading && !historyError && !ownersHistory.length ? (
        <EmptyState
          description="Esta unidad todavía no tiene asignaciones de propiedad."
          icon={<PeopleIcon size={26} />}
          title="Sin propiedad registrada"
        />
      ) : null}
    </WorkspaceSection>
  );

  const renderOccupancy = () => (
    <WorkspaceSection
      description="Propiedad y ocupación mantienen ciclos de vida independientes y auditables."
      title="Historial de ocupación"
    >
      {historyLoading ? renderHistoryLoading() : null}
      {!historyLoading && historyError ? <InlineNotice tone="error">{historyError}</InlineNotice> : null}
      {!historyLoading && !historyError && occupanciesHistory.length ? (
        <div className="units-v3-history-list">
          {occupanciesHistory.map((occupancy) => {
            const current = !occupancy.ends_at;
            return (
              <article key={occupancy.id}>
                <div>
                  <strong>{historyPersonName(occupancy.person_id)}</strong>
                  <span>{occupancyLabels[occupancy.occupancy_type]}</span>
                  <small>
                    Desde {formatDate(occupancy.starts_at)}
                    {occupancy.ends_at ? ` · hasta ${formatDate(occupancy.ends_at)}` : ''}
                  </small>
                </div>
                <div className="units-v3-history-list__badges">
                  {occupancy.is_primary_contact ? (
                    <Badge tone="info">Contacto principal</Badge>
                  ) : null}
                  <Badge tone={current ? 'success' : 'neutral'}>
                    {current ? 'Actual' : 'Histórica'}
                  </Badge>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {!historyLoading && !historyError && !occupanciesHistory.length ? (
        <EmptyState
          description="Esta unidad todavía no tiene ocupaciones registradas."
          icon={<HomeIcon size={26} />}
          title="Sin ocupación registrada"
        />
      ) : null}
    </WorkspaceSection>
  );

  const renderActions = () => (
    <div className="units-v3-detail-stack">
      <WorkspaceSection
        description="Modifica código, ubicación, tipo, piso, alícuota o estado sin cambiar relaciones históricas."
        title="Datos de la unidad"
      >
        <Button disabled={!canMutate} onClick={onEdit} variant="secondary">
          Editar unidad
        </Button>
      </WorkspaceSection>
      <WorkspaceSection
        description={
          unit.status === 'active'
            ? 'Archivar desactiva la unidad para la operación diaria, pero conserva pagos, cuotas, propietarios, ocupaciones y movimientos.'
            : 'Reactivar devuelve la unidad a la operación diaria sin reconstruir su historial.'
        }
        icon={<CheckCircleIcon size={18} />}
        title={unit.status === 'active' ? 'Archivar unidad' : 'Reactivar unidad'}
      >
        <Button
          disabled={!canMutate}
          onClick={onArchive}
          variant={unit.status === 'active' ? 'danger' : 'secondary'}
        >
          {unit.status === 'active' ? 'Archivar unidad' : 'Reactivar unidad'}
        </Button>
      </WorkspaceSection>
      <InlineNotice tone="info">
        Los cambios de propietario u ocupante se realizan desde Personas para conservar una sola
        identidad por persona y un historial consistente entre módulos.
      </InlineNotice>
    </div>
  );

  return (
    <Drawer
      description={`${UNIT_TYPE_LABELS[unit.type]} · ${unit.building?.name ?? 'Sin edificio asignado'}`}
      eyebrow="Unidad"
      onClose={onClose}
      prefix="units-v3"
      presentation="workspace"
      title={unitReferenceLabel({ code: unit.code, buildingName: unit.building?.name ?? null })}
      wide
    >
      <div className="units-v3-detail">
        <WorkspaceTabs className="units-v3-detail-tabs">
          {(
            [
              ['summary', 'Resumen'],
              ['ownership', 'Propiedad'],
              ['occupancy', 'Ocupación'],
              ['actions', 'Acciones'],
            ] as Array<[DetailTab, string]>
          ).map(([value, label]) => (
            <WorkspaceTab active={tab === value} key={value} onClick={() => setTab(value)}>
              {label}
            </WorkspaceTab>
          ))}
        </WorkspaceTabs>
        <div className="units-v3-detail-tabpanel" role="tabpanel">
          {tab === 'summary'
            ? renderSummary()
            : tab === 'ownership'
              ? renderOwnership()
              : tab === 'occupancy'
                ? renderOccupancy()
                : renderActions()}
        </div>
      </div>
    </Drawer>
  );
}
