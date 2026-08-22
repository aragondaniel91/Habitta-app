import { useState } from 'react';
import type { FormEvent } from 'react';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid, FormSection } from '../../components/FormLayout';
import { Button, Field, Select } from '../../components/ui';
import { defaultUnitType, isUnitTypeAllowed, unitTypeOptions } from '../../lib/unit-domain';
import type { PropertyTopology, UnitType } from '../../lib/unit-domain';
import type { DirectoryUnit } from './types';

export type UnitEditorInput = {
  code: string;
  buildingId?: string | null;
  type: UnitType;
  floor?: string;
  ownershipPercentage?: number;
  status: 'active' | 'inactive';
};

export type UnitBuilding = { id: string; name: string };

type Props = {
  mode: 'create' | 'edit';
  unit?: DirectoryUnit | null;
  topology: PropertyTopology;
  buildings: UnitBuilding[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: UnitEditorInput) => Promise<void> | void;
};

type Draft = {
  code: string;
  buildingId: string;
  type: UnitType;
  floor: string;
  ownershipPercentage: string;
  status: 'active' | 'inactive';
};

type Errors = Partial<Record<'code' | 'buildingId' | 'type' | 'ownershipPercentage', string>>;

export function buildUnitMutationPayload({
  code,
  buildingId,
  type,
  floor,
  ownershipPercentage,
  status,
}: UnitEditorInput): UnitEditorInput {
  return {
    code: code.trim(),
    ...(buildingId === undefined ? {} : { buildingId }),
    type,
    ...(floor?.trim() ? { floor: floor.trim() } : {}),
    ...(ownershipPercentage === undefined ? {} : { ownershipPercentage }),
    status,
  };
}

function initialDraft(
  unit: DirectoryUnit | null | undefined,
  topology: PropertyTopology,
  buildings: UnitBuilding[],
): Draft {
  const singleBuilding = topology === 'single_building';
  return {
    code: unit?.code ?? '',
    buildingId: singleBuilding ? (buildings[0]?.id ?? '') : (unit?.buildingId ?? ''),
    type: unit?.type ?? defaultUnitType(topology),
    floor: unit?.floor ?? '',
    ownershipPercentage:
      unit?.ownershipPercentage === null || unit?.ownershipPercentage === undefined
        ? ''
        : String(unit.ownershipPercentage),
    status: unit?.status ?? 'active',
  };
}

