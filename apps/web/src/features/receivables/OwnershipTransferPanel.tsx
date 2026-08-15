import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, Field, Select } from '../../components/ui';
import { apiRequest } from '../../lib/api';

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
};

type OwnerSnapshot = {
  person_id: string;
  name: string;
  ownership_percentage?: string | number | null;
};

type OwnershipTransfer = {
  id: string;
  effective_date: string;
  previous_owners_snapshot: OwnerSnapshot[];
  new_owners_snapshot: OwnerSnapshot[];
  supporting_document_reference: string | null;
  notes: string | null;
  created_at: string;
};

type OwnerRow = {
  personId: string;
  percentage: string;
  primary: boolean;
};

type Props = {
  condominiumId: string;
  currentOwners: OwnerSnapshot[];
  onTransferred: () => void;
  session: Session;
  unitCode: string;
  unitId: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyOwner = (): OwnerRow => ({ personId: '', percentage: '100', primary: true });

export function OwnershipTransferPanel({
  condominiumId,
  currentOwners,
  onTransferred,
  session,
  unitCode,
  unitId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [history, setHistory] = useState<OwnershipTransfer[]>([]);
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [owners, setOwners] = useState<OwnerRow[]>([emptyOwner()]);
  const [documentReference, setDocumentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const percentageTotal = useMemo(
    () => owners.reduce((sum, owner) => sum + (Number(owner.percentage) || 0), 0),
    [owners],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<Person[]>(`/v1/condominiums/${condominiumId}/people`, session),
      apiRequest<OwnershipTransfer[]>(
        `/v1/condominiums/${condominiumId}/units/${unitId}/ownership-transfers`,
        session,
      ),
    ])
      .then(([nextPeople, nextHistory]) => {
        if (!active) return;
        setPeople(nextPeople.filter((person) => person.status === 'active'));
        setHistory(nextHistory);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : 'No se pudo cargar propiedad.');
      });
    return () => {
      active = false;
    };
  }, [condominiumId, session, unitId]);

  const addOwner = () => {
    setOwners((current) => [
      ...current.map((owner) => ({ ...owner, primary: false })),
      { personId: '', percentage: '', primary: current.length === 0 },
    ]);
  };

  const removeOwner = (index: number) => {
    setOwners((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      if (next.length && !next.some((owner) => owner.primary)) next[0] = { ...next[0], primary: true };
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (Math.abs(percentageTotal - 100) > 0.0001) {
      setMessage('Las alícuotas de los nuevos propietarios deben sumar exactamente 100%.');
      return;
    }
    if (new Set(owners.map((owner) => owner.personId)).size !== owners.length) {
      setMessage('No puedes seleccionar la misma persona más de una vez.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/units/${unitId}/ownership-transfers`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            effectiveDate,
            newOwners: owners.map((owner) => ({
              personId: owner.personId,
              ownershipPercentage: Number(owner.percentage),
              isPrimaryContact: owner.primary,
            })),
            ...(documentReference.trim()
              ? { supportingDocumentReference: documentReference.trim() }
              : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }),
        },
      );
      const nextHistory = await apiRequest<OwnershipTransfer[]>(
        `/v1/condominiums/${condominiumId}/units/${unitId}/ownership-transfers`,
        session,
      );
      setHistory(nextHistory);
      setOwners([emptyOwner()]);
      setDocumentReference('');
      setNotes('');
      setOpen(false);
      setMessage('Transferencia registrada. La cuenta financiera y toda su historia permanecen en la unidad.');
      onTransferred();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar la transferencia.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ownership-transfer-panel">
      <div className="account-statement-section-heading">
        <div>
          <strong>Propiedad de {unitCode}</strong>
          <span>La transferencia cambia propietarios y acceso, nunca mueve la deuda de la unidad.</span>
        </div>
        <Button onClick={() => setOpen((current) => !current)} size="sm" variant="secondary">
          {open ? 'Cerrar transferencia' : 'Transferir propiedad'}
        </Button>
      </div>

      {message ? <div className="receivables-action-feedback" role="status">{message}</div> : null}

      <div className="ownership-transfer-current">
        {currentOwners.map((owner) => (
          <div key={owner.person_id}>
            <span>{owner.name}</span>
            {owner.ownership_percentage != null ? <Badge tone="info">{owner.ownership_percentage}%</Badge> : null}
          </div>
        ))}
      </div>

      {open ? (
        <form className="ownership-transfer-form" onSubmit={(event) => void submit(event)}>
          <div className="ownership-transfer-warning">
            <strong>Fecha efectiva e historial</strong>
            <span>
              Habitta cerrará la relación de los propietarios actuales el día anterior y abrirá las nuevas relaciones en la fecha indicada. Cargos, pagos, saldos y movimientos no cambian de unidad.
            </span>
          </div>

          <Field label="Fecha efectiva">
            <input max={todayIso()} onChange={(event) => setEffectiveDate(event.target.value)} required type="date" value={effectiveDate} />
          </Field>

          <div className="ownership-transfer-owner-list">
            {owners.map((owner, index) => (
              <div className="ownership-transfer-owner-row" key={index}>
                <Field label={`Nuevo propietario ${index + 1}`}>
                  <Select
                    onChange={(event) =>
                      setOwners((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, personId: event.target.value } : row))
                    }
                    required
                    value={owner.personId}
                  >
                    <option value="">Selecciona una persona</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}
                  </Select>
                </Field>
                <Field label="Alícuota %">
                  <input
                    max="100"
                    min="0.0001"
                    onChange={(event) => setOwners((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, percentage: event.target.value } : row))}
                    required
                    step="0.0001"
                    type="number"
                    value={owner.percentage}
                  />
                </Field>
                <label className="ownership-transfer-primary">
                  <input
                    checked={owner.primary}
                    name="primary-owner"
                    onChange={() => setOwners((current) => current.map((row, rowIndex) => ({ ...row, primary: rowIndex === index })))}
                    type="radio"
                  />
                  Contacto principal
                </label>
                {owners.length > 1 ? <Button onClick={() => removeOwner(index)} size="sm" type="button" variant="ghost">Quitar</Button> : null}
              </div>
            ))}
          </div>

          <div className="ownership-transfer-total" data-valid={Math.abs(percentageTotal - 100) < 0.0001 || undefined}>
            <span>Total de propiedad</span>
            <strong>{percentageTotal.toFixed(4)}%</strong>
          </div>

          <Button onClick={addOwner} size="sm" type="button" variant="secondary">Agregar copropietario</Button>

          <Field label="Referencia del documento de soporte" hint="Referencia interna o ruta privada del documento; no uses una URL pública permanente.">
            <input maxLength={500} onChange={(event) => setDocumentReference(event.target.value)} placeholder="Ej. expediente-2026-014 / escritura privada" value={documentReference} />
          </Field>
          <Field label="Notas">
            <textarea maxLength={2000} onChange={(event) => setNotes(event.target.value)} rows={3} value={notes} />
          </Field>

          <div className="ownership-transfer-actions">
            <Button disabled={busy || owners.some((owner) => !owner.personId) || Math.abs(percentageTotal - 100) > 0.0001} type="submit">
              {busy ? 'Registrando…' : 'Confirmar transferencia'}
            </Button>
          </div>
        </form>
      ) : null}

      {history.length ? (
        <div className="ownership-transfer-history">
          <strong>Últimas transferencias</strong>
          {history.slice(0, 3).map((transfer) => (
            <div key={transfer.id}>
              <span>{transfer.effective_date}</span>
              <small>{transfer.previous_owners_snapshot.map((owner) => owner.name).join(', ') || 'Sin propietario previo'} → {transfer.new_owners_snapshot.map((owner) => owner.name).join(', ')}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
