import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid, FormSection } from '../../components/FormLayout';
import { Button, Field, Select } from '../../components/ui';
import { directoryUnitLabel } from './relationship-model';
import { peopleApi } from './api';
import type { Building, FinancialRecipientRole, Person, Unit } from './types';

type InitialRelationshipKind =
  | 'none'
  | 'owner'
  | 'owner_occupant'
  | 'tenant'
  | 'family_member'
  | 'authorized_occupant'
  | 'board_member'
  | 'administrator_contact'
  | 'representative'
  | 'emergency_contact'
  | 'other';

type Draft = {
  firstName: string;
  lastName: string;
  documentType: string;
  customDocumentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive';
  relationshipKind: InitialRelationshipKind;
  unitId: string;
  ownershipPercentage: string;
  relationshipTitle: string;
  financialRole: FinancialRecipientRole;
  generalRecipient: boolean;
};

type Errors = Partial<
  Record<'firstName' | 'lastName' | 'customDocumentType' | 'unitId' | 'ownershipPercentage', string>
>;

const unitScopedKinds: InitialRelationshipKind[] = [
  'owner',
  'owner_occupant',
  'tenant',
  'family_member',
  'authorized_occupant',
];

const ownershipKinds: InitialRelationshipKind[] = ['owner', 'owner_occupant'];

const relationshipOptions: Array<[InitialRelationshipKind, string]> = [
  ['none', 'Sin relación por ahora'],
  ['owner', 'Propietario'],
  ['owner_occupant', 'Propietario residente'],
  ['tenant', 'Inquilino'],
  ['family_member', 'Familiar residente'],
  ['authorized_occupant', 'Ocupante autorizado'],
  ['board_member', 'Junta de condominio'],
  ['administrator_contact', 'Contacto de administración'],
  ['representative', 'Representante'],
  ['emergency_contact', 'Contacto de emergencia'],
  ['other', 'Otra responsabilidad'],
];

function emptyDraft(): Draft {
  return {
    firstName: '',
    lastName: '',
    documentType: '',
    customDocumentType: '',
    documentNumber: '',
    email: '',
    phone: '',
    status: 'active',
    relationshipKind: 'none',
    unitId: '',
    ownershipPercentage: '',
    relationshipTitle: '',
    financialRole: 'none',
    generalRecipient: false,
  };
}

function draftForPerson(person: Person): Draft {
  const savedDocumentType = person.document_type ?? '';
  const preset = ['', 'Cédula V', 'Cédula E', 'RIF', 'Pasaporte'].includes(savedDocumentType);
  return {
    ...emptyDraft(),
    firstName: person.first_name,
    lastName: person.last_name,
    documentType: preset ? savedDocumentType : 'Otro',
    customDocumentType: preset ? '' : savedDocumentType,
    documentNumber: person.document_number ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    status: person.status === 'inactive' ? 'inactive' : 'active',
  };
}