export function UnitEditor({ mode, unit, topology, buildings, saving, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(unit, topology, buildings));
  const [errors, setErrors] = useState<Errors>({});

  const singleBuilding = topology === 'single_building';
  const houseCommunity = topology === 'house_community';
  const buildingRequired = topology === 'multi_building_complex';

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key in errors) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key as keyof Errors];
        return next;
      });
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Errors = {};
    const rawPercentage = draft.ownershipPercentage.trim();
    const ownershipPercentage = rawPercentage ? Number(rawPercentage) : undefined;

    if (!draft.code.trim()) nextErrors.code = 'Escribe el código o número de la unidad.';
    if (!isUnitTypeAllowed(topology, draft.type)) {
      nextErrors.type = 'Ese tipo no corresponde a la estructura definida.';
    }
    if (
      rawPercentage &&
      (ownershipPercentage === undefined ||
        !Number.isFinite(ownershipPercentage) ||
        ownershipPercentage <= 0 ||
        ownershipPercentage > 100)
    ) {
      nextErrors.ownershipPercentage = 'La alícuota debe ser mayor que 0 y hasta 100.';
    }
    if (buildingRequired && !draft.buildingId) {
      nextErrors.buildingId = 'Selecciona el edificio de esta unidad.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const buildingId = houseCommunity
      ? null
      : singleBuilding
        ? (buildings[0]?.id ?? null)
        : draft.buildingId || null;

    await onSave(
      buildUnitMutationPayload({
        code: draft.code,
        buildingId,
        type: draft.type,
        ...(!houseCommunity ? { floor: draft.floor } : {}),
        ...(ownershipPercentage === undefined ? {} : { ownershipPercentage }),
        status: draft.status,
      }),
    );
  };

  return (
    <Drawer
      description={
        mode === 'create'
          ? 'Registra la unidad dentro de la estructura declarada del condominio.'
          : 'Actualiza la información física sin alterar propietarios, ocupantes ni historial financiero.'
      }
      eyebrow="Unidades"
      onClose={onClose}
      prefix="units-v3"
      presentation="workspace"
      title={mode === 'create' ? (houseCommunity ? 'Nueva casa' : 'Nueva unidad') : 'Editar unidad'}
      wide
    >
      <form className="ux-form units-v3-editor" noValidate onSubmit={(event) => void save(event)}>
        <FormSection
          description="El código identifica la unidad en toda la operación administrativa."
          title="Identificación"
          variant="card"
        >
          <FormGrid>
            <Field
              error={errors.code}
              label={houseCommunity ? 'Código o número de casa' : 'Código o número de unidad'}
              required
            >
              <input
                aria-invalid={Boolean(errors.code)}
                autoFocus
                className="input"
                maxLength={40}
                onChange={(event) => update('code', event.target.value)}
                placeholder={houseCommunity ? 'Ej. Casa 12' : 'Ej. A-101'}
                value={draft.code}
              />
            </Field>
            <Field error={errors.type} label="Tipo">
              <Select
                aria-invalid={Boolean(errors.type)}
                onChange={(event) => update('type', event.target.value as UnitType)}
                value={draft.type}
              >
                {unitTypeOptions(topology).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        {!houseCommunity ? (
          <FormSection
            description="Habitta respeta la topología declarada y mantiene los identificadores UUID internos."
            title="Ubicación"
            variant="card"
          >
            <FormGrid>
              {!singleBuilding ? (
                <Field
                  error={errors.buildingId}
                  hint={
                    buildingRequired
                      ? 'Obligatorio para conjuntos residenciales con múltiples edificios.'
                      : 'Puede quedar sin edificio cuando representa un área común.'
                  }
                  label="Torre o edificio"
                  required={buildingRequired}
                >
                  <Select
                    aria-invalid={Boolean(errors.buildingId)}
                    onChange={(event) => update('buildingId', event.target.value)}
                    value={draft.buildingId}
                  >
                    <option value="">
                      {buildingRequired ? 'Selecciona un edificio' : 'Sin edificio / área común'}
                    </option>
                    {buildings.map((building) => (
                      <option key={building.id} value={building.id}>
                        {building.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <div className="units-v3-editor__fixed-context" data-span="full">
                  <span>Edificio asignado</span>
                  <strong>{buildings[0]?.name ?? 'Pendiente de configurar'}</strong>
                  <small>La asociación se resuelve automáticamente por UUID.</small>
                </div>
              )}
              <Field hint="Número, PB, PH o nivel descriptivo." label="Piso o nivel">
                <input
                  className="input"
                  maxLength={20}
                  onChange={(event) => update('floor', event.target.value)}
                  placeholder="Ej. 3, PB o PH"
                  value={draft.floor}
                />
              </Field>
            </FormGrid>
          </FormSection>
        ) : null}

        <FormSection
          description="La alícuota se usa como dato estructural de participación; los saldos y movimientos existentes no se eliminan al archivar."
          title="Participación y estado"
          variant="card"
        >
          <FormGrid>
            <Field
              error={errors.ownershipPercentage}
              hint="Mayor que 0 y hasta 100. Déjalo vacío si aún no está definida."
              label="Alícuota (%)"
            >
              <input
                aria-invalid={Boolean(errors.ownershipPercentage)}
                className="input"
                inputMode="decimal"
                onChange={(event) => update('ownershipPercentage', event.target.value)}
                placeholder="Ej. 1.2500"
                value={draft.ownershipPercentage}
              />
            </Field>
            <Field
              hint="Archivar conserva pagos, cuotas, propietarios y ocupaciones históricas."
              label="Estado"
            >
              <Select
                onChange={(event) => update('status', event.target.value as Draft['status'])}
                value={draft.status}
              >
                <option value="active">Activa</option>
                <option value="inactive">Inactiva / archivada</option>
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        <FormActions sticky>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Guardando…' : houseCommunity ? 'Guardar casa' : 'Guardar unidad'}
          </Button>
        </FormActions>
      </form>
    </Drawer>
  );
}
