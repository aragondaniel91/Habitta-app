import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, MaintenanceIcon, RequestsIcon, SettingsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { Drawer } from '../components/Drawer';
import { FormActions, FormGrid } from '../components/FormLayout';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { supportsBuildingStructure, unitReferenceLabel } from '../lib/unit-domain';
import type { PropertyTopology } from '../lib/unit-domain';
import {
  assetStatusLabels,
  filterMaintenanceAssets,
  filterMaintenanceWorkOrders,
  formatMaintenanceDate,
  frequencyUnitLabels,
  getMaintenanceMetrics,
  maintenanceLocationLabel,
  planKindLabels,
  priorityLabels,
  workOrderKindLabels,
  workOrderStatusLabels,
} from '../lib/maintenance';
import type {
  MaintenanceAsset,
  MaintenanceAssetStatus,
  MaintenanceLocation,
  MaintenancePlan,
  MaintenancePriority,
  MaintenanceServiceLog,
  MaintenanceVendor,
  MaintenanceWorkOrder,
  MaintenanceWorkOrderStatus,
} from '../lib/maintenance';
import '../maintenance.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type Tab = 'overview' | 'assets' | 'plans' | 'work-orders';
type Drawer = 'asset' | 'plan' | 'work-order' | 'detail' | null;

type WorkspaceData = {
  assets: MaintenanceAsset[];
  plans: MaintenancePlan[];
  workOrders: MaintenanceWorkOrder[];
  vendors: MaintenanceVendor[];
  buildings: MaintenanceLocation[];
  units: MaintenanceLocation[];
  propertyTopology: PropertyTopology;
};
type CondominiumProfile = { property_topology?: PropertyTopology };

const emptyData: WorkspaceData = {
  assets: [],
  plans: [],
  workOrders: [],
  vendors: [],
  buildings: [],
  units: [],
  propertyTopology: 'unspecified',
};

const assetTone = (status: MaintenanceAssetStatus) => {
  if (status === 'active') return 'success' as const;
  if (status === 'out_of_service') return 'warning' as const;
  return 'neutral' as const;
};

const workOrderTone = (status: MaintenanceWorkOrderStatus) => {
  if (status === 'completed') return 'success' as const;
  if (status === 'scheduled' || status === 'in_progress') return 'warning' as const;
  if (status === 'cancelled') return 'neutral' as const;
  return 'info' as const;
};

