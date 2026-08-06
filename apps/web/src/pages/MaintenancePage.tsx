import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CheckCircleIcon,
  MaintenanceIcon,
  PeopleIcon,
  SettingsIcon,
  UnitsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { apiRequest } from '../lib/api';
import {
  assetStatusLabels,
  formatMaintenanceDate,
  frequencyLabels,
  isMaintenanceOverdue,
  maintenanceStats,
  nextWorkOrderStatuses,
  planKindLabels,
  priorityLabels,
  workOrderKindLabels,
  workOrderStatusLabels,
} from '../lib/maintenance';
import type {
  MaintenanceAsset,
  MaintenanceBuilding,
  MaintenanceEvent,
  MaintenancePlan,
  MaintenancePriority,
  MaintenanceServiceLog,
  MaintenanceUnit,
  MaintenanceVendor,
  MaintenanceWorkOrder,
  MaintenanceWorkOrderKind,
  MaintenanceWorkOrderStatus,
} from '../lib/maintenance';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type WorkspaceData = {
  assets: MaintenanceAsset[];
  plans: MaintenancePlan[];
  orders: MaintenanceWorkOrder[];
  vendors: MaintenanceVendor[];
  buildings: MaintenanceBuilding[];
  units: MaintenanceUnit[];
};

type Drawer = 'asset' | 'plan' | 'order' | 'detail' | null;
type View = 'orders' | 'assets' | 'plans';

const today = () => new Date().toISOString().slice(0, 10);

const statusTone = (status: MaintenanceWorkOrderStatus) => {
  if (status === 'completed') return 'success' as const;
  if (status === 'cancelled' || status === 'draft') return 'neutral' as const;
  if (status === 'in_progress') return 'warning' as const;
  return 'info' as const;
};

