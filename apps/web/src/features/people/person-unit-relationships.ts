import type { ResidentInvitation, ResidentRole } from '../../lib/residentAccess';
import { residentInvitationDisplayStatus } from './relationship-model';
import { directoryUnitLabel, unitContextLabel } from './relationship-model';
import type {
  Building,
  CommunicationAssignment,
  Occupancy,
  Ownership,
  Unit,
  UnitContext,
} from './types';

export type PersonUnitRelationshipSummary = {
  unitId: string;
  unitLabel: string;
  active: boolean;
  activeSince: string | null;
  currentOwnership: Ownership | null;
  ownershipHistory: Ownership[];
  currentOccupancy: Occupancy | null;
  occupancyHistory: Occupancy[];
  currentCommunication: CommunicationAssignment | null;
  communicationHistory: CommunicationAssignment[];
  accessRoles: ResidentRole[];
  latestInvitation: ResidentInvitation | null;
  latestInvitationStatus: ResidentInvitation['status'] | null;
  invitations: ResidentInvitation[];
};

type BuildPersonUnitRelationshipsInput = {
  units: Unit[];
  buildings: Building[];
  ownerships: Ownership[];
  occupancies: Occupancy[];
  communicationAssignments: CommunicationAssignment[];
  invitations: ResidentInvitation[];
  now?: Date;
};

function newestBy<T>(items: T[], value: (item: T) => string): T | null {
  return [...items].sort((left, right) => value(right).localeCompare(value(left)))[0] ?? null;
}

function embeddedUnitContext(
  unitId: string,
  ownerships: Ownership[],
  occupancies: Occupancy[],
  communicationAssignments: CommunicationAssignment[],
): UnitContext | null {
  return (
    ownerships.find((item) => item.unit_id === unitId)?.units ??
    occupancies.find((item) => item.unit_id === unitId)?.units ??
    communicationAssignments.find((item) => item.unit_id === unitId)?.units ??
    null
  );
}

function relationshipLabel(
  unitId: string,
  units: Unit[],
  buildings: Building[],
  ownerships: Ownership[],
  occupancies: Occupancy[],
  communicationAssignments: CommunicationAssignment[],
) {
  const unit = units.find((item) => item.id === unitId);
  if (unit) return directoryUnitLabel(unit, buildings);

  const context = embeddedUnitContext(unitId, ownerships, occupancies, communicationAssignments);
  return context ? unitContextLabel(context) : 'Unidad no disponible';
}

function earliestDate(values: Array<string | null | undefined>) {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates[0] ?? null;
}

export function buildPersonUnitRelationships({
  units,
  buildings,
  ownerships,
  occupancies,
  communicationAssignments,
  invitations,
  now = new Date(),
}: BuildPersonUnitRelationshipsInput): PersonUnitRelationshipSummary[] {
  const unitIds = new Set<string>();

  for (const ownership of ownerships) unitIds.add(ownership.unit_id);
  for (const occupancy of occupancies) unitIds.add(occupancy.unit_id);
  for (const assignment of communicationAssignments) unitIds.add(assignment.unit_id);
  for (const invitation of invitations) unitIds.add(invitation.unit_id);

  return [...unitIds]
    .map((unitId) => {
      const unitOwnerships = ownerships.filter((item) => item.unit_id === unitId);
      const unitOccupancies = occupancies.filter((item) => item.unit_id === unitId);
      const unitCommunications = communicationAssignments.filter((item) => item.unit_id === unitId);
      const unitInvitations = invitations
        .filter((item) => item.unit_id === unitId)
        .sort((left, right) => right.created_at.localeCompare(left.created_at));

      const currentOwnership = newestBy(
        unitOwnerships.filter((item) => !item.ends_at),
        (item) => item.starts_at,
      );
      const currentOccupancy = newestBy(
        unitOccupancies.filter((item) => !item.ends_at),
        (item) => item.starts_at,
      );
      const currentCommunication = newestBy(
        unitCommunications.filter((item) => !item.effective_to),
        (item) => item.effective_from,
      );
      const latestInvitation = unitInvitations[0] ?? null;

      const accessRoles: ResidentRole[] = [];
      if (currentOwnership) accessRoles.push('owner');
      if (currentOccupancy?.occupancy_type === 'tenant') accessRoles.push('tenant');

      const structuralDates = [currentOwnership?.starts_at, currentOccupancy?.starts_at];
      const activeSince =
        earliestDate(structuralDates) ?? currentCommunication?.effective_from ?? null;

      return {
        unitId,
        unitLabel: relationshipLabel(
          unitId,
          units,
          buildings,
          ownerships,
          occupancies,
          communicationAssignments,
        ),
        active: Boolean(currentOwnership || currentOccupancy || currentCommunication),
        activeSince,
        currentOwnership,
        ownershipHistory: unitOwnerships,
        currentOccupancy,
        occupancyHistory: unitOccupancies,
        currentCommunication,
        communicationHistory: unitCommunications,
        accessRoles,
        latestInvitation,
        latestInvitationStatus: latestInvitation
          ? residentInvitationDisplayStatus(latestInvitation, now)
          : null,
        invitations: unitInvitations,
      } satisfies PersonUnitRelationshipSummary;
    })
    .sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return left.unitLabel.localeCompare(right.unitLabel, 'es');
    });
}
