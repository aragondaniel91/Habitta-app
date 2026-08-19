import { useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog, DialogBody, DialogFooter } from '../../components/Dialog';
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

export function UnitEditor({ mode, unit, topology, buildings, saving, onClose, onSave }: Props) {
  const [error, setError] = useState<string | null>(null);
  const singleBuilding = topology === 'single_building';
  const houseCommunity = topology === 'house_community';
  const buildingRequired = topology === 'multi_building_complex';
  const initialBuildingId = singleBuilding ? buildings[0]?.id : (unit?.buildingId ?? null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawPercentage = String(form.get('ownershipPercentage') ?? '').trim();
    const ownershipPercentage = rawPercentage ? Number(rawPercentage) : undefined;
    const selectedType = String(form.get('type')) as UnitType;
    const selectedBuilding = String(form.get('buildingId') ?? '').trim();
    if (!isUnitTypeAllowed(topology, selectedType))
      return setError('Ese tipo no corresponde a la estructura definida.');
    if (
      rawPercentage &&
      (ownershipPercentage === undefined ||
        !Number.isFinite(ownershipPercentage) ||
        ownershipPercentage <= 0 ||
        ownershipPercentage > 100)
    )
      return setError('La alícuota debe ser mayor que 0 y menor o igual a 100.');
    if (buildingRequired && !selectedBuilding)
      return setError('Selecciona el edificio de esta unidad.');
    const buildingId = houseCommunity
      ? null
      : singleBuilding
        ? (initialBuildingId ?? null)
        : selectedBuilding || null;
    setError(null);
    await onSave(
      buildUnitMutationPayload({
        code: String(form.get('code') ?? ''),
        buildingId,
        type: selectedType,
        ...(!houseCommunity ? { floor: String(form.get('floor') ?? '') } : {}),
        ...(ownershipPercentage === undefined ? {} : { ownershipPercentage }),
        status: String(form.get('status')) as 'active' | 'inactive',
      }),
    );
  };

  return (
    <Dialog
      closeDisabled={saving}
      eyebrow="Unidades"
      onClose={onClose}
      size="md"
      title={mode === 'create' ? (houseCommunity ? 'Nueva casa' : 'Nueva unidad') : 'Editar unidad'}
    >
      <form onSubmit={(event) => void save(event)}>
        <DialogBody className="structure-form-grid">
          <Field label={houseCommunity ? 'Código o número de casa' : 'Código o número de unidad'}>
            <input autoFocus defaultValue={unit?.code ?? ''} maxLength={40} name="code" required />
          </Field>
          {!houseCommunity && !singleBuilding ? (
            <Field label="Torre o edificio">
              <Select
                defaultValue={unit?.buildingId ?? ''}
                name="buildingId"
                required={buildingRequired}
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
          ) : null}
          {singleBuilding ? (
            <div className="structure-form-note">
              Edificio: <strong>{buildings[0]?.name}</strong>
            </div>
          ) : null}
          <Field label="Tipo">
            <Select defaultValue={unit?.type ?? defaultUnitType(topology)} name="type">
              {unitTypeOptions(topology).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {!houseCommunity ? (
            <Field hint="Número, PB, PH o nivel descriptivo." label="Piso o nivel">
              <input defaultValue={unit?.floor ?? ''} maxLength={20} name="floor" />
            </Field>
          ) : null}
          <Field hint="Mayor que 0 y hasta 100." label="Alícuota (%)">
            <input
              defaultValue={unit?.ownershipPercentage ?? ''}
              max="100"
              min="0.0001"
              name="ownershipPercentage"
              step="0.0001"
              type="number"
            />
          </Field>
          <Field hint="Archivar conserva pagos, cuotas y relaciones históricas." label="Estado">
            <Select defaultValue={unit?.status ?? 'active'} name="status">
              <option value="active">Activa</option>
              <option value="inactive">Inactiva / archivada</option>
            </Select>
          </Field>
          {error ? (
            <div className="structure-message" data-tone="error">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Guardando…' : 'Guardar unidad'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
