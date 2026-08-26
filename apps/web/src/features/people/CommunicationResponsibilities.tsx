import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, Field, InfoHint, Select, Surface } from '../../components/ui';
import { directoryUnitLabel, unitContextLabel } from './relationship-model';
import { peopleApi } from './api';
import type {
  Building,
  CommunicationAssignment,
  CommunicationResponsibilitiesView,
  FinancialRecipientRole,
  Person,
  Unit,
} from './types';

type Props = {
  buildings: Building[];
  condominiumId: string;
  person: Person;
  session: Session;
  units: Unit[];
};

const roleLabel: Record<FinancialRecipientRole, string> = {
  primary: 'Principal',
  additional: 'Adicional',
  none: 'No recibe información financiera',
};

export function CommunicationResponsibilities({
  buildings,
  condominiumId,
  person,
  session,
  units,
}: Props) {
  const [assignments, setAssignments] = useState<CommunicationAssignment[]>([]);
  const [unitId, setUnitId] = useState('');
  const [financialRole, setFinancialRole] = useState<FinancialRecipientRole>('none');
  const [generalRecipient, setGeneralRecipient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const view = await peopleApi<CommunicationResponsibilitiesView>(
      `/v1/condominiums/${condominiumId}/people/${person.id}/communication-responsibilities`,
      session,
    );
    setAssignments(view.assignments);
  };

  useEffect(() => {
    setError('');
    setUnitId((current) => current || units[0]?.id || '');
    void load().catch((requestError: unknown) =>
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar las responsabilidades.',
      ),
    );
  }, [condominiumId, person.id]);

  const save = async () => {
    if (!unitId) return;
    setBusy(true);
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
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo guardar la responsabilidad.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="people-section">
      <div className="people-section__heading">
        <div>
          <span className="people-kicker">Comunicaciones</span>
          <h3>
            Comunicaciones por unidad
            <InfoHint label="Más información sobre comunicaciones por unidad">
              El saldo y los cargos siguen perteneciendo a la unidad.
            </InfoHint>
          </h3>
        </div>
        <Badge tone="info">
          {assignments.filter((assignment) => !assignment.effective_to).length}
        </Badge>
      </div>
      <p className="people-muted">
        Esta configuración controla quién recibe comunicaciones. El permiso para registrar pagos se
        determina por la relación activa de la persona con la unidad.
      </p>
      {error ? <p>{error}</p> : null}
      <Surface className="people-inline-form">
        <Field label="Unidad">
          <Select onChange={(event) => setUnitId(event.target.value)} value={unitId}>
            <option value="">Selecciona una unidad</option>
            {units
              .filter((unit) => unit.status !== 'inactive')
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {directoryUnitLabel(unit, buildings)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Responsabilidad financiera">
          <Select
            onChange={(event) => setFinancialRole(event.target.value as FinancialRecipientRole)}
            value={financialRole}
          >
            {(Object.entries(roleLabel) as [FinancialRecipientRole, string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label="Comunicaciones generales">
          <label>
            <input
              checked={generalRecipient}
              onChange={(event) => setGeneralRecipient(event.target.checked)}
              type="checkbox"
            />
            Recibir comunicaciones generales
          </label>
        </Field>
        <Button disabled={busy || !unitId} onClick={() => void save()} type="button">
          {busy ? 'Guardando…' : 'Guardar responsabilidad'}
        </Button>
      </Surface>
      <div className="people-relationship-list">
        {assignments.map((assignment) => {
          const role = assignment.financial_role ?? 'none';
          const current = !assignment.effective_to;
          return (
            <article key={assignment.id}>
              <div>
                <strong>{unitContextLabel(assignment.units)}</strong>
                <small>
                  {roleLabel[role]} ·{' '}
                  {assignment.general_recipient
                    ? 'Comunicaciones generales'
                    : 'Sin comunicaciones generales'}
                </small>
              </div>
              <Badge tone={current ? 'success' : 'neutral'}>
                {current ? 'Actual' : 'Histórico'}
              </Badge>
            </article>
          );
        })}
        {!assignments.length ? (
          <p className="people-muted">Sin responsabilidades configuradas.</p>
        ) : null}
      </div>
    </section>
  );
}
