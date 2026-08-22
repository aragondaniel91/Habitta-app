import { Drawer } from '../../components/Drawer';
import { WorkspaceSection } from '../../components/WorkspaceUi';
import { Badge } from '../../components/ui';
import { residentRoleLabel } from '../../lib/residentAccess';
import type { PersonUnitRelationshipSummary } from './person-unit-relationships';
import { occupancyLabels, residentInvitationStatusLabels } from './relationship-model';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Actual';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value));
}

export function PersonRelationshipHistoryDrawerV3({
  relationship,
  onClose,
}: {
  relationship: PersonUnitRelationshipSummary;
  onClose: () => void;
}) {
  return (
    <Drawer
      description="Consulta los ciclos históricos sin reescribir ni borrar relaciones anteriores."
      eyebrow="Historial auditable"
      onClose={onClose}
      prefix="people-v3"
      presentation="workspace"
      title={relationship.unitLabel}
      wide
    >
      <div className="people-v3-history">
        <WorkspaceSection
          title="Propiedad"
          description="Asignaciones patrimoniales registradas para esta persona."
        >
          {relationship.ownershipHistory.length ? (
            <div className="people-v3-history__list">
              {relationship.ownershipHistory.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>Propietario</strong>
                    <span>
                      {item.ownership_percentage != null
                        ? `Participación ${item.ownership_percentage}%`
                        : 'Participación no indicada'}
                    </span>
                    <small>
                      Desde {formatDate(item.starts_at)} ·{' '}
                      {item.ends_at ? `hasta ${formatDate(item.ends_at)}` : 'actual'}
                    </small>
                  </div>
                  <Badge tone={item.ends_at ? 'neutral' : 'success'}>
                    {item.ends_at ? 'Histórica' : 'Actual'}
                  </Badge>
                </article>
              ))}
            </div>
          ) : (
            <p className="people-v3-muted">Sin historial de propiedad.</p>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="Ocupación"
          description="Residencia efectiva registrada independientemente de la propiedad."
        >
          {relationship.occupancyHistory.length ? (
            <div className="people-v3-history__list">
              {relationship.occupancyHistory.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{occupancyLabels[item.occupancy_type]}</strong>
                    <small>
                      Desde {formatDate(item.starts_at)} ·{' '}
                      {item.ends_at ? `hasta ${formatDate(item.ends_at)}` : 'actual'}
                    </small>
                  </div>
                  <Badge tone={item.ends_at ? 'neutral' : 'success'}>
                    {item.ends_at ? 'Histórica' : 'Actual'}
                  </Badge>
                </article>
              ))}
            </div>
          ) : (
            <p className="people-v3-muted">Sin historial de ocupación.</p>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="Comunicaciones"
          description="Responsabilidades financieras y generales por ciclo de vigencia."
        >
          {relationship.communicationHistory.length ? (
            <div className="people-v3-history__list">
              {relationship.communicationHistory.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>
                      {item.financial_role === 'primary'
                        ? 'Responsable financiero principal'
                        : item.financial_role === 'additional'
                          ? 'Destinatario financiero adicional'
                          : 'Sin responsabilidad financiera'}
                    </strong>
                    <span>
                      {item.general_recipient
                        ? 'Recibe comunicaciones generales'
                        : 'No recibe comunicaciones generales'}
                    </span>
                    <small>
                      Desde {formatDate(item.effective_from)} ·{' '}
                      {item.effective_to ? `hasta ${formatDate(item.effective_to)}` : 'actual'}
                    </small>
                  </div>
                  <Badge tone={item.effective_to ? 'neutral' : 'success'}>
                    {item.effective_to ? 'Histórica' : 'Actual'}
                  </Badge>
                </article>
              ))}
            </div>
          ) : (
            <p className="people-v3-muted">Sin historial de comunicaciones.</p>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="Acceso digital"
          description="Invitaciones emitidas para esta persona y unidad."
        >
          {relationship.invitations.length ? (
            <div className="people-v3-history__list">
              {relationship.invitations.map((invitation) => (
                <article key={invitation.id}>
                  <div>
                    <strong>{residentRoleLabel(invitation.intended_role)}</strong>
                    <span>{invitation.email}</span>
                    <small>
                      Creada {formatDate(invitation.created_at)} · vence{' '}
                      {formatDate(invitation.expires_at)}
                    </small>
                  </div>
                  <Badge
                    tone={
                      invitation.status === 'accepted'
                        ? 'success'
                        : invitation.status === 'pending'
                          ? 'info'
                          : 'neutral'
                    }
                  >
                    {residentInvitationStatusLabels[invitation.status]}
                  </Badge>
                </article>
              ))}
            </div>
          ) : (
            <p className="people-v3-muted">Sin invitaciones para esta unidad.</p>
          )}
        </WorkspaceSection>
      </div>
    </Drawer>
  );
}
