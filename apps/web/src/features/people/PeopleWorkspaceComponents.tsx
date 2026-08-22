import type { ReactNode } from 'react';
import { Badge, Button, EmptyState, Field, Select, Surface } from '../../components/ui';
import {
  BellIcon,
  CheckCircleIcon,
  HomeIcon,
  PaymentsIcon,
  PeopleIcon,
  UnitsIcon,
} from '../../components/icons';
import { WorkspaceTab, WorkspaceTabs } from '../../components/WorkspaceUi';
import { residentRoleLabel } from '../../lib/residentAccess';
import type { ResidentInvitation } from '../../lib/residentAccess';
import type { PersonUnitRelationshipSummary } from './person-unit-relationships';
import { occupancyLabels, residentInvitationStatusLabels } from './relationship-model';
import type { Person } from './types';

export type PeopleProfileTab =
  | 'summary'
  | 'units'
  | 'community-roles'
  | 'private-notes'
  | 'digital-access';

export function personDisplayName(person: Person) {
  return `${person.first_name} ${person.last_name}`.trim();
}

export function personDisplayInitials(person: Person) {
  return (
    `${person.first_name.trim().charAt(0)}${person.last_name.trim().charAt(0)}`.toUpperCase() || '—'
  );
}

function personDocumentLabel(person: Person) {
  return person.document_number
    ? `${person.document_type ?? 'Documento'} ${person.document_number}`
    : 'Documento no registrado';
}