const priorityTone = (priority: MaintenancePriority) => {
  if (priority === 'urgent' || priority === 'high') return 'warning' as const;
  if (priority === 'low') return 'neutral' as const;
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
    <div className="maintenance-drawer-layer" role="presentation">
      <button
        aria-label="Cerrar panel"
        className="maintenance-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside aria-label={title} className="maintenance-drawer" data-wide={wide || undefined}>
        <header className="maintenance-drawer__header">
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <Button aria-label="Cerrar" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </header>
        <div className="maintenance-drawer__body">{children}</div>
      </aside>
    </div>
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
  tone: 'blue' | 'green' | 'navy' | 'red';
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

function FormMessage({ error, message }: { error: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <div className="maintenance-inline-message" data-tone={error ? 'error' : 'success'}>
      {error || message}
    </div>
  );
}

function CreateAssetDrawer({
  condominiumId,
  session,
  buildings,
  units,
  onClose,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  buildings: MaintenanceBuilding[];
  units: MaintenanceUnit[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locationType, setLocationType] = useState<'none' | 'building' | 'unit'>('building');
  const [locationId, setLocationId] = useState(buildings[0]?.id ?? '');
  const [form, setForm] = useState({
    code: '',
    name: '',
    category: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    installedOn: '',
    warrantyExpiresOn: '',
    locationNotes: '',
    notes: '',
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/maintenance/assets`, session, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          buildingId: locationType === 'building' ? locationId || undefined : undefined,
          unitId: locationType === 'unit' ? locationId || undefined : undefined,
          installedOn: form.installedOn || undefined,
          warrantyExpiresOn: form.warrantyExpiresOn || undefined,
        }),
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear el activo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell eyebrow="Inventario técnico" onClose={onClose} title="Nuevo activo">
      <form className="maintenance-form" onSubmit={(event) => void submit(event)}>
        <div className="maintenance-form__grid">
          <Field label="Código">
            <input
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              placeholder="ASC-01"
              required
              value={form.code}
            />
          </Field>
          <Field label="Nombre">
            <input
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ascensor principal"
              required
              value={form.name}
            />
          </Field>
          <Field label="Categoría">
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
              placeholder="Ascensores"
              required
              value={form.category}
            />
          </Field>
          <Field label="Tipo de ubicación">
            <Select
              onChange={(event) => {
                const next = event.target.value as typeof locationType;
                setLocationType(next);
                setLocationId(
                  next === 'building'
                    ? (buildings[0]?.id ?? '')
                    : next === 'unit'
                      ? (units[0]?.id ?? '')
                      : '',
                );
              }}
              value={locationType}
            >
              <option value="building">Área o edificio</option>
              <option value="unit">Unidad</option>
              <option value="none">Sin ubicación estructural</option>
            </Select>
          </Field>
          {locationType !== 'none' ? (
            <Field label={locationType === 'building' ? 'Edificio' : 'Unidad'}>
              <Select onChange={(event) => setLocationId(event.target.value)} value={locationId}>
                {(locationType === 'building' ? buildings : units).map((item) => (
                  <option key={item.id} value={item.id}>
                    {'name' in item ? item.name : `Unidad ${item.code}`}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Fabricante">
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, manufacturer: event.target.value }))
              }
              placeholder="Otis"
              value={form.manufacturer}
            />
          </Field>
          <Field label="Modelo">
            <input
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              value={form.model}
            />
          </Field>
          <Field label="Serial">
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, serialNumber: event.target.value }))
              }
              value={form.serialNumber}
            />
          </Field>
          <Field label="Instalación">
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, installedOn: event.target.value }))
              }
              type="date"
              value={form.installedOn}
            />
          </Field>
          <Field label="Fin de garantía">
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, warrantyExpiresOn: event.target.value }))
              }
              type="date"
              value={form.warrantyExpiresOn}
            />
          </Field>
        </div>
        <Field label="Detalle de ubicación">
          <input
            onChange={(event) =>
              setForm((current) => ({ ...current, locationNotes: event.target.value }))
            }
            placeholder="Lobby, cuarto de máquinas, azotea…"
            value={form.locationNotes}
          />
        </Field>
        <Field label="Notas">
          <textarea
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            rows={4}
            value={form.notes}
          />
        </Field>
        <FormMessage error={error} />
        <div className="maintenance-form__actions">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Guardando…' : 'Crear activo'}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function CreatePlanDrawer({
  condominiumId,
  session,
  assets,
  vendors,
  onClose,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  assets: MaintenanceAsset[];
  vendors: MaintenanceVendor[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const availableAssets = assets.filter((asset) => asset.status !== 'retired');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    assetId: availableAssets[0]?.id ?? '',
    name: '',
    kind: 'preventive',
    instructions: '',
    frequencyValue: '1',
    frequencyUnit: 'months',
    nextDueOn: today(),
    defaultVendorId: '',
    estimatedDurationMinutes: '60',
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/maintenance/plans`, session, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          frequencyValue: Number(form.frequencyValue),
          estimatedDurationMinutes: form.estimatedDurationMinutes
            ? Number(form.estimatedDurationMinutes)
            : undefined,
          defaultVendorId: form.defaultVendorId || undefined,
        }),
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear el plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell eyebrow="Mantenimiento preventivo" onClose={onClose} title="Nuevo plan">
      <form className="maintenance-form" onSubmit={(event) => void submit(event)}>
        <Field label="Activo">
          <Select
            onChange={(event) => setForm((current) => ({ ...current, assetId: event.target.value }))}
            required
            value={form.assetId}
          >
            {availableAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.code} · {asset.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nombre del plan">
          <input
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Inspección mensual del ascensor"
            required
            value={form.name}
          />
        </Field>
        <div className="maintenance-form__grid">
          <Field label="Tipo">
            <Select
              onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
              value={form.kind}
            >
              <option value="preventive">Preventivo</option>
              <option value="inspection">Inspección</option>
            </Select>
          </Field>
          <Field label="Próxima fecha">
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, nextDueOn: event.target.value }))
              }
              required
              type="date"
              value={form.nextDueOn}
            />
          </Field>
          <Field label="Frecuencia">
            <input
              min="1"
              onChange={(event) =>
                setForm((current) => ({ ...current, frequencyValue: event.target.value }))
              }
              required
              type="number"
              value={form.frequencyValue}
            />
          </Field>
          <Field label="Unidad">
            <Select
              onChange={(event) =>
                setForm((current) => ({ ...current, frequencyUnit: event.target.value }))
              }
              value={form.frequencyUnit}
            >
              <option value="days">Días</option>
              <option value="weeks">Semanas</option>
              <option value="months">Meses</option>
              <option value="years">Años</option>
            </Select>
          </Field>
          <Field label="Proveedor por defecto">
            <Select
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultVendorId: event.target.value }))
              }
              value={form.defaultVendorId}
            >
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
          <Field label="Duración estimada (min)">
            <input
              min="1"
              onChange={(event) =>
                setForm((current) => ({ ...current, estimatedDurationMinutes: event.target.value }))
              }
              type="number"
              value={form.estimatedDurationMinutes}
            />
          </Field>
        </div>
        <Field label="Instrucciones">
          <textarea
            onChange={(event) =>
              setForm((current) => ({ ...current, instructions: event.target.value }))
            }
            placeholder="Describe las verificaciones y tareas necesarias."
            required
            rows={6}
            value={form.instructions}
          />
        </Field>
        <FormMessage error={error} />
        <div className="maintenance-form__actions">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving || !availableAssets.length} type="submit">
            {saving ? 'Guardando…' : 'Crear plan'}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function CreateOrderDrawer({
  condominiumId,
  session,
  assets,
  vendors,
  onClose,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  assets: MaintenanceAsset[];
  vendors: MaintenanceVendor[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    assetId: '',
    vendorId: '',
    kind: 'corrective' as MaintenanceWorkOrderKind,
    priority: 'normal' as MaintenancePriority,
    title: '',
    description: '',
    scheduledFor: '',
    dueOn: '',
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/maintenance/work-orders`, session, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          assetId: form.assetId || undefined,
          vendorId: form.vendorId || undefined,
          scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : undefined,
          dueOn: form.dueOn || undefined,
        }),
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear la orden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell eyebrow="Trabajo operativo" onClose={onClose} title="Nueva orden">
      <form className="maintenance-form" onSubmit={(event) => void submit(event)}>
        <div className="maintenance-form__grid">
          <Field label="Tipo">
            <Select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  kind: event.target.value as MaintenanceWorkOrderKind,
                }))
              }
              value={form.kind}
            >
              <option value="corrective">Correctiva</option>
              <option value="emergency">Emergencia</option>
              <option value="preventive">Preventiva</option>
              <option value="inspection">Inspección</option>
            </Select>
          </Field>
          <Field label="Prioridad">
            <Select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: event.target.value as MaintenancePriority,
                }))
              }
              value={form.priority}
            >
              <option value="low">Baja</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </Select>
          </Field>
          <Field label="Activo">
            <Select
              onChange={(event) => setForm((current) => ({ ...current, assetId: event.target.value }))}
              value={form.assetId}
            >
              <option value="">Área común / sin activo</option>
              {assets
                .filter((asset) => asset.status !== 'retired')
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.code} · {asset.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Proveedor">
            <Select
              onChange={(event) => setForm((current) => ({ ...current, vendorId: event.target.value }))}
              value={form.vendorId}
            >
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
          <Field label="Programada para">
            <input
              onChange={(event) =>
                setForm((current) => ({ ...current, scheduledFor: event.target.value }))
              }
              type="datetime-local"
              value={form.scheduledFor}
            />
          </Field>
          <Field label="Fecha límite">
            <input
              onChange={(event) => setForm((current) => ({ ...current, dueOn: event.target.value }))}
              type="date"
              value={form.dueOn}
            />
          </Field>
        </div>
        <Field label="Título">
          <input
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Corregir ruido en puerta del ascensor"
            required
            value={form.title}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            required
            rows={6}
            value={form.description}
          />
        </Field>
        <FormMessage error={error} />
        <div className="maintenance-form__actions">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Guardando…' : 'Crear orden'}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function OrderDetailDrawer({
  condominiumId,
  session,
  order,
  assets,
  vendors,
  onClose,
  onChanged,
}: {
  condominiumId: string;
  session: Session;
  order: MaintenanceWorkOrder;
  assets: MaintenanceAsset[];
  vendors: MaintenanceVendor[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [logs, setLogs] = useState<MaintenanceServiceLog[]>([]);
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [logForm, setLogForm] = useState({
    servicedOn: today(),
    summary: '',
    vendorId: order.vendor_id ?? '',
    technicianName: '',
    durationMinutes: '',
    serviceAmount: '',
    currencyCode: 'USD',
    reference: '',
  });

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const base = `/v1/condominiums/${condominiumId}/maintenance/work-orders/${order.id}`;
    try {
      const [nextLogs, nextEvents] = await Promise.all([
        apiRequest<MaintenanceServiceLog[]>(`${base}/service-logs`, session),
        apiRequest<MaintenanceEvent[]>(`${base}/events`, session),
      ]);
      setLogs(nextLogs);
      setEvents(nextEvents);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cargar el historial.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, order.id, session]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const transition = async (status: MaintenanceWorkOrderStatus) => {
    if ((status === 'completed' || status === 'cancelled') && transitionNote.trim().length < 3) {
      setError('Indica el resultado o motivo antes de cerrar la orden.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${order.id}/transition`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            status,
            note: transitionNote.trim() || undefined,
            expectedVersion: order.version,
          }),
        },
      );
      setMessage(`Orden marcada como ${workOrderStatusLabels[status].toLocaleLowerCase('es')}.`);
      setTransitionNote('');
      await onChanged();
      if (status === 'completed' || status === 'cancelled') onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar la orden.');
    } finally {
      setSaving(false);
    }
  };

  const addLog = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${order.id}/service-logs`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            servicedOn: logForm.servicedOn,
            summary: logForm.summary,
            vendorId: logForm.vendorId || undefined,
            technicianName: logForm.technicianName || undefined,
            durationMinutes: logForm.durationMinutes ? Number(logForm.durationMinutes) : undefined,
            serviceAmount: logForm.serviceAmount ? Number(logForm.serviceAmount) : undefined,
            currencyCode: logForm.serviceAmount ? logForm.currencyCode : undefined,
            reference: logForm.reference || undefined,
          }),
        },
      );
      setLogForm((current) => ({
        ...current,
        summary: '',
        technicianName: '',
        durationMinutes: '',
        serviceAmount: '',
        reference: '',
      }));
      setMessage('Servicio agregado al historial técnico.');
      await loadDetail();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo registrar el servicio.');
    } finally {
      setSaving(false);
    }
  };

  const asset = assets.find((item) => item.id === order.asset_id);
  const vendor = vendors.find((item) => item.id === order.vendor_id);
  const allowed = nextWorkOrderStatuses(order.status);

  return (
    <DrawerShell eyebrow={order.work_order_number} onClose={onClose} title={order.title} wide>
      <div className="maintenance-detail-summary">
        <div className="maintenance-detail-summary__badges">
          <Badge tone={statusTone(order.status)}>{workOrderStatusLabels[order.status]}</Badge>
          <Badge tone={priorityTone(order.priority)}>{priorityLabels[order.priority]}</Badge>
          {isMaintenanceOverdue(order) ? <Badge tone="warning">Vencida</Badge> : null}
        </div>
        <p>{order.description}</p>
        <div className="maintenance-detail-summary__meta">
          <span>
            <MaintenanceIcon size={16} />
            {workOrderKindLabels[order.kind]}
          </span>
          <span>
            <SettingsIcon size={16} />
            {asset ? `${asset.code} · ${asset.name}` : 'Área común'}
          </span>
          <span>
            <PeopleIcon size={16} />
            {vendor?.name ?? 'Sin proveedor'}
          </span>
          <span>
            <CheckCircleIcon size={16} />
            {formatMaintenanceDate(order.due_on)}
          </span>
        </div>
      </div>

      {allowed.length ? (
        <Surface className="maintenance-transition-panel">
          <div className="maintenance-section-heading">
            <span>Avanzar orden</span>
            <p>Los cambios quedan registrados en el historial inmutable.</p>
          </div>
          <textarea
            onChange={(event) => setTransitionNote(event.target.value)}
            placeholder="Resultado, observación o motivo de cierre"
            rows={3}
            value={transitionNote}
          />
          <div className="maintenance-transition-panel__actions">
            {allowed.map((status) => (
              <Button
                disabled={saving}
                key={status}
                onClick={() => void transition(status)}
                size="sm"
                variant={status === 'cancelled' ? 'danger' : 'secondary'}
              >
                {workOrderStatusLabels[status]}
              </Button>
            ))}
          </div>
        </Surface>
      ) : null}

      <FormMessage error={error} message={message} />

      <div className="maintenance-detail-grid">
        <section>
          <div className="maintenance-section-heading">
            <span>Historial técnico</span>
            <p>Servicios realizados, proveedores, referencias y costos por moneda.</p>
          </div>
          {loading ? (
            <Skeleton className="maintenance-detail-skeleton" />
          ) : logs.length ? (
            <div className="maintenance-timeline">
              {logs.map((log) => {
                const logVendor = vendors.find((item) => item.id === log.vendor_id);
                return (
                  <article key={log.id}>
                    <span />
                    <div>
                      <header>
                        <strong>{formatMaintenanceDate(log.serviced_on)}</strong>
                        {log.service_amount !== null && log.currency_code ? (
                          <Badge tone="info">
                            {log.currency_code} {Number(log.service_amount).toLocaleString('es')}
                          </Badge>
                        ) : null}
                      </header>
                      <p>{log.summary}</p>
                      <small>
                        {logVendor?.name ?? log.technician_name ?? 'Equipo interno'}
                        {log.duration_minutes ? ` · ${log.duration_minutes} min` : ''}
                        {log.reference ? ` · ${log.reference}` : ''}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="maintenance-detail-empty">Todavía no hay servicios registrados.</div>
          )}

          <div className="maintenance-section-heading maintenance-section-heading--events">
            <span>Eventos de la orden</span>
            <p>{events.length} movimientos auditados.</p>
          </div>
          <div className="maintenance-event-list">
            {events.map((event) => (
              <div key={event.id}>
                <span>{event.event_type.replaceAll('_', ' ')}</span>
                <time>{formatMaintenanceDate(event.occurred_at, true)}</time>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <form className="maintenance-service-form" onSubmit={(event) => void addLog(event)}>
            <div className="maintenance-section-heading">
              <span>Registrar servicio</span>
              <p>Agrega la intervención sin convertirla automáticamente en gasto.</p>
            </div>
            <Field label="Fecha">
              <input
                onChange={(event) =>
                  setLogForm((current) => ({ ...current, servicedOn: event.target.value }))
                }
                required
                type="date"
                value={logForm.servicedOn}
              />
            </Field>
            <Field label="Proveedor">
              <Select
                onChange={(event) =>
                  setLogForm((current) => ({ ...current, vendorId: event.target.value }))
                }
                value={logForm.vendorId}
              >
                <option value="">Técnico independiente / equipo interno</option>
                {vendors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!logForm.vendorId ? (
              <Field label="Técnico">
                <input
                  onChange={(event) =>
                    setLogForm((current) => ({ ...current, technicianName: event.target.value }))
                  }
                  placeholder="Nombre del técnico"
                  required
                  value={logForm.technicianName}
                />
              </Field>
            ) : null}
            <Field label="Trabajo realizado">
              <textarea
                onChange={(event) =>
                  setLogForm((current) => ({ ...current, summary: event.target.value }))
                }
                required
                rows={5}
                value={logForm.summary}
              />
            </Field>
            <div className="maintenance-form__grid">
              <Field label="Duración (min)">
                <input
                  min="1"
                  onChange={(event) =>
                    setLogForm((current) => ({ ...current, durationMinutes: event.target.value }))
                  }
                  type="number"
                  value={logForm.durationMinutes}
                />
              </Field>
              <Field label="Referencia">
                <input
                  onChange={(event) =>
                    setLogForm((current) => ({ ...current, reference: event.target.value }))
                  }
                  value={logForm.reference}
                />
              </Field>
              <Field label="Costo">
                <input
                  min="0"
                  onChange={(event) =>
                    setLogForm((current) => ({ ...current, serviceAmount: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={logForm.serviceAmount}
                />
              </Field>
              <Field label="Moneda">
                <Select
                  disabled={!logForm.serviceAmount}
                  onChange={(event) =>
                    setLogForm((current) => ({ ...current, currencyCode: event.target.value }))
                  }
                  value={logForm.currencyCode}
                >
                  <option value="USD">USD</option>
                  <option value="VES">VES</option>
                  <option value="EUR">EUR</option>
                </Select>
              </Field>
            </div>
            <Button disabled={saving} type="submit">
              {saving ? 'Guardando…' : 'Agregar al historial'}
            </Button>
          </form>
        </aside>
      </div>
    </DrawerShell>
  );
}

function OrdersView({
  orders,
  assets,
  onOpen,
  onCreate,
}: {
  orders: MaintenanceWorkOrder[];
  assets: MaintenanceAsset[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return orders.filter((order) => {
      const asset = assets.find((item) => item.id === order.asset_id);
      return (
        (!status || order.status === status) &&
        (!normalized ||
          [order.work_order_number, order.title, order.description, asset?.name, asset?.code]
            .filter(Boolean)
            .some((value) => value?.toLocaleLowerCase('es').includes(normalized)))
      );
    });
  }, [assets, orders, query, status]);

  return (
    <Surface className="maintenance-workspace">
      <div className="maintenance-toolbar">
        <label className="maintenance-search">
          <MaintenanceIcon size={18} />
          <input
            aria-label="Buscar órdenes"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar número, trabajo o activo"
            value={query}
          />
        </label>
        <Select aria-label="Estado" onChange={(event) => setStatus(event.target.value)} value={status}>
          <option value="">Todos los estados</option>
          {Object.entries(workOrderStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {!filtered.length ? (
        <EmptyState
          actionLabel="Nueva orden"
          description="Ajusta los filtros o registra el próximo trabajo operativo."
          icon={<MaintenanceIcon size={28} />}
          onAction={onCreate}
          title="No encontramos órdenes"
        />
      ) : (
        <div className="maintenance-order-list">
          <div className="maintenance-order-list__head">
            <span>Orden</span>
            <span>Activo</span>
            <span>Estado</span>
            <span>Fecha límite</span>
          </div>
          {filtered.map((order) => {
            const asset = assets.find((item) => item.id === order.asset_id);
            return (
              <button key={order.id} onClick={() => onOpen(order.id)} type="button">
                <span>
                  <small>{order.work_order_number}</small>
                  <strong>{order.title}</strong>
                  <em>{workOrderKindLabels[order.kind]}</em>
                </span>
                <span>{asset ? `${asset.code} · ${asset.name}` : 'Área común'}</span>
                <span>
                  <Badge tone={statusTone(order.status)}>{workOrderStatusLabels[order.status]}</Badge>
                  <Badge tone={priorityTone(order.priority)}>{priorityLabels[order.priority]}</Badge>
                </span>
                <span data-overdue={isMaintenanceOverdue(order) || undefined}>
                  {formatMaintenanceDate(order.due_on)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Surface>
  );
}

function AssetsView({
  assets,
  buildings,
  units,
  plans,
  onCreate,
}: {
  assets: MaintenanceAsset[];
  buildings: MaintenanceBuilding[];
  units: MaintenanceUnit[];
  plans: MaintenancePlan[];
  onCreate: () => void;
}) {
  return (
    <Surface className="maintenance-workspace">
      {!assets.length ? (
        <EmptyState
          actionLabel="Registrar activo"
          description="Comienza con ascensores, bombas, portones, plantas, cámaras o cualquier equipo común."
          icon={<UnitsIcon size={28} />}
          onAction={onCreate}
          title="Inventario vacío"
        />
      ) : (
        <div className="maintenance-asset-grid">
          {assets.map((asset) => {
            const building = buildings.find((item) => item.id === asset.building_id);
            const unit = units.find((item) => item.id === asset.unit_id);
            const activePlans = plans.filter((plan) => plan.asset_id === asset.id && plan.is_active).length;
            return (
              <article key={asset.id}>
                <header>
                  <span>{asset.code}</span>
                  <Badge tone={asset.status === 'active' ? 'success' : 'neutral'}>
                    {assetStatusLabels[asset.status]}
                  </Badge>
                </header>
                <div>
                  <MaintenanceIcon size={23} />
                  <h3>{asset.name}</h3>
                  <p>{asset.category}</p>
                </div>
                <dl>
                  <div>
                    <dt>Ubicación</dt>
                    <dd>
                      {building?.name ?? (unit ? `Unidad ${unit.code}` : asset.location_notes ?? 'Sin definir')}
                    </dd>
                  </div>
                  <div>
                    <dt>Fabricante</dt>
                    <dd>{[asset.manufacturer, asset.model].filter(Boolean).join(' · ') || 'Sin datos'}</dd>
                  </div>
                  <div>
                    <dt>Planes activos</dt>
                    <dd>{activePlans}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </Surface>
  );
}

function PlansView({
  plans,
  assets,
  vendors,
  onCreate,
}: {
  plans: MaintenancePlan[];
  assets: MaintenanceAsset[];
  vendors: MaintenanceVendor[];
  onCreate: () => void;
}) {
  return (
    <Surface className="maintenance-workspace">
      {!plans.length ? (
        <EmptyState
          actionLabel="Crear plan"
          description="Programa inspecciones o trabajos preventivos y Habitta generará las órdenes vencidas sin duplicarlas."
          icon={<CheckCircleIcon size={28} />}
          onAction={onCreate}
          title="No hay planes recurrentes"
        />
      ) : (
        <div className="maintenance-plan-list">
          {plans.map((plan) => {
            const asset = assets.find((item) => item.id === plan.asset_id);
            const vendor = vendors.find((item) => item.id === plan.default_vendor_id);
            const overdue = plan.is_active && plan.next_due_on < today();
            return (
              <article key={plan.id}>
                <div className="maintenance-plan-list__date" data-overdue={overdue || undefined}>
                  <small>Próxima fecha</small>
                  <strong>{formatMaintenanceDate(plan.next_due_on)}</strong>
                </div>
                <div className="maintenance-plan-list__copy">
                  <span>{planKindLabels[plan.kind]}</span>
                  <h3>{plan.name}</h3>
                  <p>{asset ? `${asset.code} · ${asset.name}` : 'Activo no disponible'}</p>
                </div>
                <div className="maintenance-plan-list__meta">
                  <span>
                    Cada {plan.frequency_value} {frequencyLabels[plan.frequency_unit]}
                  </span>
                  <span>{vendor?.name ?? 'Sin proveedor fijo'}</span>
                </div>
                <Badge tone={plan.is_active ? 'success' : 'neutral'}>
                  {plan.is_active ? 'Activo' : 'Pausado'}
                </Badge>
              </article>
            );
          })}
        </div>
      )}
    </Surface>
  );
}

function MaintenanceLoading() {
  return (
    <div aria-label="Cargando mantenimiento" className="maintenance-page">
      <div className="maintenance-overview">
        <Skeleton className="skeleton--title" />
        <Skeleton className="skeleton--badge" />
      </div>
      <div className="maintenance-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="maintenance-workspace-skeleton" />
    </div>
  );
}

export function MaintenancePage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState<View>('orders');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarning('');
    const base = `/v1/condominiums/${condominiumId}`;
    const [assets, plans, orders, vendors, buildings, units] = await Promise.allSettled([
      apiRequest<MaintenanceAsset[]>(`${base}/maintenance/assets`, session),
      apiRequest<MaintenancePlan[]>(`${base}/maintenance/plans`, session),
      apiRequest<MaintenanceWorkOrder[]>(`${base}/maintenance/work-orders`, session),
      apiRequest<MaintenanceVendor[]>(`${base}/vendors`, session),
      apiRequest<MaintenanceBuilding[]>(`${base}/buildings`, session),
      apiRequest<MaintenanceUnit[]>(`${base}/units`, session),
    ]);

    if (assets.status === 'rejected' || plans.status === 'rejected' || orders.status === 'rejected') {
      const reason =
        assets.status === 'rejected'
          ? assets.reason
          : plans.status === 'rejected'
            ? plans.reason
            : orders.status === 'rejected'
              ? orders.reason
              : null;
      setError(
        reason instanceof Error ? reason.message : 'No se pudo cargar el espacio de mantenimiento.',
      );
      setLoading(false);
      return;
    }

    const degraded = [
      vendors.status === 'rejected' ? 'proveedores' : '',
      buildings.status === 'rejected' ? 'edificios' : '',
      units.status === 'rejected' ? 'unidades' : '',
    ].filter(Boolean);

    setData({
      assets: assets.value,
      plans: plans.value,
      orders: orders.value,
      vendors: vendors.status === 'fulfilled' ? vendors.value : [],
      buildings: buildings.status === 'fulfilled' ? buildings.value : [],
      units: units.status === 'fulfilled' ? units.value : [],
    });
    if (degraded.length) setWarning(`No se pudieron actualizar: ${degraded.join(', ')}.`);
    setLoading(false);
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setView('orders');
    setDrawer(null);
    setSelectedId('');
    setMessage('');
  }, [condominiumId]);

  const generate = async () => {
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const generated = await apiRequest<number>(
        `/v1/condominiums/${condominiumId}/maintenance/generate`,
        session,
        { method: 'POST', body: JSON.stringify({ throughDate: today() }) },
      );
      setMessage(
        generated
          ? `${generated} ${generated === 1 ? 'orden generada' : 'órdenes generadas'} correctamente.`
          : 'No había mantenimientos vencidos por generar.',
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron generar órdenes.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading && !data) return <MaintenanceLoading />;
  if (!data) {
    return (
      <Surface className="maintenance-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir este módulo.'}
          icon={<MaintenanceIcon size={28} />}
          onAction={() => void load()}
          title="Mantenimiento no disponible"
        />
      </Surface>
    );
  }

  const stats = maintenanceStats(data.assets, data.plans, data.orders);
  const selectedOrder = data.orders.find((order) => order.id === selectedId);

  const openOrder = (id: string) => {
    setSelectedId(id);
    setDrawer('detail');
  };

  return (
    <div className="maintenance-page">
      <header className="maintenance-overview">
        <div>
          <span className="maintenance-kicker">Activos y operación técnica</span>
          <h2>Mantenimiento</h2>
          <p>
            {condominiumName} · inventario, planes preventivos, órdenes de trabajo e historial técnico.
          </p>
        </div>
        <div className="maintenance-overview__actions">
          <Button disabled={generating} onClick={() => void generate()} size="sm" variant="secondary">
            <CheckCircleIcon size={17} />
            {generating ? 'Generando…' : 'Generar vencidas'}
          </Button>
          <Button onClick={() => setDrawer('order')} size="sm">
            <MaintenanceIcon size={17} />
            Nueva orden
          </Button>
        </div>
      </header>

      <FormMessage error={error} message={message} />
      {warning ? (
        <div className="maintenance-inline-message" data-tone="warning">
          {warning}
        </div>
      ) : null}

      <div className="maintenance-metrics-grid">
        <MetricCard
          detail="Equipos disponibles"
          icon={<UnitsIcon size={20} />}
          label="Activos"
          tone="blue"
          value={stats.activeAssets}
        />
        <MetricCard
          detail="Requieren seguimiento"
          icon={<MaintenanceIcon size={20} />}
          label="Órdenes abiertas"
          tone="navy"
          value={stats.openOrders}
        />
        <MetricCard
          detail="Superaron su fecha límite"
          icon={<CheckCircleIcon size={20} />}
          label="Vencidas"
          tone="red"
          value={stats.overdueOrders}
        />
        <MetricCard
          detail="Rutinas activas"
          icon={<SettingsIcon size={20} />}
          label="Planes preventivos"
          tone="green"
          value={stats.activePlans}
        />
      </div>

      <div className="maintenance-view-bar">
        <div className="maintenance-view-tabs" role="tablist">
          <button data-active={view === 'orders' || undefined} onClick={() => setView('orders')} type="button">
            Órdenes <span>{data.orders.length}</span>
          </button>
          <button data-active={view === 'assets' || undefined} onClick={() => setView('assets')} type="button">
            Activos <span>{data.assets.length}</span>
          </button>
          <button data-active={view === 'plans' || undefined} onClick={() => setView('plans')} type="button">
            Planes <span>{data.plans.length}</span>
          </button>
        </div>
        <div>
          {view === 'assets' ? (
            <Button onClick={() => setDrawer('asset')} size="sm" variant="secondary">
              <UnitsIcon size={16} />
              Nuevo activo
            </Button>
          ) : null}
          {view === 'plans' ? (
            <Button onClick={() => setDrawer('plan')} size="sm" variant="secondary">
              <SettingsIcon size={16} />
              Nuevo plan
            </Button>
          ) : null}
        </div>
      </div>

      {view === 'orders' ? (
        <OrdersView
          assets={data.assets}
          onCreate={() => setDrawer('order')}
          onOpen={openOrder}
          orders={data.orders}
        />
      ) : view === 'assets' ? (
        <AssetsView
          assets={data.assets}
          buildings={data.buildings}
          onCreate={() => setDrawer('asset')}
          plans={data.plans}
          units={data.units}
        />
      ) : (
        <PlansView
          assets={data.assets}
          onCreate={() => setDrawer('plan')}
          plans={data.plans}
          vendors={data.vendors}
        />
      )}

      {drawer === 'asset' ? (
        <CreateAssetDrawer
          buildings={data.buildings}
          condominiumId={condominiumId}
          onClose={() => setDrawer(null)}
          onCreated={load}
          session={session}
          units={data.units}
        />
      ) : null}
      {drawer === 'plan' ? (
        <CreatePlanDrawer
          assets={data.assets}
          condominiumId={condominiumId}
          onClose={() => setDrawer(null)}
          onCreated={load}
          session={session}
          vendors={data.vendors}
        />
      ) : null}
      {drawer === 'order' ? (
        <CreateOrderDrawer
          assets={data.assets}
          condominiumId={condominiumId}
          onClose={() => setDrawer(null)}
          onCreated={load}
          session={session}
          vendors={data.vendors}
        />
      ) : null}
      {drawer === 'detail' && selectedOrder ? (
        <OrderDetailDrawer
          assets={data.assets}
          condominiumId={condominiumId}
          onChanged={load}
          onClose={() => setDrawer(null)}
          order={selectedOrder}
          session={session}
          vendors={data.vendors}
        />
      ) : null}
    </div>
  );
}
