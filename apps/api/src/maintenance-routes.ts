import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());

const assetStatus = z.enum(['active', 'out_of_service', 'retired']);
const planKind = z.enum(['preventive', 'inspection']);
const frequencyUnit = z.enum(['days', 'weeks', 'months', 'years']);
const workOrderKind = z.enum(['preventive', 'corrective', 'inspection', 'emergency']);
const workOrderPriority = z.enum(['low', 'normal', 'high', 'urgent']);
const workOrderStatus = z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']);
const eventEntityType = z.enum(['asset', 'plan', 'work_order', 'service_log']);

const assetFieldsSchema = z
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
    installedOn: z.string().date().nullable().optional(),
    warrantyExpiresOn: z.string().date().nullable().optional(),
    locationNotes: optionalText(500),
    notes: optionalText(2000),
  })
  .superRefine((value, context) => {
    if (value.buildingId && value.unitId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitId'],
        message: 'An asset can belong to a building or a unit, not both',
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
        message: 'Warranty date must not precede installation date',
      });
    }
  });

const assetCreateSchema = assetFieldsSchema;
const assetUpdateSchema = assetFieldsSchema.and(
  z.object({
    status: assetStatus,
    expectedVersion: z.number().int().positive(),
  }),
);

const planFieldsSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: planKind,
  instructions: z.string().trim().min(3).max(5000),
  frequencyValue: z.number().int().min(1).max(365),
  frequencyUnit,
  nextDueOn: z.string().date(),
  vendorId: optionalUuid,
  assignedToUserId: optionalUuid,
  estimatedDurationMinutes: z.number().int().min(1).max(10080).nullable().optional(),
});

const planCreateSchema = planFieldsSchema.extend({ assetId: uuid });
const planUpdateSchema = planFieldsSchema.extend({
  isActive: z.boolean(),
  expectedVersion: z.number().int().positive(),
});

const workOrderFieldsSchema = z
  .object({
    assetId: optionalUuid,
    requestId: optionalUuid,
    vendorId: optionalUuid,
    assignedToUserId: optionalUuid,
    kind: workOrderKind,
    priority: workOrderPriority.default('normal'),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(3).max(5000),
    scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
    dueOn: z.string().date().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.scheduledFor && value.dueOn && value.dueOn < value.scheduledFor.slice(0, 10)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueOn'],
        message: 'Due date must not precede scheduled date',
      });
    }
  });

const workOrderCreateSchema = workOrderFieldsSchema;
const workOrderUpdateSchema = workOrderFieldsSchema.and(
  z.object({ expectedVersion: z.number().int().positive() }),
);

const transitionSchema = z
  .object({
    status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
    note: z.string().trim().min(3).max(4000).nullable().optional(),
    expectedVersion: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, context) => {
    if ((value.status === 'completed' || value.status === 'cancelled') && !value.note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A completion or cancellation note is required',
      });
    }
  });

const serviceLogSchema = z
  .object({
    servicedOn: z.string().date(),
    summary: z.string().trim().min(3).max(5000),
    vendorId: optionalUuid,
    performedByUserId: optionalUuid,
    technicianName: optionalText(160),
    durationMinutes: z.number().int().min(1).max(10080).nullable().optional(),
    amount: z.number().nonnegative().nullable().optional(),
    currencyCode: currency.nullable().optional(),
    reference: optionalText(160),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    if ((value.amount == null) !== (value.currencyCode == null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencyCode'],
        message: 'Amount and currency must be provided together',
      });
    }
    if (!value.vendorId && !value.performedByUserId && !value.technicianName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['technicianName'],
        message: 'A service performer is required',
      });
    }
  });

const generationSchema = z.object({ throughDate: z.string().date().optional() });

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
      : value.code === '23505' || value.message?.includes('version conflict')
        ? 409
        : value.message?.includes('not found') || response.status === 404
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
              : (value.message ?? 'Invalid request'),
    },
    status,
  );
};

const single = async (c: AppContext, response: Response) => {
  const value = (await response.json()) as unknown[];
  if (!response.ok)
    return c.json(
      { error: response.status === 403 ? 'Forbidden' : 'Invalid request' },
      response.status === 403 ? 403 : 400,
    );
  if (!value[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(value[0], 200);
};

export const maintenanceRoutes = new Hono<AppEnvironment>();

maintenanceRoutes.get('/:id/maintenance/assets', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const status = c.req.query('status') ? assetStatus.parse(c.req.query('status')) : null;
  const category = c.req.query('category')?.trim();
  const filters = [
    `condominium_id=eq.${condominiumId}`,
    status ? `status=eq.${status}` : null,
    category ? `category=eq.${encodeURIComponent(category)}` : null,
  ].filter(Boolean);
  const response = await rest(
    c,
    `maintenance_assets?${filters.join('&')}&select=*&order=status.asc,name.asc`,
  );
  return responseJson(c, response);
});

maintenanceRoutes.get('/:id/maintenance/assets/:assetId', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const assetId = uuid.parse(c.req.param('assetId'));
  const response = await rest(
    c,
    `maintenance_assets?condominium_id=eq.${condominiumId}&id=eq.${assetId}&select=*`,
  );
  return single(c, response);
});