function DrawerShell({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Drawer eyebrow={eyebrow} onClose={onClose} prefix="maintenance" title={title} wide={wide}>
      {children}
    </Drawer>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}) {
  return (
    <Surface className="maintenance-metric" data-tone={tone}>
      <div className="maintenance-metric__top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function MaintenanceLoading() {
  return (
    <div aria-label="Cargando mantenimiento" className="maintenance-page">
      <Skeleton className="maintenance-tabs-skeleton" />
      <div className="maintenance-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="maintenance-table-skeleton" />
    </div>
  );
}

function AssetForm({
  condominiumId,
  session,
  buildings,
  units,
  propertyTopology,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  buildings: MaintenanceLocation[];
  units: MaintenanceLocation[];
  propertyTopology: PropertyTopology;
  onCreated: (asset: MaintenanceAsset) => void;
}) {
  const buildingStructure = supportsBuildingStructure(propertyTopology);
  const buildingNameById = useMemo(
    () => Object.fromEntries(buildings.map((building) => [building.id, building.name])),
    [buildings],
  );
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [locationType, setLocationType] = useState<'common' | 'building' | 'unit'>('common');
  const [buildingId, setBuildingId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [installedOn, setInstalledOn] = useState('');
  const [warrantyExpiresOn, setWarrantyExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiRequest<MaintenanceAsset>(
        `/v1/condominiums/${condominiumId}/maintenance/assets`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            code,
            name,
            category,
            buildingId: buildingStructure && locationType === 'building' ? buildingId : undefined,
            unitId: locationType === 'unit' ? unitId : undefined,
            locationNotes: locationNotes || undefined,
            manufacturer: manufacturer || undefined,
            model: model || undefined,
            serialNumber: serialNumber || undefined,
            installedOn: installedOn || undefined,
            warrantyExpiresOn: warrantyExpiresOn || undefined,
            notes: notes || undefined,
          }),
        },
      );
      onCreated(created);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear el activo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="maintenance-form" onSubmit={(event) => void submit(event)}>
      {error ? <div className="maintenance-inline-alert">{error}</div> : null}
      <FormGrid columns={3}>
        <Field label="Código">
          <input
            className="input"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="BOMBA-01"
            required
            value={code}
          />
        </Field>
        <Field label="Nombre">
          <input
            className="input"
            onChange={(event) => setName(event.target.value)}
            placeholder="Bomba principal"
            required
            value={name}
          />
        </Field>
        <Field label="Categoría">
          <input
            className="input"
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Bombas, ascensores…"
            required
            value={category}
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Tipo de ubicación">
          <Select
            onChange={(event) =>
              setLocationType(event.target.value as 'common' | 'building' | 'unit')
            }
            value={locationType}
          >
            <option value="common">Área común</option>
            {buildingStructure ? <option value="building">Edificio o torre</option> : null}
            <option value="unit">Unidad</option>
          </Select>
        </Field>
        {buildingStructure && locationType === 'building' ? (
          <Field label="Edificio o torre">
            <Select
              onChange={(event) => setBuildingId(event.target.value)}
              required
              value={buildingId}
            >
              <option value="">Selecciona</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name ?? building.code}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {locationType === 'unit' ? (
          <Field label="Unidad">
            <Select onChange={(event) => setUnitId(event.target.value)} required value={unitId}>
              <option value="">Selecciona</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code
                    ? unitReferenceLabel({
                        code: unit.code,
                        buildingName: unit.building_id
                          ? (buildingNameById[unit.building_id] ?? null)
                          : null,
                      })
                    : unit.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {locationType === 'common' ? (
          <Field label="Ubicación específica" hint="Opcional">
            <input
              className="input"
              onChange={(event) => setLocationNotes(event.target.value)}
              placeholder="Cuarto de bombas, lobby…"
              value={locationNotes}
            />
          </Field>
        ) : null}
      </FormGrid>
      <FormGrid columns={3}>
        <Field label="Fabricante" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setManufacturer(event.target.value)}
            value={manufacturer}
          />
        </Field>
        <Field label="Modelo" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setModel(event.target.value)}
            value={model}
          />
        </Field>
        <Field label="Serial" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setSerialNumber(event.target.value)}
            value={serialNumber}
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Fecha de instalación" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setInstalledOn(event.target.value)}
            type="date"
            value={installedOn}
          />
        </Field>
        <Field label="Vencimiento de garantía" hint="Opcional">
          <input
            className="input"
            min={installedOn || undefined}
            onChange={(event) => setWarrantyExpiresOn(event.target.value)}
            type="date"
            value={warrantyExpiresOn}
          />
        </Field>
      </FormGrid>
      <Field label="Notas" hint="Opcional">
        <textarea
          className="textarea"
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          value={notes}
        />
      </Field>
      <FormActions>
        <Button disabled={saving || !code || !name || !category} type="submit">
          {saving ? 'Guardando…' : 'Crear activo'}
        </Button>
      </FormActions>
    </form>
  );
}

function PlanForm({
  condominiumId,
  session,
  assets,
  vendors,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  assets: MaintenanceAsset[];
  vendors: MaintenanceVendor[];
  onCreated: (plan: MaintenancePlan) => void;
}) {
  const [assetId, setAssetId] = useState(
    assets.find((item) => item.status !== 'retired')?.id ?? '',
  );
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'preventive' | 'inspection'>('preventive');
  const [instructions, setInstructions] = useState('');
  const [frequencyValue, setFrequencyValue] = useState('1');
  const [frequencyUnit, setFrequencyUnit] = useState<'days' | 'weeks' | 'months' | 'years'>(
    'months',
  );
  const [nextDueOn, setNextDueOn] = useState(new Date().toISOString().slice(0, 10));
  const [vendorId, setVendorId] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiRequest<MaintenancePlan>(
        `/v1/condominiums/${condominiumId}/maintenance/plans`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            assetId,
            name,
            kind,
            instructions,
            frequencyValue: Number(frequencyValue),
            frequencyUnit,
            nextDueOn,
            vendorId: vendorId || undefined,
            estimatedDurationMinutes: duration ? Number(duration) : undefined,
          }),
        },
      );
      onCreated(created);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear el plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="maintenance-form" onSubmit={(event) => void submit(event)}>
      {error ? <div className="maintenance-inline-alert">{error}</div> : null}
      <Field label="Activo">
        <Select onChange={(event) => setAssetId(event.target.value)} required value={assetId}>
          <option value="">Selecciona un activo</option>
          {assets
            .filter((asset) => asset.status !== 'retired')
            .map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.code} · {asset.name}
              </option>
            ))}
        </Select>
      </Field>
      <FormGrid>
        <Field label="Nombre del plan">
          <input
            className="input"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </Field>
        <Field label="Tipo">
          <Select onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}>
            <option value="preventive">Preventivo</option>
            <option value="inspection">Inspección</option>
          </Select>
        </Field>
      </FormGrid>
      <Field label="Instrucciones">
        <textarea
          className="textarea"
          onChange={(event) => setInstructions(event.target.value)}
          required
          rows={5}
          value={instructions}
        />
      </Field>
      <FormGrid columns={3}>
        <Field label="Frecuencia">
          <input
            className="input"
            min="1"
            onChange={(event) => setFrequencyValue(event.target.value)}
            required
            type="number"
            value={frequencyValue}
          />
        </Field>
        <Field label="Unidad">
          <Select
            onChange={(event) => setFrequencyUnit(event.target.value as typeof frequencyUnit)}
            value={frequencyUnit}
          >
            <option value="days">Días</option>
            <option value="weeks">Semanas</option>
            <option value="months">Meses</option>
            <option value="years">Años</option>
          </Select>
        </Field>
        <Field label="Próxima fecha">
          <input
            className="input"
            onChange={(event) => setNextDueOn(event.target.value)}
            required
            type="date"
            value={nextDueOn}
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Proveedor predeterminado" hint="Opcional">
          <Select onChange={(event) => setVendorId(event.target.value)} value={vendorId}>
            <option value="">Sin proveedor</option>
            {vendors
              .filter((vendor) => vendor.is_active)
              .map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Duración estimada (min)" hint="Opcional">
          <input
            className="input"
            min="1"
            onChange={(event) => setDuration(event.target.value)}
            type="number"
            value={duration}
          />
        </Field>
      </FormGrid>
      <FormActions>
        <Button disabled={saving || !assetId || !name || !instructions} type="submit">
          {saving ? 'Guardando…' : 'Crear plan'}
        </Button>
      </FormActions>
    </form>
  );
}

