import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

type MaintenanceRouter = Hono<AppEnvironment>;

const uuid = z.string().uuid();
const optionalUuid = uuid.optional();
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const optionalDate = z.string().date().optional();
const optionalDateTime = z.string().datetime({ offset: true }).optional();
const maintenanceStatus = z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']);

const assetSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/),
    name: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(80),
    buildingId: optionalUuid,
    unitId: optionalUuid,
    manufacturer: optionalText(120),
    model: optionalText(120),
    serialNumber: optionalText(160),
    installedOn: optionalDate,
    warrantyExpiresOn: optionalDate,
    locationNotes: optionalText(500),
    notes: optionalText(2000),
  })
  .superRefine((value, context) => {
    if (value.buildingId && value.unitId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitId'],
        message: 'Asset location must use a building or unit, not both',
      });
    }
    if (
      value.installedOn &&
      value.warrantyExpiresOn &&
      value.warrantyExpiresOn < value.installedOn
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['warrantyExpiresOn'],
        message: 'Warranty must not precede installation',
      });
    }
  });

const planSchema = z.object({
  assetId: uuid,
  name: z.string().trim().min(2).max(160),
  kind: z.enum(['preventive', 'inspection']),
  instructions: z.string().trim().min(3).max(5000),
  frequencyValue: z.number().int().min(1).max(365),
  frequencyUnit: z.enum(['days', 'weeks', 'months', 'years']),
  nextDueOn: z.string().date(),
  defaultVendorId: optionalUuid,
  assignedToUserId: optionalUuid,
  estimatedDurationMinutes: z.number().int().min(1).max(10080).optional(),
});

const workOrderSchema = z
  .object({
    assetId: optionalUuid,
    requestId: optionalUuid,
    vendorId: optionalUuid,
    assignedToUserId: optionalUuid,
    kind: z.enum(['preventive', 'corrective', 'inspection', 'emergency']),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(3).max(5000),
    scheduledFor: optionalDateTime,
    dueOn: optionalDate,
  })
  .refine(
    (value) =>
      !value.scheduledFor || !value.dueOn || value.dueOn >= value.scheduledFor.slice(0, 10),
    { path: ['dueOn'], message: 'Due date must not precede the schedule' },
  );

const transitionSchema = z.object({
  status: maintenanceStatus,
  note: z.string().trim().min(3).max(4000).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const serviceLogSchema = z
  .object({
    servicedOn: z.string().date(),
    summary: z.string().trim().min(3).max(5000),
    vendorId: optionalUuid,
    performedByUserId: optionalUuid,
    technicianName: z.string().trim().min(2).max(160).optional(),
    durationMinutes: z.number().int().min(1).max(10080).optional(),
    serviceAmount: z.number().nonnegative().optional(),
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    reference: optionalText(160),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (!value.vendorId && !value.performedByUserId && !value.technicianName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['technicianName'],
        message: 'A service performer is required',
      });
    }
    if ((value.serviceAmount === undefined) !== (value.currencyCode === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencyCode'],
        message: 'Amount and currency must be provided together',
      });
    }
  });

const generateSchema = z.object({ throughDate: z.string().date().optional() });

const body = async <T>(c: AppContext, schema: z.ZodType<T>) => {
  const parsed = schema.safeParse(await c.req.json());
  return parsed.success ? parsed.data : c.json({ error: parsed.error.flatten() }, 400);
};

const rest = (c: AppContext, path: string, init: RequestInit = {}) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const rpc = (c: AppContext, name: string, payload: unknown) =>
  rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });

const responseJson = async (c: AppContext, response: Response, successStatus: 200 | 201 = 200) => {
  const value = (await response.json()) as { code?: string; message?: string };
  if (response.ok) return c.json(value, successStatus);
  const status: 400 | 403 | 404 | 409 =
    response.status === 401 || response.status === 403 || value.code === '42501'
      ? 403
      : value.code === '23505'
        ? 409
        : response.status === 404
          ? 404
          : 400;
  return c.json(
    {
      error:
        status === 403
          ? 'Forbidden'
          : status === 404
            ? 'Not found'
            : status === 409
              ? 'Request conflict'
              : (value.message ?? 'Invalid maintenance request'),
    },
    status,
  );
};