maintenanceRoutes.post('/:id/maintenance/assets', async (c) => {
  const parsed = await body(c, assetCreateSchema);
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

maintenanceRoutes.put('/:id/maintenance/assets/:assetId', async (c) => {
  const parsed = await body(c, assetUpdateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'update_maintenance_asset', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_asset: uuid.parse(c.req.param('assetId')),
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
    next_status: parsed.status,
    expected_version: parsed.expectedVersion,
  });
  return responseJson(c, response);
});

maintenanceRoutes.get('/:id/maintenance/plans', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const active = c.req.query('active');
  const filters = [
    `condominium_id=eq.${condominiumId}`,
    active === 'true' || active === 'false' ? `is_active=eq.${active}` : null,
  ].filter(Boolean);
  const response = await rest(
    c,
    `maintenance_plans?${filters.join('&')}&select=*&order=is_active.desc,next_due_on.asc,name.asc`,
  );
  return responseJson(c, response);
});

maintenanceRoutes.get('/:id/maintenance/plans/:planId', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const planId = uuid.parse(c.req.param('planId'));
  const response = await rest(
    c,
    `maintenance_plans?condominium_id=eq.${condominiumId}&id=eq.${planId}&select=*`,
  );
  return single(c, response);
});

maintenanceRoutes.post('/:id/maintenance/plans', async (c) => {
  const parsed = await body(c, planCreateSchema);
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
    target_vendor: parsed.vendorId ?? null,
    target_assignee: parsed.assignedToUserId ?? null,
    duration_minutes: parsed.estimatedDurationMinutes ?? null,
  });
  return responseJson(c, response, 201);
});

maintenanceRoutes.put('/:id/maintenance/plans/:planId', async (c) => {
  const parsed = await body(c, planUpdateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'update_maintenance_plan', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_plan: uuid.parse(c.req.param('planId')),
    plan_name: parsed.name,
    plan_kind: parsed.kind,
    plan_instructions: parsed.instructions,
    recurrence_value: parsed.frequencyValue,
    recurrence_unit: parsed.frequencyUnit,
    next_due_date: parsed.nextDueOn,
    target_vendor: parsed.vendorId ?? null,
    target_assignee: parsed.assignedToUserId ?? null,
    duration_minutes: parsed.estimatedDurationMinutes ?? null,
    active_value: parsed.isActive,
    expected_version: parsed.expectedVersion,
  });
  return responseJson(c, response);
});

maintenanceRoutes.post('/:id/maintenance/generate-due', async (c) => {
  const parsed = await body(c, generationSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'generate_due_maintenance_work_orders', {
    target_condominium: uuid.parse(c.req.param('id')),
    ...(parsed.throughDate ? { through_date: parsed.throughDate } : {}),
  });
  return responseJson(c, response);
});

maintenanceRoutes.get('/:id/maintenance/work-orders', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const status = c.req.query('status') ? workOrderStatus.parse(c.req.query('status')) : null;
  const priority = c.req.query('priority')
    ? workOrderPriority.parse(c.req.query('priority'))
    : null;
  const assetId = c.req.query('assetId') ? uuid.parse(c.req.query('assetId')) : null;
  const filters = [
    `condominium_id=eq.${condominiumId}`,
    status ? `status=eq.${status}` : null,
    priority ? `priority=eq.${priority}` : null,
    assetId ? `asset_id=eq.${assetId}` : null,
  ].filter(Boolean);
  const response = await rest(
    c,
    `maintenance_work_orders?${filters.join('&')}&select=*&order=due_on.asc.nullslast,updated_at.desc`,
  );
  return responseJson(c, response);
});

maintenanceRoutes.get('/:id/maintenance/work-orders/:workOrderId', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const workOrderId = uuid.parse(c.req.param('workOrderId'));
  const response = await rest(
    c,
    `maintenance_work_orders?condominium_id=eq.${condominiumId}&id=eq.${workOrderId}&select=*`,
  );
  return single(c, response);
});

maintenanceRoutes.post('/:id/maintenance/work-orders', async (c) => {
  const parsed = await body(c, workOrderCreateSchema);
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

maintenanceRoutes.put('/:id/maintenance/work-orders/:workOrderId', async (c) => {
  const parsed = await body(c, workOrderUpdateSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'update_maintenance_work_order', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_work_order: uuid.parse(c.req.param('workOrderId')),
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
    expected_version: parsed.expectedVersion,
  });
  return responseJson(c, response);
});

maintenanceRoutes.post('/:id/maintenance/work-orders/:workOrderId/transition', async (c) => {
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

maintenanceRoutes.get('/:id/maintenance/work-orders/:workOrderId/service-logs', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const workOrderId = uuid.parse(c.req.param('workOrderId'));
  const response = await rest(
    c,
    `maintenance_service_logs?condominium_id=eq.${condominiumId}&work_order_id=eq.${workOrderId}&select=*&order=serviced_on.desc,created_at.desc`,
  );
  return responseJson(c, response);
});

maintenanceRoutes.post('/:id/maintenance/work-orders/:workOrderId/service-logs', async (c) => {
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
    amount_value: parsed.amount ?? null,
    currency_value: parsed.currencyCode ?? null,
    reference_value: parsed.reference ?? null,
    metadata_value: parsed.metadata,
  });
  return responseJson(c, response, 201);
});

maintenanceRoutes.get('/:id/maintenance/events', async (c) => {
  const condominiumId = uuid.parse(c.req.param('id'));
  const entityType = c.req.query('entityType')
    ? eventEntityType.parse(c.req.query('entityType'))
    : null;
  const entityId = c.req.query('entityId') ? uuid.parse(c.req.query('entityId')) : null;
  const filters = [
    `condominium_id=eq.${condominiumId}`,
    entityType ? `entity_type=eq.${entityType}` : null,
    entityId ? `entity_id=eq.${entityId}` : null,
  ].filter(Boolean);
  const response = await rest(
    c,
    `maintenance_events?${filters.join('&')}&select=*&order=occurred_at.desc,id.desc&limit=100`,
  );
  return responseJson(c, response);
});