function WorkOrderForm({
  condominiumId,
  session,
  assets,
  vendors,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  assets: MaintenanceAsset[];
  vendors: MaintenanceVendor[];
  onCreated: (workOrder: MaintenanceWorkOrder) => void;
}) {
  const [assetId, setAssetId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [kind, setKind] = useState<'corrective' | 'emergency' | 'inspection' | 'preventive'>(
    'corrective',
  );
  const [priority, setPriority] = useState<MaintenancePriority>('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiRequest<MaintenanceWorkOrder>(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            assetId: assetId || undefined,
            vendorId: vendorId || undefined,
            kind,
            priority,
            title,
            description,
            scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
            dueOn: dueOn || undefined,
          }),
        },
      );
      onCreated(created);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear la orden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="maintenance-form" onSubmit={(event) => void submit(event)}>
      {error ? <div className="maintenance-inline-alert">{error}</div> : null}
      <FormGrid>
        <Field label="Activo" hint="Opcional para trabajos generales">
          <Select onChange={(event) => setAssetId(event.target.value)} value={assetId}>
            <option value="">Sin activo específico</option>
            {assets
              .filter((asset) => asset.status !== 'retired')
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.code} · {asset.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Proveedor" hint="Opcional">
          <Select onChange={(event) => setVendorId(event.target.value)} value={vendorId}>
            <option value="">Sin proveedor</option>
            {vendors
              .filter((vendor) => vendor.is_active)
              .map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
          </Select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Tipo">
          <Select onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}>
            <option value="corrective">Correctiva</option>
            <option value="emergency">Emergencia</option>
            <option value="inspection">Inspección</option>
            <option value="preventive">Preventiva</option>
          </Select>
        </Field>
        <Field label="Prioridad">
          <Select
            onChange={(event) => setPriority(event.target.value as MaintenancePriority)}
            value={priority}
          >
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </Select>
        </Field>
      </FormGrid>
      <Field label="Título">
        <input
          className="input"
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </Field>
      <Field label="Descripción">
        <textarea
          className="textarea"
          onChange={(event) => setDescription(event.target.value)}
          required
          rows={5}
          value={description}
        />
      </Field>
      <FormGrid>
        <Field label="Programar para" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setScheduledFor(event.target.value)}
            type="datetime-local"
            value={scheduledFor}
          />
        </Field>
        <Field label="Fecha límite" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setDueOn(event.target.value)}
            type="date"
            value={dueOn}
          />
        </Field>
      </FormGrid>
      <FormActions>
        <Button disabled={saving || !title || !description} type="submit">
          {saving ? 'Guardando…' : 'Crear orden'}
        </Button>
      </FormActions>
    </form>
  );
}