export function registerMaintenanceRoutes(routes: MaintenanceRouter) {
  routes.get('/:id/maintenance/assets', async (c) => {
    const condominiumId = uuid.parse(c.req.param('id'));
    const response = await rest(
      c,
      `maintenance_assets?condominium_id=eq.${condominiumId}&select=*&order=category.asc,name.asc`,
    );
    return c.json(await response.json(), response.ok ? 200 : 403);
  });

  routes.post('/:id/maintenance/assets', async (c) => {
    const parsed = await body(c, assetSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'create_maintenance_asset', {
      target_condominium: uuid.parse(c.req.param('id')),
      asset_code: parsed.code,
      asset_name: parsed.name,
      asset_category: parsed.category,
      target_building: parsed.buildingId ?? null,
      target_unit: parsed.unitId ?? null,
      manufacturer_value: parsed.manufacturer ?? null,
      model_value: parsed.model ?? null,
      serial_value: parsed.serialNumber ?? null,
      installed_date: parsed.installedOn ?? null,
      warranty_date: parsed.warrantyExpiresOn ?? null,
      location_value: parsed.locationNotes ?? null,
      notes_value: parsed.notes ?? null,
    });
    return responseJson(c, response, 201);
  });

  routes.get('/:id/maintenance/plans', async (c) => {
    const condominiumId = uuid.parse(c.req.param('id'));
    const response = await rest(
      c,
      `maintenance_plans?condominium_id=eq.${condominiumId}&select=*&order=is_active.desc,next_due_on.asc,name.asc`,
    );
    return c.json(await response.json(), response.ok ? 200 : 403);
  });

  routes.post('/:id/maintenance/plans', async (c) => {
    const parsed = await body(c, planSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'create_maintenance_plan', {
      target_condominium: uuid.parse(c.req.param('id')),
      target_asset: parsed.assetId,
      plan_name: parsed.name,
      plan_kind: parsed.kind,
      plan_instructions: parsed.instructions,
      recurrence_value: parsed.frequencyValue,
      recurrence_unit: parsed.frequencyUnit,
      first_due_on: parsed.nextDueOn,
      target_vendor: parsed.defaultVendorId ?? null,
      target_assignee: parsed.assignedToUserId ?? null,
      duration_minutes: parsed.estimatedDurationMinutes ?? null,
    });
    return responseJson(c, response, 201);
  });

  routes.get('/:id/maintenance/work-orders', async (c) => {
    const condominiumId = uuid.parse(c.req.param('id'));
    const statusValue = c.req.query('status');
    const status = statusValue ? maintenanceStatus.parse(statusValue) : '';
    const filters = [
      `condominium_id=eq.${condominiumId}`,
      status ? `status=eq.${status}` : '',
    ].filter(Boolean);
    const response = await rest(
      c,
      `maintenance_work_orders?${filters.join('&')}&select=*&order=due_on.asc.nullslast,updated_at.desc`,
    );
    return c.json(await response.json(), response.ok ? 200 : 403);
  });

  routes.post('/:id/maintenance/work-orders', async (c) => {
    const parsed = await body(c, workOrderSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'create_maintenance_work_order', {
      target_condominium: uuid.parse(c.req.param('id')),
      target_asset: parsed.assetId ?? null,
      target_request: parsed.requestId ?? null,
      target_vendor: parsed.vendorId ?? null,
      target_assignee: parsed.assignedToUserId ?? null,
      work_kind: parsed.kind,
      work_priority: parsed.priority,
      work_title: parsed.title,
      work_description: parsed.description,
      scheduled_at: parsed.scheduledFor ?? null,
      due_date: parsed.dueOn ?? null,
    });
    return responseJson(c, response, 201);
  });

  routes.post('/:id/maintenance/generate', async (c) => {
    const parsed = await body(c, generateSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'generate_due_maintenance_work_orders', {
      target_condominium: uuid.parse(c.req.param('id')),
      through_date: parsed.throughDate ?? new Date().toISOString().slice(0, 10),
    });
    return responseJson(c, response);
  });

  routes.post('/:id/maintenance/work-orders/:workOrderId/transition', async (c) => {
    const parsed = await body(c, transitionSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'transition_maintenance_work_order', {
      target_condominium: uuid.parse(c.req.param('id')),
      target_work_order: uuid.parse(c.req.param('workOrderId')),
      next_status: parsed.status,
      transition_note: parsed.note ?? null,
      expected_version: parsed.expectedVersion ?? null,
    });
    return responseJson(c, response);
  });

  routes.get('/:id/maintenance/work-orders/:workOrderId/service-logs', async (c) => {
    const condominiumId = uuid.parse(c.req.param('id'));
    const workOrderId = uuid.parse(c.req.param('workOrderId'));
    const response = await rest(
      c,
      `maintenance_service_logs?condominium_id=eq.${condominiumId}&work_order_id=eq.${workOrderId}&select=*&order=serviced_on.desc,created_at.desc`,
    );
    return c.json(await response.json(), response.ok ? 200 : 403);
  });

  routes.post('/:id/maintenance/work-orders/:workOrderId/service-logs', async (c) => {
    const parsed = await body(c, serviceLogSchema);
    if (parsed instanceof Response) return parsed;
    const response = await rpc(c, 'add_maintenance_service_log', {
      target_condominium: uuid.parse(c.req.param('id')),
      target_work_order: uuid.parse(c.req.param('workOrderId')),
      service_date: parsed.servicedOn,
      service_summary: parsed.summary,
      target_vendor: parsed.vendorId ?? null,
      performed_by_user: parsed.performedByUserId ?? null,
      technician_value: parsed.technicianName ?? null,
      duration_minutes: parsed.durationMinutes ?? null,
      amount_value: parsed.serviceAmount ?? null,
      currency_value: parsed.currencyCode ?? null,
      reference_value: parsed.reference ?? null,
      metadata_value: parsed.metadata ?? {},
    });
    return responseJson(c, response, 201);
  });

  routes.get('/:id/maintenance/work-orders/:workOrderId/events', async (c) => {
    const condominiumId = uuid.parse(c.req.param('id'));
    const workOrderId = uuid.parse(c.req.param('workOrderId'));
    const response = await rest(
      c,
      `maintenance_events?condominium_id=eq.${condominiumId}&entity_type=eq.work_order&entity_id=eq.${workOrderId}&select=*&order=occurred_at.asc,id.asc`,
    );
    return c.json(await response.json(), response.ok ? 200 : 403);
  });
}
