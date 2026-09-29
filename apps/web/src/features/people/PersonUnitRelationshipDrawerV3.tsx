import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid, FormSection } from '../../components/FormLayout';
import { Badge, Button, Field, Select } from '../../components/ui';
import type { PersonUnitRelationshipSummary } from './person-unit-relationships';
import {
  canCreateRelationshipState,
  relationshipDraftForUnit,
  relationshipForUnit,
} from './person-unit-relationship-draft';
import { directoryUnitLabel, occupancyLabels } from './relationship-model';
import { peopleApi } from './api';
import type { Building, FinancialRecipientRole, Occupancy, Person, Unit } from './types';

type CloseTarget = {
  kind: 'ownership' | 'occupancy';
  id: string;
  label: string;
};

const financialLabels: Record<FinancialRecipientRole, string> = {
  none: 'No recibe información financiera',
  primary: 'Responsable financiero principal',
  additional: 'Destinatario financiero adicional',
};

export function PersonUnitRelationshipDrawerV3({
  condominiumId,
  session,
  person,
  units,
  buildings,
  relationships,
  initialUnitId,
  onClose,
  onChanged,
  onRequestClose,
}: {
  condominiumId: string;
  session: Session;
  person: Person;
  units: Unit[];
  buildings: Building[];
  relationships: PersonUnitRelationshipSummary[];
  initialUnitId?: string | undefined;
  onClose: () => void;
  onChanged: (message: string) => Promise<void> | void;
  onRequestClose: (target: CloseTarget) => void;
}) {
  const [unitId, setUnitId] = useState(initialUnitId ?? '');
  const [percentage, setPercentage] = useState('');
  const [occupancyType, setOccupancyType] = useState<Occupancy['occupancy_type']>('tenant');
  const [financialRole, setFinancialRole] = useState<FinancialRecipientRole>('none');
  const [generalRecipient, setGeneralRecipient] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [percentageError, setPercentageError] = useState('');
  const percentageInputRef = useRef<HTMLInputElement>(null);

  const availableUnits = useMemo(() => units.filter((unit) => unit.status !== 'inactive'), [units]);
  const selectedRelationship = relationshipForUnit(relationships, unitId);
  const unit = units.find((item) => item.id === unitId);
  const unitLabel =
    selectedRelationship?.unitLabel ??
    (unit ? directoryUnitLabel(unit, buildings) : 'Selecciona una unidad');

  useEffect(() => {
    setUnitId(initialUnitId ?? '');
  }, [initialUnitId]);

  useEffect(() => {
    const draft = relationshipDraftForUnit(selectedRelationship);
    setFinancialRole(draft.financialRole);
    setGeneralRecipient(draft.generalRecipient);
    setPercentage(draft.ownershipPercentage);
    setOccupancyType(draft.occupancyType);
    setError('');
    setPercentageError('');
  }, [unitId, selectedRelationship]);

  const createOwnership = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!unitId || !canCreateRelationshipState(selectedRelationship, 'ownership')) return;
    const numeric = percentage ? Number(percentage) : null;
    if (numeric != null && (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100)) {
      setPercentageError('La participación debe ser mayor que 0 y hasta 100.');
      percentageInputRef.current?.focus();
      return;
    }
    setPercentageError('');
    setBusy('ownership');
    setError('');
    try {
      await peopleApi(`/v1/condominiums/${condominiumId}/people/${person.id}/ownerships`, session, {
        method: 'POST',
        body: JSON.stringify({
          unitId,
          ...(numeric != null ? { ownershipPercentage: numeric } : {}),
          isPrimaryContact: true,
        }),
      });
      setPercentage('');
      await onChanged('Propiedad asociada correctamente. La historia anterior se conserva.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo asociar la propiedad.',
      );
    } finally {
      setBusy('');
    }
  };

  const createOccupancy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!unitId || !canCreateRelationshipState(selectedRelationship, 'occupancy')) return;
    setBusy('occupancy');
    setError('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${person.id}/occupancies`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ unitId, occupancyType, isPrimaryContact: true }),
        },
      );
      await onChanged('Ocupación asociada correctamente.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo asociar la ocupación.',
      );
    } finally {
      setBusy('');
    }
  };

  const saveCommunication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!unitId) return;
    setBusy('communication');
    setError('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${person.id}/communication-responsibilities/${unitId}`,
        session,
        {
          method: 'PATCH',
          body: JSON.stringify({ financialRole, generalRecipient }),
        },
      );
      await onChanged('Preferencias de comunicación actualizadas para esta unidad.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron guardar las comunicaciones.',
      );
    } finally {
      setBusy('');
    }
  };

  return (
    <Drawer
      description="Administra una sola unidad a la vez. Propiedad, ocupación y comunicaciones conservan sus ciclos de vida independientes y auditables."
      eyebrow="Relación con unidad"
      onClose={onClose}
      prefix="people-v3"
      presentation="workspace"
      title={unitId ? unitLabel : 'Vincular unidad'}
      wide
    >
      <div className="ux-form people-v3-relation-manager">
        {error ? (
          <div className="people-v3-form-error" role="alert">
            {error}
          </div>
        ) : null}

        <FormSection
          description="Elige la unidad una sola vez; las configuraciones siguientes se aplican a esta misma relación."
          title="Unidad"
          variant="card"
        >
          <Field label="Unidad" required>
            <Select
              disabled={Boolean(initialUnitId)}
              onChange={(event) => setUnitId(event.target.value)}
              value={unitId}
            >
              <option value="">Selecciona una unidad</option>
              {availableUnits.map((item) => (
                <option key={item.id} value={item.id}>
                  {directoryUnitLabel(item, buildings)}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        {unitId ? (
          <>
            <FormSection
              actions={
                selectedRelationship?.currentOwnership ? (
                  <Button
                    onClick={() =>
                      onRequestClose({
                        kind: 'ownership',
                        id: selectedRelationship.currentOwnership!.id,
                        label: `propiedad de ${unitLabel}`,
                      })
                    }
                    size="sm"
                    type="button"
                    variant="danger"
                  >
                    Cerrar propiedad
                  </Button>
                ) : null
              }
              description="La propiedad define el vínculo patrimonial. Cerrar una asignación conserva todo su historial."
              title="Propiedad"
              variant="card"
            >
              {selectedRelationship?.currentOwnership ? (
                <div className="people-v3-current-relation">
                  <div>
                    <span>Estado</span>
                    <Badge tone="success">Actual</Badge>
                  </div>
                  <div>
                    <span>Participación</span>
                    <strong>
                      {selectedRelationship.currentOwnership.ownership_percentage != null
                        ? `${selectedRelationship.currentOwnership.ownership_percentage}%`
                        : 'No indicada'}
                    </strong>
                  </div>
                  <div>
                    <span>Desde</span>
                    <strong>{selectedRelationship.currentOwnership.starts_at}</strong>
                  </div>
                </div>
              ) : (
                <form
                  className="ux-form"
                  noValidate
                  onSubmit={(event) => void createOwnership(event)}
                >
                  <FormGrid>
                    <Field
                      error={percentageError}
                      hint="Opcional. Mayor que 0 y hasta 100."
                      label="Participación (%)"
                    >
                      <input
                        className="input"
                        inputMode="decimal"
                        onChange={(event) => {
                          setPercentage(event.target.value);
                          if (percentageError) setPercentageError('');
                        }}
                        placeholder="Ej. 100"
                        ref={percentageInputRef}
                        value={percentage}
                      />
                    </Field>
                    <div className="people-v3-inline-submit">
                      <Button disabled={Boolean(busy)} type="submit">
                        {busy === 'ownership' ? 'Asociando…' : 'Asociar propiedad'}
                      </Button>
                    </div>
                  </FormGrid>
                </form>
              )}
            </FormSection>

            <FormSection
              actions={
                selectedRelationship?.currentOccupancy ? (
                  <Button
                    onClick={() =>
                      onRequestClose({
                        kind: 'occupancy',
                        id: selectedRelationship.currentOccupancy!.id,
                        label: `ocupación de ${unitLabel}`,
                      })
                    }
                    size="sm"
                    type="button"
                    variant="danger"
                  >
                    Cerrar ocupación
                  </Button>
                ) : null
              }
              description="Registra residencia efectiva sin confundirla con propiedad o permisos de acceso."
              title="Ocupación"
              variant="card"
            >
              {selectedRelationship?.currentOccupancy ? (
                <div className="people-v3-current-relation">
                  <div>
                    <span>Tipo</span>
                    <strong>
                      {occupancyLabels[selectedRelationship.currentOccupancy.occupancy_type]}
                    </strong>
                  </div>
                  <div>
                    <span>Estado</span>
                    <Badge tone="success">Actual</Badge>
                  </div>
                  <div>
                    <span>Desde</span>
                    <strong>{selectedRelationship.currentOccupancy.starts_at}</strong>
                  </div>
                </div>
              ) : (
                <form className="ux-form" onSubmit={(event) => void createOccupancy(event)}>
                  <FormGrid>
                    <Field label="Tipo de ocupación">
                      <Select
                        onChange={(event) =>
                          setOccupancyType(event.target.value as Occupancy['occupancy_type'])
                        }
                        value={occupancyType}
                      >
                        {(
                          Object.entries(occupancyLabels) as [Occupancy['occupancy_type'], string][]
                        ).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="people-v3-inline-submit">
                      <Button disabled={Boolean(busy)} type="submit">
                        {busy === 'occupancy' ? 'Asociando…' : 'Asociar ocupación'}
                      </Button>
                    </div>
                  </FormGrid>
                </form>
              )}
            </FormSection>

            <FormSection
              description="Define qué comunicaciones recibe esta persona. Los saldos y cargos siguen perteneciendo a la unidad."
              title="Comunicaciones"
              variant="card"
            >
              <form className="ux-form" onSubmit={(event) => void saveCommunication(event)}>
                <FormGrid>
                  <Field label="Información financiera">
                    <Select
                      onChange={(event) =>
                        setFinancialRole(event.target.value as FinancialRecipientRole)
                      }
                      value={financialRole}
                    >
                      {(Object.entries(financialLabels) as [FinancialRecipientRole, string][]).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>
                  <Field label="Comunicaciones generales">
                    <label className="people-v3-check-row">
                      <input
                        checked={generalRecipient}
                        onChange={(event) => setGeneralRecipient(event.target.checked)}
                        type="checkbox"
                      />
                      Recibir comunicaciones generales
                    </label>
                  </Field>
                </FormGrid>
                <FormActions>
                  <Button disabled={Boolean(busy)} type="submit">
                    {busy === 'communication' ? 'Guardando…' : 'Guardar comunicaciones'}
                  </Button>
                </FormActions>
              </form>
            </FormSection>
          </>
        ) : null}

        <FormActions sticky>
          <Button disabled={Boolean(busy)} onClick={onClose} type="button" variant="secondary">
            Listo
          </Button>
        </FormActions>
      </div>
    </Drawer>
  );
}