function WorkOrderDetail({
  condominiumId,
  session,
  workOrder,
  asset,
  vendor,
  onChanged,
}: {
  condominiumId: string;
  session: Session;
  workOrder: MaintenanceWorkOrder;
  asset: MaintenanceAsset | undefined;
  vendor: MaintenanceVendor | undefined;
  onChanged: (updated: MaintenanceWorkOrder) => void;
}) {
  const [logs, setLogs] = useState<MaintenanceServiceLog[]>([]);
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState('');
  const [technician, setTechnician] = useState('');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    try {
      setLogs(
        await apiRequest<MaintenanceServiceLog[]>(
          `/v1/condominiums/${condominiumId}/maintenance/work-orders/${workOrder.id}/service-logs`,
          session,
        ),
      );
    } catch {
      setLogs([]);
    }
  }, [condominiumId, session, workOrder.id]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const transition = async (status: Exclude<MaintenanceWorkOrderStatus, 'draft'>) => {
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<MaintenanceWorkOrder>(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${workOrder.id}/transition`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            status,
            note: status === 'completed' || status === 'cancelled' ? note : undefined,
            expectedVersion: workOrder.version,
          }),
        },
      );
      setNote('');
      onChanged(updated);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cambiar el estado.',
      );
    } finally {
      setBusy(false);
    }
  };

  const addLog = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await apiRequest<MaintenanceServiceLog>(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${workOrder.id}/service-logs`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            servicedOn: serviceDate,
            summary,
            technicianName: technician,
            amount: amount ? Number(amount) : undefined,
            currencyCode: amount ? currency : undefined,
          }),
        },
      );
      setLogs((current) => [created, ...current]);
      setSummary('');
      setTechnician('');
      setAmount('');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo registrar el servicio.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="maintenance-detail">
      {error ? <div className="maintenance-inline-alert">{error}</div> : null}
      <div className="maintenance-detail__hero">
        <div>
          <span>{workOrder.work_order_number}</span>
          <h3>{workOrder.title}</h3>
          <p>{workOrder.description}</p>
        </div>
        <Badge tone={workOrderTone(workOrder.status)}>
          {workOrderStatusLabels[workOrder.status]}
        </Badge>
      </div>
      <dl className="maintenance-detail-grid">
        <div>
          <dt>Activo</dt>
          <dd>{asset ? `${asset.code} · ${asset.name}` : 'Trabajo general'}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{workOrderKindLabels[workOrder.kind]}</dd>
        </div>
        <div>
          <dt>Prioridad</dt>
          <dd>{priorityLabels[workOrder.priority]}</dd>
        </div>
        <div>
          <dt>Proveedor</dt>
          <dd>{vendor?.name ?? 'Sin proveedor'}</dd>
        </div>
        <div>
          <dt>Programada</dt>
          <dd>{formatMaintenanceDate(workOrder.scheduled_for, true)}</dd>
        </div>
        <div>
          <dt>Fecha límite</dt>
          <dd>{formatMaintenanceDate(workOrder.due_on)}</dd>
        </div>
      </dl>

      {workOrder.status !== 'completed' && workOrder.status !== 'cancelled' ? (
        <section className="maintenance-detail__section">
          <h3>Actualizar estado</h3>
          {(workOrder.status === 'draft' || workOrder.status === 'scheduled') &&
          !workOrder.scheduled_for &&
          !workOrder.due_on ? (
            <p className="maintenance-detail__hint">
              Esta orden necesita una fecha antes de poder programarse.
            </p>
          ) : null}
          {workOrder.status === 'scheduled' || workOrder.status === 'in_progress' ? (
            <Field label="Nota de cierre o cancelación">
              <textarea
                className="textarea"
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                value={note}
              />
            </Field>
          ) : null}
          <div className="maintenance-detail__actions">
            {workOrder.status === 'draft' ? (
              <Button
                disabled={busy || (!workOrder.scheduled_for && !workOrder.due_on)}
                onClick={() => void transition('scheduled')}
                size="sm"
              >
                Programar
              </Button>
            ) : null}
            {workOrder.status === 'scheduled' ? (
              <Button disabled={busy} onClick={() => void transition('in_progress')} size="sm">
                Iniciar trabajo
              </Button>
            ) : null}
            {workOrder.status === 'scheduled' || workOrder.status === 'in_progress' ? (
              <>
                <Button
                  disabled={busy || note.trim().length < 3}
                  onClick={() => void transition('completed')}
                  size="sm"
                  variant="secondary"
                >
                  Completar
                </Button>
                <Button
                  disabled={busy || note.trim().length < 3}
                  onClick={() => void transition('cancelled')}
                  size="sm"
                  variant="danger"
                >
                  Cancelar
                </Button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {workOrder.status === 'scheduled' ||
      workOrder.status === 'in_progress' ||
      workOrder.status === 'completed' ? (
        <section className="maintenance-detail__section">
          <h3>Registrar servicio</h3>
          <form className="maintenance-form" onSubmit={(event) => void addLog(event)}>
            <FormGrid>
              <Field label="Fecha">
                <input
                  className="input"
                  onChange={(event) => setServiceDate(event.target.value)}
                  required
                  type="date"
                  value={serviceDate}
                />
              </Field>
              <Field label="Técnico">
                <input
                  className="input"
                  onChange={(event) => setTechnician(event.target.value)}
                  required
                  value={technician}
                />
              </Field>
            </FormGrid>
            <Field label="Trabajo realizado">
              <textarea
                className="textarea"
                onChange={(event) => setSummary(event.target.value)}
                required
                rows={3}
                value={summary}
              />
            </Field>
            <FormGrid>
              <Field label="Costo" hint="Opcional">
                <input
                  className="input"
                  min="0"
                  onChange={(event) => setAmount(event.target.value)}
                  step="0.01"
                  type="number"
                  value={amount}
                />
              </Field>
              <Field label="Moneda">
                <Select
                  disabled={!amount}
                  onChange={(event) => setCurrency(event.target.value)}
                  value={currency}
                >
                  <option value="USD">USD</option>
                  <option value="VES">VES</option>
                  <option value="EUR">EUR</option>
                </Select>
              </Field>
            </FormGrid>
            <FormActions>
              <Button disabled={busy || !technician || !summary} size="sm" type="submit">
                Agregar al historial
              </Button>
            </FormActions>
          </form>
        </section>
      ) : null}

      <section className="maintenance-detail__section">
        <h3>Historial de servicio</h3>
        {logs.length ? (
          <div className="maintenance-timeline">
            {logs.map((log) => (
              <article key={log.id}>
                <span className="maintenance-timeline__dot" />
                <div>
                  <strong>{log.summary}</strong>
                  <p>
                    {formatMaintenanceDate(log.serviced_on)} ·{' '}
                    {log.technician_name ?? vendor?.name ?? 'Equipo autorizado'}
                  </p>
                  {log.service_amount != null && log.currency_code ? (
                    <small>
                      {log.currency_code}{' '}
                      {Number(log.service_amount).toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                      })}
                    </small>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="maintenance-detail__hint">Aún no hay servicios registrados.</p>
        )}
      </section>
    </div>
  );
}

export function MaintenancePage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  const [assetStatus, setAssetStatus] = useState<MaintenanceAssetStatus | ''>('');
  const [workOrderQuery, setWorkOrderQuery] = useState('');
  const [workOrderStatus, setWorkOrderStatus] = useState<MaintenanceWorkOrderStatus | ''>('');
  const [workOrderPriority, setWorkOrderPriority] = useState<MaintenancePriority | ''>('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [assets, plans, workOrders, vendors, buildings, units, profileRows] = await Promise.all(
        [
          apiRequest<MaintenanceAsset[]>(
            `/v1/condominiums/${condominiumId}/maintenance/assets`,
            session,
          ),
          apiRequest<MaintenancePlan[]>(
            `/v1/condominiums/${condominiumId}/maintenance/plans`,
            session,
          ),
          apiRequest<MaintenanceWorkOrder[]>(
            `/v1/condominiums/${condominiumId}/maintenance/work-orders`,
            session,
          ),
          apiRequest<MaintenanceVendor[]>(`/v1/condominiums/${condominiumId}/vendors`, session),
          apiRequest<MaintenanceLocation[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
          apiRequest<MaintenanceLocation[]>(`/v1/condominiums/${condominiumId}/units`, session),
          apiRequest<CondominiumProfile[]>(`/v1/condominiums/${condominiumId}`, session).catch(
            () => [],
          ),
        ],
      );
      setData({
        assets,
        plans,
        workOrders,
        vendors,
        buildings,
        units,
        propertyTopology: profileRows[0]?.property_topology ?? 'unspecified',
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar Activos y mantenimiento.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(
    () => getMaintenanceMetrics(data.assets, data.plans, data.workOrders),
    [data.assets, data.plans, data.workOrders],
  );
  const filteredAssets = useMemo(
    () => filterMaintenanceAssets(data.assets, assetQuery, assetStatus),
    [data.assets, assetQuery, assetStatus],
  );
  const filteredWorkOrders = useMemo(
    () =>
      filterMaintenanceWorkOrders(
        data.workOrders,
        workOrderQuery,
        workOrderStatus,
        workOrderPriority,
      ),
    [data.workOrders, workOrderQuery, workOrderStatus, workOrderPriority],
  );
  const selectedWorkOrder = data.workOrders.find((item) => item.id === selectedWorkOrderId);

  const generateDue = async () => {
    setGenerating(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/maintenance/generate-due`, session, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
      setTab('work-orders');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron generar las órdenes pendientes.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const openWorkOrder = (workOrderId: string) => {
    setSelectedWorkOrderId(workOrderId);
    setDrawer('detail');
  };

  if (loading) return <MaintenanceLoading />;

  return (
    <div className="maintenance-page">
      <PageHeader
        description={`${condominiumName} · activos, planes preventivos y órdenes de trabajo con historial técnico.`}
        eyebrow="Operación técnica"
        title="Activos y mantenimiento"
      />

      {error ? (
        <div className="maintenance-page-alert" role="alert">
          <span>{error}</span>
          <Button onClick={() => void load()} size="sm" variant="secondary">
            Reintentar
          </Button>
        </div>
      ) : null}

      <div className="maintenance-tabs" role="tablist" aria-label="Secciones de mantenimiento">
        {[
          ['overview', 'Resumen'],
          ['assets', 'Activos'],
          ['plans', 'Planes'],
          ['work-orders', 'Órdenes de trabajo'],
        ].map(([key, label]) => (
          <button
            aria-selected={tab === key}
            className="maintenance-tab"
            key={key}
            onClick={() => setTab(key as Tab)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="maintenance-overview">
          <div className="maintenance-metrics-grid">
            <MetricCard
              detail={`${metrics.outOfServiceAssets} fuera de servicio`}
              icon={<MaintenanceIcon size={20} />}
              label="Activos operativos"
              tone="green"
              value={metrics.activeAssets}
            />
            <MetricCard
              detail={`${metrics.overduePlans} requieren atención`}
              icon={<CheckCircleIcon size={20} />}
              label="Planes activos"
              tone="blue"
              value={metrics.activePlans}
            />
            <MetricCard
              detail="Borradores, programadas y en curso"
              icon={<RequestsIcon size={20} />}
              label="Órdenes abiertas"
              tone="amber"
              value={metrics.openWorkOrders}
            />
            <MetricCard
              detail="Prioridad urgente sin cerrar"
              icon={<SettingsIcon size={20} />}
              label="Atención inmediata"
              tone="red"
              value={metrics.urgentWorkOrders}
            />
          </div>

          <div className="maintenance-overview-grid">
            <Surface className="maintenance-panel">
              <div className="maintenance-panel__heading">
                <div>
                  <span>Próximos trabajos</span>
                  <h2>Órdenes que requieren seguimiento</h2>
                </div>
                <Button onClick={() => setTab('work-orders')} size="sm" variant="secondary">
                  Ver todas
                </Button>
              </div>
              {data.workOrders.filter((item) => !['completed', 'cancelled'].includes(item.status))
                .length ? (
                <div className="maintenance-focus-list">
                  {data.workOrders
                    .filter((item) => !['completed', 'cancelled'].includes(item.status))
                    .slice(0, 5)
                    .map((workOrder) => (
                      <button
                        key={workOrder.id}
                        onClick={() => openWorkOrder(workOrder.id)}
                        type="button"
                      >
                        <span className="maintenance-focus-list__icon">
                          <RequestsIcon size={18} />
                        </span>
                        <span>
                          <strong>{workOrder.title}</strong>
                          <small>
                            {workOrder.work_order_number} ·{' '}
                            {formatMaintenanceDate(workOrder.due_on)}
                          </small>
                        </span>
                        <Badge tone={workOrderTone(workOrder.status)}>
                          {workOrderStatusLabels[workOrder.status]}
                        </Badge>
                      </button>
                    ))}
                </div>
              ) : (
                <EmptyState
                  description="Las nuevas órdenes manuales o preventivas aparecerán aquí."
                  icon={<CheckCircleIcon size={25} />}
                  title="No hay trabajos abiertos"
                />
              )}
            </Surface>

            <Surface className="maintenance-panel maintenance-panel--actions">
              <div className="maintenance-panel__heading">
                <div>
                  <span>Acciones rápidas</span>
                  <h2>Gestiona la operación</h2>
                </div>
              </div>
              <button onClick={() => setDrawer('asset')} type="button">
                <MaintenanceIcon size={20} />
                <span>
                  <strong>Registrar activo</strong>
                  <small>Equipos, sistemas y áreas comunes</small>
                </span>
              </button>
              <button onClick={() => setDrawer('plan')} type="button">
                <CheckCircleIcon size={20} />
                <span>
                  <strong>Crear plan preventivo</strong>
                  <small>Define frecuencia y próxima fecha</small>
                </span>
              </button>
              <button onClick={() => setDrawer('work-order')} type="button">
                <RequestsIcon size={20} />
                <span>
                  <strong>Abrir orden de trabajo</strong>
                  <small>Correctiva, emergencia o inspección</small>
                </span>
              </button>
              <button disabled={generating} onClick={() => void generateDue()} type="button">
                <SettingsIcon size={20} />
                <span>
                  <strong>{generating ? 'Generando…' : 'Generar mantenimientos vencidos'}</strong>
                  <small>La operación es segura ante reintentos</small>
                </span>
              </button>
            </Surface>
          </div>
        </div>
      ) : null}

      {tab === 'assets' ? (
        <Surface className="maintenance-table-panel">
          <div className="maintenance-table-toolbar">
            <div>
              <span>Inventario técnico</span>
              <h2>Activos y equipos</h2>
              <p>
                {condominiumName} · {data.assets.length} registros
              </p>
            </div>
            <Button onClick={() => setDrawer('asset')}>+ Nuevo activo</Button>
          </div>
          <div className="maintenance-filters">
            <input
              aria-label="Buscar activos"
              className="input"
              onChange={(event) => setAssetQuery(event.target.value)}
              placeholder="Buscar por código, nombre, categoría o serial"
              value={assetQuery}
            />
            <Select
              aria-label="Filtrar activos por estado"
              onChange={(event) =>
                setAssetStatus(event.target.value as MaintenanceAssetStatus | '')
              }
              value={assetStatus}
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="out_of_service">Fuera de servicio</option>
              <option value="retired">Retirados</option>
            </Select>
          </div>
          {filteredAssets.length ? (
            <div className="maintenance-table-wrap">
              <table className="maintenance-table">
                <thead>
                  <tr>
                    <th>Activo</th>
                    <th>Categoría</th>
                    <th>Ubicación</th>
                    <th>Fabricante / modelo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id}>
                      <td>
                        <strong>{asset.name}</strong>
                        <span>
                          {asset.code}
                          {asset.serial_number ? ` · ${asset.serial_number}` : ''}
                        </span>
                      </td>
                      <td>{asset.category}</td>
                      <td>{maintenanceLocationLabel(asset, data.buildings, data.units)}</td>
                      <td>
                        {[asset.manufacturer, asset.model].filter(Boolean).join(' · ') ||
                          'Sin especificar'}
                      </td>
                      <td>
                        <Badge tone={assetTone(asset.status)}>
                          {assetStatusLabels[asset.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              actionLabel="Registrar activo"
              description="Agrega equipos, sistemas y elementos que requieran mantenimiento o inspección."
              icon={<MaintenanceIcon size={26} />}
              onAction={() => setDrawer('asset')}
              title="No encontramos activos"
            />
          )}
        </Surface>
      ) : null}

      {tab === 'plans' ? (
        <Surface className="maintenance-table-panel">
          <div className="maintenance-table-toolbar">
            <div>
              <span>Mantenimiento programado</span>
              <h2>Planes preventivos e inspecciones</h2>
              <p>La próxima fecha avanza automáticamente al generar una orden.</p>
            </div>
            <div className="maintenance-table-toolbar__actions">
              <Button disabled={generating} onClick={() => void generateDue()} variant="secondary">
                {generating ? 'Generando…' : 'Generar vencidos'}
              </Button>
              <Button onClick={() => setDrawer('plan')}>+ Nuevo plan</Button>
            </div>
          </div>
          {data.plans.length ? (
            <div className="maintenance-plan-grid">
              {data.plans.map((plan) => {
                const asset = data.assets.find((item) => item.id === plan.asset_id);
                const overdue =
                  plan.is_active && plan.next_due_on < new Date().toISOString().slice(0, 10);
                return (
                  <article className="maintenance-plan-card" key={plan.id}>
                    <div className="maintenance-plan-card__top">
                      <span className="maintenance-plan-card__icon">
                        <CheckCircleIcon size={20} />
                      </span>
                      <Badge tone={!plan.is_active ? 'neutral' : overdue ? 'warning' : 'success'}>
                        {!plan.is_active ? 'Inactivo' : overdue ? 'Vencido' : 'Al día'}
                      </Badge>
                    </div>
                    <h3>{plan.name}</h3>
                    <p>{asset ? `${asset.code} · ${asset.name}` : 'Activo no disponible'}</p>
                    <dl>
                      <div>
                        <dt>Tipo</dt>
                        <dd>{planKindLabels[plan.kind]}</dd>
                      </div>
                      <div>
                        <dt>Frecuencia</dt>
                        <dd>
                          Cada {plan.frequency_value} {frequencyUnitLabels[plan.frequency_unit]}
                        </dd>
                      </div>
                      <div>
                        <dt>Próxima fecha</dt>
                        <dd>{formatMaintenanceDate(plan.next_due_on)}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              actionLabel="Crear plan"
              description="Programa inspecciones y tareas preventivas asociadas a cada activo."
              icon={<CheckCircleIcon size={26} />}
              onAction={() => setDrawer('plan')}
              title="Aún no hay planes"
            />
          )}
        </Surface>
      ) : null}

      {tab === 'work-orders' ? (
        <Surface className="maintenance-table-panel">
          <div className="maintenance-table-toolbar">
            <div>
              <span>Ejecución y seguimiento</span>
              <h2>Órdenes de trabajo</h2>
              <p>Controla prioridad, estado, proveedor e historial técnico.</p>
            </div>
            <Button onClick={() => setDrawer('work-order')}>+ Nueva orden</Button>
          </div>
          <div className="maintenance-filters maintenance-filters--orders">
            <input
              aria-label="Buscar órdenes de trabajo"
              className="input"
              onChange={(event) => setWorkOrderQuery(event.target.value)}
              placeholder="Buscar por número, título o descripción"
              value={workOrderQuery}
            />
            <Select
              aria-label="Filtrar órdenes por estado"
              onChange={(event) =>
                setWorkOrderStatus(event.target.value as MaintenanceWorkOrderStatus | '')
              }
              value={workOrderStatus}
            >
              <option value="">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="scheduled">Programada</option>
              <option value="in_progress">En curso</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
            </Select>
            <Select
              aria-label="Filtrar órdenes por prioridad"
              onChange={(event) =>
                setWorkOrderPriority(event.target.value as MaintenancePriority | '')
              }
              value={workOrderPriority}
            >
              <option value="">Todas las prioridades</option>
              <option value="low">Baja</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </Select>
          </div>
          {filteredWorkOrders.length ? (
            <div className="maintenance-table-wrap">
              <table className="maintenance-table maintenance-table--interactive">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Activo</th>
                    <th>Tipo</th>
                    <th>Prioridad</th>
                    <th>Fecha límite</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkOrders.map((workOrder) => {
                    const asset = data.assets.find((item) => item.id === workOrder.asset_id);
                    return (
                      <tr key={workOrder.id} onClick={() => openWorkOrder(workOrder.id)}>
                        <td>
                          <strong>{workOrder.title}</strong>
                          <span>{workOrder.work_order_number}</span>
                        </td>
                        <td>{asset ? `${asset.code} · ${asset.name}` : 'Trabajo general'}</td>
                        <td>{workOrderKindLabels[workOrder.kind]}</td>
                        <td>
                          <span className="maintenance-priority" data-priority={workOrder.priority}>
                            {priorityLabels[workOrder.priority]}
                          </span>
                        </td>
                        <td>{formatMaintenanceDate(workOrder.due_on)}</td>
                        <td>
                          <Badge tone={workOrderTone(workOrder.status)}>
                            {workOrderStatusLabels[workOrder.status]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              actionLabel="Crear orden"
              description="Abre una orden correctiva, preventiva, de inspección o emergencia."
              icon={<RequestsIcon size={26} />}
              onAction={() => setDrawer('work-order')}
              title="No encontramos órdenes"
            />
          )}
        </Surface>
      ) : null}

      {drawer === 'asset' ? (
        <DrawerShell
          eyebrow="Inventario técnico"
          onClose={() => setDrawer(null)}
          title="Nuevo activo"
          wide
        >
          <AssetForm
            buildings={data.buildings}
            condominiumId={condominiumId}
            onCreated={(created) => {
              setData((current) => ({ ...current, assets: [created, ...current.assets] }));
              setDrawer(null);
              setTab('assets');
            }}
            propertyTopology={data.propertyTopology}
            session={session}
            units={data.units}
          />
        </DrawerShell>
      ) : null}

      {drawer === 'plan' ? (
        <DrawerShell
          eyebrow="Mantenimiento programado"
          onClose={() => setDrawer(null)}
          title="Nuevo plan preventivo"
          wide
        >
          <PlanForm
            assets={data.assets}
            condominiumId={condominiumId}
            onCreated={(created) => {
              setData((current) => ({ ...current, plans: [created, ...current.plans] }));
              setDrawer(null);
              setTab('plans');
            }}
            session={session}
            vendors={data.vendors}
          />
        </DrawerShell>
      ) : null}

      {drawer === 'work-order' ? (
        <DrawerShell
          eyebrow="Ejecución"
          onClose={() => setDrawer(null)}
          title="Nueva orden de trabajo"
          wide
        >
          <WorkOrderForm
            assets={data.assets}
            condominiumId={condominiumId}
            onCreated={(created) => {
              setData((current) => ({ ...current, workOrders: [created, ...current.workOrders] }));
              setDrawer(null);
              setTab('work-orders');
            }}
            session={session}
            vendors={data.vendors}
          />
        </DrawerShell>
      ) : null}

      {drawer === 'detail' && selectedWorkOrder ? (
        <DrawerShell
          eyebrow="Orden de trabajo"
          onClose={() => setDrawer(null)}
          title={selectedWorkOrder.work_order_number}
          wide
        >
          <WorkOrderDetail
            asset={data.assets.find((item) => item.id === selectedWorkOrder.asset_id)}
            condominiumId={condominiumId}
            onChanged={(updated) => {
              setData((current) => ({
                ...current,
                workOrders: current.workOrders.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }));
            }}
            session={session}
            vendor={data.vendors.find((item) => item.id === selectedWorkOrder.vendor_id)}
            workOrder={selectedWorkOrder}
          />
        </DrawerShell>
      ) : null}
    </div>
  );
}