export function PeopleDirectoryView({
  people,
  selectedId,
  query,
  statusFilter,
  onQueryChange,
  onStatusFilterChange,
  onSelect,
  onClearFilters,
}: {
  people: Person[];
  selectedId?: string | null;
  query: string;
  statusFilter: string;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSelect: (person: Person) => void;
  onClearFilters: () => void;
}) {
  return (
    <Surface className="people-v3-directory">
      <div className="people-v3-directory__heading">
        <div>
          <span>Directorio</span>
          <h2>Personas registradas</h2>
        </div>
        <Badge tone="info">{people.length}</Badge>
      </div>

      <div className="people-v3-directory__filters ux-form">
        <Field label="Buscar">
          <input
            className="input"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Nombre, documento, correo o teléfono"
            type="search"
            value={query}
          />
        </Field>
        <Field label="Estado">
          <Select onChange={(event) => onStatusFilterChange(event.target.value)} value={statusFilter}>
            <option value="">Todos</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </Select>
        </Field>
      </div>

      {people.length ? (
        <div className="people-v3-directory__list">
          {people.map((person) => (
            <button
              className="people-v3-directory__item"
              data-selected={selectedId === person.id || undefined}
              key={person.id}
              onClick={() => onSelect(person)}
              type="button"
            >
              <span className="people-v3-avatar">{personDisplayInitials(person)}</span>
              <span className="people-v3-directory__identity">
                <strong>{personDisplayName(person)}</strong>
                <small>{personDocumentLabel(person)}</small>
              </span>
              <Badge tone={person.status === 'inactive' ? 'neutral' : 'success'}>
                {person.status === 'inactive' ? 'Inactiva' : 'Activa'}
              </Badge>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          actionLabel="Limpiar filtros"
          description="Prueba otra búsqueda o muestra todos los estados."
          icon={<PeopleIcon size={26} />}
          onAction={onClearFilters}
          title="No encontramos personas"
        />
      )}

      <footer className="people-v3-directory__footer">
        {people.length} {people.length === 1 ? 'resultado' : 'resultados'}
      </footer>
    </Surface>
  );
}

export function PersonProfileHeader({
  person,
  tab,
  onEdit,
  onTabChange,
  actions,
}: {
  person: Person;
  tab: PeopleProfileTab;
  onEdit: () => void;
  onTabChange: (tab: PeopleProfileTab) => void;
  actions?: ReactNode;
}) {
  return (
    <header className="people-v3-profile-header">
      <div className="people-v3-profile-header__identity">
        <span className="people-v3-avatar people-v3-avatar--large">
          {personDisplayInitials(person)}
        </span>
        <div>
          <div className="people-v3-profile-header__name">
            <h2>{personDisplayName(person)}</h2>
            <Badge tone={person.status === 'inactive' ? 'neutral' : 'success'}>
              {person.status === 'inactive' ? 'Inactiva' : 'Activa'}
            </Badge>
          </div>
          <div className="people-v3-profile-header__meta">
            <span>{personDocumentLabel(person)}</span>
            {person.email ? <span>{person.email}</span> : null}
            {person.phone ? <span>{person.phone}</span> : null}
          </div>
        </div>
      </div>
      <div className="people-v3-profile-header__actions">
        <Button onClick={onEdit} size="sm" variant="secondary">
          Editar persona
        </Button>
        {actions}
      </div>
      <WorkspaceTabs className="people-v3-profile-tabs">
        {[
          ['summary', 'Resumen'],
          ['units', 'Relaciones con unidades'],
          ['community-roles', 'Roles en la comunidad'],
          ['private-notes', 'Notas privadas'],
          ['digital-access', 'Acceso digital'],
        ].map(([value, label]) => (
          <WorkspaceTab
            active={tab === value}
            key={value}
            onClick={() => onTabChange(value as PeopleProfileTab)}
          >
            {label}
          </WorkspaceTab>
        ))}
      </WorkspaceTabs>
    </header>
  );
}

function invitationLabel(status: ResidentInvitation['status'] | null) {
  return status ? residentInvitationStatusLabels[status] : null;
}

function financialRoleLabel(role: PersonUnitRelationshipSummary['currentCommunication']) {
  if (!role?.financial_role) return 'No recibe información financiera';
  return role.financial_role === 'primary'
    ? 'Responsable financiero principal'
    : 'Destinatario financiero adicional';
}

export function PersonUnitRelationshipCard({
  relationship,
  onManage,
  onInvite,
  onHistory,
  onClose,
}: {
  relationship: PersonUnitRelationshipSummary;
  onManage: () => void;
  onInvite?: () => void;
  onHistory?: () => void;
  onClose?: () => void;
}) {
  const ownership = relationship.currentOwnership;
  const occupancy = relationship.currentOccupancy;
  const communication = relationship.currentCommunication;
  const accessEligible = relationship.accessRoles.length > 0;
  const invitationStatus = invitationLabel(relationship.latestInvitationStatus);

  return (
    <article className="people-v3-unit-card" data-active={relationship.active || undefined}>
      <header className="people-v3-unit-card__header">
        <div className="people-v3-unit-card__identity">
          <span className="people-v3-unit-card__icon">
            <UnitsIcon size={18} />
          </span>
          <div>
            <div className="people-v3-unit-card__title">
              <h4>{relationship.unitLabel}</h4>
              <Badge tone={relationship.active ? 'success' : 'neutral'}>
                {relationship.active ? 'Actual' : 'Histórica'}
              </Badge>
            </div>
            <small>
              {relationship.activeSince
                ? `Relación activa desde ${new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(relationship.activeSince))}`
                : 'Sin relación activa'}
            </small>
          </div>
        </div>
        {ownership?.ownership_percentage != null ? (
          <div className="people-v3-unit-card__participation">
            <span>Participación</span>
            <strong>{Number(ownership.ownership_percentage).toLocaleString('es')}%</strong>
          </div>
        ) : null}
      </header>

      <div className="people-v3-unit-card__facts">
        <div>
          <span className="people-v3-unit-card__fact-icon">
            <PeopleIcon size={17} />
          </span>
          <div>
            <strong>Propiedad</strong>
            <span>{ownership ? 'Propietario' : 'Sin propiedad activa'}</span>
            {ownership ? (
              <small>
                {ownership.ownership_percentage != null
                  ? `Participación ${ownership.ownership_percentage}%`
                  : 'Participación no indicada'}
              </small>
            ) : null}
          </div>
        </div>

        <div>
          <span className="people-v3-unit-card__fact-icon">
            <PaymentsIcon size={17} />
          </span>
          <div>
            <strong>Comunicaciones financieras</strong>
            <span>{financialRoleLabel(communication)}</span>
          </div>
        </div>

        <div>
          <span className="people-v3-unit-card__fact-icon">
            <BellIcon size={17} />
          </span>
          <div>
            <strong>Comunicaciones generales</strong>
            <span>{communication?.general_recipient ? 'Recibe comunicaciones' : 'No recibe'}</span>
          </div>
        </div>

        <div>
          <span className="people-v3-unit-card__fact-icon">
            <HomeIcon size={17} />
          </span>
          <div>
            <strong>Ocupación</strong>
            <span>{occupancy ? occupancyLabels[occupancy.occupancy_type] : 'No reside en la unidad'}</span>
          </div>
        </div>

        <div>
          <span className="people-v3-unit-card__fact-icon">
            <CheckCircleIcon size={17} />
          </span>
          <div>
            <strong>Acceso digital</strong>
            <span>{invitationStatus ?? (accessEligible ? 'Elegible' : 'No elegible')}</span>
            {relationship.latestInvitation ? (
              <small>{residentRoleLabel(relationship.latestInvitation.intended_role)}</small>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="people-v3-unit-card__actions">
        <div>
          {onHistory ? (
            <Button onClick={onHistory} size="sm" variant="ghost">
              Ver historial
            </Button>
          ) : null}
        </div>
        <div>
          <Button onClick={onManage} size="sm" variant="secondary">
            Editar relación
          </Button>
          {onInvite && accessEligible ? (
            <Button onClick={onInvite} size="sm" variant="secondary">
              Invitar
            </Button>
          ) : null}
          {onClose && relationship.active ? (
            <Button onClick={onClose} size="sm" variant="danger">
              Cerrar relación
            </Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

export function PeopleProfileEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="people-v3-profile-empty">
      <EmptyState
        actionLabel="Crear persona"
        description="Selecciona una persona para ver sus unidades, roles, notas y acceso digital."
        icon={<PeopleIcon size={30} />}
        onAction={onCreate}
        title="Selecciona un perfil"
      />
    </div>
  );
}
