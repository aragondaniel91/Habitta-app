import { Drawer } from '../../components/Drawer';
import { Badge } from '../../components/ui';
import { UNIT_TYPE_LABELS, unitReferenceLabel } from '../../lib/unit-domain';
import type { DirectoryOccupancy, DirectoryOwner, DirectoryUnit } from './types';

const occupancyLabels: Record<DirectoryOccupancy['occupancyType'], string> = {
  owner_occupant: 'Propietario residente',
  tenant: 'Inquilino',
  family_member: 'Familiar',
  authorized_occupant: 'Ocupante autorizado',
};

const personName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`;

const percentage = (value: DirectoryOwner['ownershipPercentage']) =>
  value === null || value === '' ? 'No definida' : `${Number(value).toLocaleString('es-VE')}%`;

export function UnitDetailDrawer({ unit, onClose }: { unit: DirectoryUnit; onClose: () => void }) {
  return (
    <Drawer
      eyebrow="Unidad"
      onClose={onClose}
      prefix="units-v2"
      title={unitReferenceLabel({ code: unit.code, buildingName: unit.building?.name ?? null })}
    >
      <div className="units-v2-detail">
        <section>
          <h3>Unidad</h3>
          <dl>
            <div>
              <dt>Tipo</dt>
              <dd>{UNIT_TYPE_LABELS[unit.type]}</dd>
            </div>
            {unit.building ? (
              <div>
                <dt>Edificio</dt>
                <dd>{unit.building.name}</dd>
              </div>
            ) : null}
            {unit.floor ? (
              <div>
                <dt>Piso o nivel</dt>
                <dd>{unit.floor}</dd>
              </div>
            ) : null}
            <div>
              <dt>Alícuota</dt>
              <dd>{percentage(unit.ownershipPercentage)}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                <Badge tone={unit.status === 'active' ? 'success' : 'neutral'}>
                  {unit.status === 'active' ? 'Activa' : 'Archivada'}
                </Badge>
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Propiedad</h3>
          {unit.owners.length ? (
            <ul>
              {unit.owners.map((owner) => (
                <li key={owner.assignmentId}>
                  <strong>{personName(owner)}</strong>
                  {owner.isPrimaryContact ? ' · Contacto principal' : ''}
                  <span>{percentage(owner.ownershipPercentage)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Sin propietarios activos registrados.</p>
          )}
        </section>
        <section>
          <h3>Ocupación</h3>
          {unit.occupancies.length ? (
            <ul>
              {unit.occupancies.map((occupancy) => (
                <li key={occupancy.assignmentId}>
                  <strong>{personName(occupancy)}</strong>
                  {occupancy.isPrimaryContact ? ' · Contacto principal' : ''}
                  <span>{occupancyLabels[occupancy.occupancyType]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Sin ocupantes activos registrados.</p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