export function PersonEditorDrawerV3({
  condominiumId,
  session,
  buildings,
  units,
  person,
  onClose,
  onSaved,
}: {
  condominiumId: string;
  session: Session;
  buildings: Building[];
  units: Unit[];
  person?: Person | null;
  onClose: () => void;
  onSaved: (person: Person, message: string) => Promise<void> | void;
}) {
  const editing = Boolean(person);
  const [draft, setDraft] = useState<Draft>(() => (person ? draftForPerson(person) : emptyDraft()));
  const [errors, setErrors] = useState<Errors>({});
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(person ? draftForPerson(person) : emptyDraft());
    setErrors({});
    setRequestError('');
  }, [person]);

  const unitScoped = !editing && unitScopedKinds.includes(draft.relationshipKind);
  const ownsUnit = !editing && ownershipKinds.includes(draft.relationshipKind);
  const communityRole =
    !editing &&
    draft.relationshipKind !== 'none' &&
    !unitScopedKinds.includes(draft.relationshipKind);

  const availableUnits = useMemo(() => units.filter((unit) => unit.status !== 'inactive'), [units]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const setRelationshipKind = (kind: InitialRelationshipKind) => {
    setDraft((current) => ({
      ...current,
      relationshipKind: kind,
      unitId: '',
      ownershipPercentage: '',
      relationshipTitle: '',
      financialRole: 'none',
      generalRecipient: false,
    }));
    setErrors((current) => ({
      ...current,
      unitId: undefined,
      ownershipPercentage: undefined,
    }));
  };

  const validate = () => {
    const next: Errors = {};
    if (!draft.firstName.trim()) next.firstName = 'Escribe el nombre para continuar.';
    if (!draft.lastName.trim()) next.lastName = 'Escribe el apellido para continuar.';
    if (draft.documentType === 'Otro' && !draft.customDocumentType.trim()) {
      next.customDocumentType = 'Indica el tipo de documento.';
    }
    if (!editing && draft.status === 'inactive' && draft.relationshipKind !== 'none') {
      setRequestError('Una persona inactiva no puede comenzar con una relación activa.');
      return false;
    }
    if (unitScoped && !draft.unitId) next.unitId = 'Selecciona la unidad de esta relación.';
    if (ownsUnit && draft.ownershipPercentage) {
      const percentage = Number(draft.ownershipPercentage);
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        next.ownershipPercentage = 'Usa un porcentaje mayor que 0 y hasta 100.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError('');
    if (!validate()) return;

    setSaving(true);
    try {
      const documentType =
        draft.documentType === 'Otro' ? draft.customDocumentType.trim() : draft.documentType;
      const personPayload = {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        documentType,
        documentNumber: draft.documentNumber.trim(),
        ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
        ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
        status: draft.status,
      };

      if (editing && person) {
        const result = await peopleApi<Person[] | Person>(
          `/v1/condominiums/${condominiumId}/people/${person.id}`,
          session,
          { method: 'PATCH', body: JSON.stringify(personPayload) },
        );
        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved) throw new Error('La persona no pudo actualizarse.');
        await onSaved(saved, 'Persona actualizada correctamente.');
        return;
      }

      const initialRelationship =
        draft.relationshipKind === 'none'
          ? null
          : {
              kind: draft.relationshipKind,
              ...(unitScoped ? { unitId: draft.unitId } : {}),
              ...(ownsUnit && draft.ownershipPercentage
                ? { ownershipPercentage: Number(draft.ownershipPercentage) }
                : {}),
              ...(communityRole && draft.relationshipTitle.trim()
                ? { title: draft.relationshipTitle.trim() }
                : {}),
            };
      const communication =
        initialRelationship && unitScoped
          ? {
              financialRole: draft.financialRole,
              generalRecipient: draft.generalRecipient,
            }
          : null;

      const result = await peopleApi<Person[] | Person>(
        `/v1/condominiums/${condominiumId}/people/create-with-context`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ person: personPayload, initialRelationship, communication }),
        },
      );
      const saved = Array.isArray(result) ? result[0] : result;
      if (!saved) throw new Error('La persona no pudo crearse.');
      await onSaved(
        saved,
        initialRelationship ? 'Persona y relación creadas correctamente.' : 'Persona creada.',
      );
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'No se pudo guardar la persona.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      description={
        editing
          ? 'Actualiza la identidad y el contacto sin cambiar sus relaciones históricas.'
          : 'La identidad se registra una sola vez. Puedes asociarla a una unidad o responsabilidad ahora o completarlo más tarde.'
      }
      eyebrow={editing ? 'Personas' : 'Nueva persona'}
      onClose={onClose}
      prefix="people-v3"
      presentation="workspace"
      title={editing ? 'Editar persona' : 'Nueva persona'}
      wide
    >
      <form className="ux-form" noValidate onSubmit={(event) => void submit(event)}>
        {requestError ? (
          <div className="people-v3-form-error" role="alert">
            {requestError}
          </div>
        ) : null}

        <FormSection
          description="Registra la identidad una sola vez. Las relaciones con unidades se administran por separado."
          title="Identidad y contacto"
          variant="card"
        >
          <FormGrid>
            <Field error={errors.firstName} label="Nombre" required>
              <input
                aria-invalid={Boolean(errors.firstName)}
                autoFocus
                className="input"
                onChange={(event) => update('firstName', event.target.value)}
                placeholder="Nombre(s)"
                value={draft.firstName}
              />
            </Field>
            <Field error={errors.lastName} label="Apellido" required>
              <input
                aria-invalid={Boolean(errors.lastName)}
                className="input"
                onChange={(event) => update('lastName', event.target.value)}
                placeholder="Apellidos"
                value={draft.lastName}
              />
            </Field>
            <Field label="Tipo de documento">
              <Select
                onChange={(event) => update('documentType', event.target.value)}
                value={draft.documentType}
              >
                <option value="">Sin especificar</option>
                <option value="Cédula V">Cédula V</option>
                <option value="Cédula E">Cédula E</option>
                <option value="RIF">RIF</option>
                <option value="Pasaporte">Pasaporte</option>
                <option value="Otro">Otro</option>
              </Select>
            </Field>
            {draft.documentType === 'Otro' ? (
              <Field error={errors.customDocumentType} label="Tipo de documento personalizado">
                <input
                  aria-invalid={Boolean(errors.customDocumentType)}
                  className="input"
                  maxLength={80}
                  onChange={(event) => update('customDocumentType', event.target.value)}
                  placeholder="Ej. Documento consular"
                  value={draft.customDocumentType}
                />
              </Field>
            ) : (
              <Field label="Número de documento">
                <input
                  className="input"
                  onChange={(event) => update('documentNumber', event.target.value)}
                  placeholder="Ej. 21.123.456"
                  value={draft.documentNumber}
                />
              </Field>
            )}
            {draft.documentType === 'Otro' ? (
              <Field label="Número de documento">
                <input
                  className="input"
                  onChange={(event) => update('documentNumber', event.target.value)}
                  placeholder="Número o referencia"
                  value={draft.documentNumber}
                />
              </Field>
            ) : null}
            <Field label="Correo electrónico">
              <input
                className="input"
                inputMode="email"
                onChange={(event) => update('email', event.target.value)}
                placeholder="ejemplo@correo.com"
                type="email"
                value={draft.email}
              />
            </Field>
            <Field label="Teléfono">
              <input
                className="input"
                onChange={(event) => update('phone', event.target.value)}
                placeholder="Ej. +58 414 123 4567"
                type="tel"
                value={draft.phone}
              />
            </Field>
            <Field label="Estado">
              <Select
                onChange={(event) => update('status', event.target.value as Draft['status'])}
                value={draft.status}
              >
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        {!editing ? (
          <FormSection
            description="Puedes guardar sólo la persona o crear su primera relación en este mismo paso."
            title="Relación inicial (opcional)"
            variant="card"
          >
            <Field label="Relación">
              <Select
                onChange={(event) =>
                  setRelationshipKind(event.target.value as InitialRelationshipKind)
                }
                value={draft.relationshipKind}
              >
                {relationshipOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            {unitScoped ? (
              <div className="people-v3-relation-initial">
                <FormGrid>
                  <Field error={errors.unitId} label="Unidad" required>
                    <Select
                      aria-invalid={Boolean(errors.unitId)}
                      onChange={(event) => update('unitId', event.target.value)}
                      value={draft.unitId}
                    >
                      <option value="">Selecciona una unidad</option>
                      {availableUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {directoryUnitLabel(unit, buildings)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {ownsUnit ? (
                    <Field
                      error={errors.ownershipPercentage}
                      hint="Opcional. Mayor que 0 y hasta 100."
                      label="Participación"
                    >
                      <input
                        aria-invalid={Boolean(errors.ownershipPercentage)}
                        className="input"
                        inputMode="decimal"
                        onChange={(event) => update('ownershipPercentage', event.target.value)}
                        placeholder="Ej. 100"
                        value={draft.ownershipPercentage}
                      />
                    </Field>
                  ) : (
                    <div aria-hidden="true" />
                  )}
                  <Field
                    hint="El saldo y los cargos siguen perteneciendo a la unidad."
                    label="Comunicaciones financieras"
                  >
                    <Select
                      onChange={(event) =>
                        update('financialRole', event.target.value as FinancialRecipientRole)
                      }
                      value={draft.financialRole}
                    >
                      <option value="none">No recibe información financiera</option>
                      <option value="primary">Responsable principal</option>
                      <option value="additional">Destinatario adicional</option>
                    </Select>
                  </Field>
                  <Field label="Comunicaciones generales">
                    <label className="people-v3-check-row">
                      <input
                        checked={draft.generalRecipient}
                        onChange={(event) => update('generalRecipient', event.target.checked)}
                        type="checkbox"
                      />
                      Recibir comunicaciones generales
                    </label>
                  </Field>
                </FormGrid>
              </div>
            ) : null}

            {communityRole ? (
              <Field hint="Ej. Presidente de la junta" label="Cargo o detalle">
                <input
                  className="input"
                  onChange={(event) => update('relationshipTitle', event.target.value)}
                  placeholder="Opcional"
                  value={draft.relationshipTitle}
                />
              </Field>
            ) : null}
          </FormSection>
        ) : null}

        <FormActions sticky>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear persona'}
          </Button>
        </FormActions>
      </form>
    </Drawer>
  );
}
