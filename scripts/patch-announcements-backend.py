from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    value = file.read_text()
    if old not in value:
        raise SystemExit(f'marker not found in {path}: {old[:80]!r}')
    if value.count(old) != 1:
        raise SystemExit(f'marker is not unique in {path}')
    file.write_text(value.replace(old, new, 1))


def append_once(path: str, marker: str, content: str) -> None:
    file = Path(path)
    value = file.read_text()
    if marker in value:
        return
    file.write_text(value.rstrip() + '\n\n' + content.strip() + '\n')


replace_once(
    'packages/validation/src/index.ts',
    "  'receivable_overdue',\n]);",
    "  'receivable_overdue',\n  'announcement_published',\n]);",
)

append_once(
    'packages/validation/src/index.ts',
    'export const announcementPrioritySchema',
    r'''
export const announcementPrioritySchema = z.enum(['normal', 'important', 'urgent']);
export const announcementStatusSchema = z.enum(['draft', 'scheduled', 'published', 'archived']);
export const announcementAudienceSchema = z.enum([
  'everyone',
  'owners',
  'tenants',
  'board',
  'building',
  'unit',
]);

const announcementAudienceFieldsSchema = z.object({
  audience: announcementAudienceSchema,
  buildingId: uuidSchema.optional(),
  unitId: uuidSchema.optional(),
});

const validateAnnouncementAudience = (
  value: { audience?: string; buildingId?: string; unitId?: string },
  context: z.RefinementCtx,
) => {
  if (value.buildingId && value.unitId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitId'],
      message: 'An announcement cannot target a building and a unit together',
    });
  }
  if (value.audience === 'building' && !value.buildingId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['buildingId'],
      message: 'Building audience requires buildingId',
    });
  }
  if (value.audience === 'unit' && !value.unitId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitId'],
      message: 'Unit audience requires unitId',
    });
  }
  if (value.audience && value.audience !== 'building' && value.buildingId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['buildingId'],
      message: 'buildingId is only valid for building audiences',
    });
  }
  if (value.audience && value.audience !== 'unit' && value.unitId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitId'],
      message: 'unitId is only valid for unit audiences',
    });
  }
};

export const announcementCreateSchema = announcementAudienceFieldsSchema
  .extend({
    title: z.string().trim().min(3).max(160),
    summary: z.string().trim().min(3).max(280),
    body: z.string().trim().min(3).max(12000),
    priority: announcementPrioritySchema.default('normal'),
    audience: announcementAudienceSchema.default('everyone'),
    requiresAcknowledgement: z.boolean().default(false),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine(validateAnnouncementAudience);

export const announcementUpdateSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    summary: z.string().trim().min(3).max(280).optional(),
    body: z.string().trim().min(3).max(12000).optional(),
    priority: announcementPrioritySchema.optional(),
    audience: announcementAudienceSchema.optional(),
    buildingId: uuidSchema.optional(),
    unitId: uuidSchema.optional(),
    requiresAcknowledgement: z.boolean().optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    clearExpires: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (!Object.values(value).some((field) => field !== undefined && field !== false)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one change is required' });
    }
    if (value.expiresAt && value.clearExpires) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearExpires'],
        message: 'Cannot set and clear expiration together',
      });
    }
    validateAnnouncementAudience(value, context);
  });

export const announcementListQuerySchema = z.object({
  status: announcementStatusSchema.optional(),
  priority: announcementPrioritySchema.optional(),
  audience: announcementAudienceSchema.optional(),
});

export const announcementScheduleSchema = z.object({
  publishAt: z.string().datetime({ offset: true }),
  expectedVersion: z.number().int().positive().optional(),
});

export const announcementActionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});
''',
)

append_once(
    'packages/shared-types/src/index.ts',
    'export const announcementPriorities',
    r'''
export const announcementPriorities = ['normal', 'important', 'urgent'] as const;
export type AnnouncementPriority = (typeof announcementPriorities)[number];

export const announcementStatuses = ['draft', 'scheduled', 'published', 'archived'] as const;
export type AnnouncementStatus = (typeof announcementStatuses)[number];

export const announcementAudiences = [
  'everyone',
  'owners',
  'tenants',
  'board',
  'building',
  'unit',
] as const;
export type AnnouncementAudience = (typeof announcementAudiences)[number];
''',
)

append_once(
    'packages/contracts/src/index.ts',
    'export type AnnouncementRecord',
    r'''
export type AnnouncementRecord = {
  id: string;
  condominium_id: string;
  title: string;
  summary: string;
  body: string;
  priority: import('@habitta/shared-types').AnnouncementPriority;
  status: import('@habitta/shared-types').AnnouncementStatus;
  audience: import('@habitta/shared-types').AnnouncementAudience;
  building_id: string | null;
  unit_id: string | null;
  requires_acknowledgement: boolean;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  archived_at: string | null;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
};
''',
)

replace_once(
    'packages/validation/src/index.test.ts',
    "  serviceRequestUpdateSchema,\n  signInSchema,",
    "  serviceRequestUpdateSchema,\n  announcementCreateSchema,\n  announcementUpdateSchema,\n  announcementScheduleSchema,\n  signInSchema,",
)
replace_once(
    'packages/validation/src/index.test.ts',
    "  it('rejects contradictory or empty request updates', () => {",
    r'''  it('validates announcement audiences, updates and schedules', () => {
    expect(
      announcementCreateSchema.parse({
        title: 'Mantenimiento de ascensores',
        summary: 'El ascensor norte estará fuera de servicio.',
        body: 'El proveedor realizará mantenimiento preventivo durante la mañana.',
      }),
    ).toMatchObject({ priority: 'normal', audience: 'everyone' });
    expect(
      announcementCreateSchema.safeParse({
        title: 'Aviso de torre',
        summary: 'Información para una torre.',
        body: 'Contenido del aviso.',
        audience: 'building',
      }).success,
    ).toBe(false);
    expect(announcementUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      announcementUpdateSchema.safeParse({
        expiresAt: '2026-08-01T12:00:00Z',
        clearExpires: true,
      }).success,
    ).toBe(false);
    expect(
      announcementScheduleSchema.safeParse({ publishAt: '2026-08-01T12:00:00Z' }).success,
    ).toBe(true);
  });

  it('rejects contradictory or empty request updates', () => {''',
)

replace_once(
    'apps/api/src/index.ts',
    "  serviceRequestListQuerySchema,\n  uuidSchema,",
    "  serviceRequestListQuerySchema,\n  announcementCreateSchema,\n  announcementUpdateSchema,\n  announcementListQuerySchema,\n  announcementScheduleSchema,\n  announcementActionSchema,\n  uuidSchema,",
)

announcement_routes = r'''
app.get('/v1/condominiums/:id/announcements', async (c) => {
  const query = announcementListQuerySchema.safeParse({
    status: c.req.query('status') || undefined,
    priority: c.req.query('priority') || undefined,
    audience: c.req.query('audience') || undefined,
  });
  if (!query.success) return c.json({ error: query.error.flatten() }, 400);
  const id = uuidSchema.parse(c.req.param('id'));
  const filters = [
    `condominium_id=eq.${id}`,
    query.data.status ? `status=eq.${query.data.status}` : '',
    query.data.priority ? `priority=eq.${query.data.priority}` : '',
    query.data.audience ? `audience=eq.${query.data.audience}` : '',
  ].filter(Boolean);
  const r = await rest(c, `announcements?${filters.join('&')}&select=*&order=updated_at.desc`);
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.post('/v1/condominiums/:id/announcements', async (c) => {
  const p = await body(c, announcementCreateSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'create_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    announcement_title: p.title,
    announcement_summary: p.summary,
    announcement_body: p.body,
    announcement_priority: p.priority,
    announcement_audience: p.audience,
    target_building: p.buildingId ?? null,
    target_unit: p.unitId ?? null,
    acknowledgement_required: p.requiresAcknowledgement,
    expires_on: p.expiresAt ?? null,
  });
  return responseJson(c, r, 201, 409);
});
app.get('/v1/condominiums/:id/announcements/:announcementId', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(
    c,
    `announcements?id=eq.${announcementId}&condominium_id=eq.${id}&select=*`,
  );
  if (!r.ok) return c.json({ error: 'Announcement failed' }, r.status === 403 ? 403 : 404);
  const rows = (await r.json()) as unknown[];
  return rows.length ? c.json(rows[0]) : c.json({ error: 'Announcement not found' }, 404);
});
app.patch('/v1/condominiums/:id/announcements/:announcementId', async (c) => {
  const p = await body(c, announcementUpdateSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'update_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    next_title: p.title ?? null,
    next_summary: p.summary ?? null,
    next_body: p.body ?? null,
    next_priority: p.priority ?? null,
    next_audience: p.audience ?? null,
    target_building: p.buildingId ?? null,
    target_unit: p.unitId ?? null,
    next_requires_acknowledgement: p.requiresAcknowledgement ?? null,
    expires_on: p.expiresAt ?? null,
    clear_expires: p.clearExpires ?? false,
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/schedule', async (c) => {
  const p = await body(c, announcementScheduleSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'schedule_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    publish_on: p.publishAt,
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/unschedule', async (c) => {
  const p = await body(c, announcementActionSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'unschedule_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/publish', async (c) => {
  const p = await body(c, announcementActionSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'publish_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/archive', async (c) => {
  const p = await body(c, announcementActionSchema);
  if (p instanceof Response) return p;
  const r = await rpc(c, 'archive_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
    expected_version: p.expectedVersion ?? null,
  });
  return responseJson(c, r, 200, 409);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/read', async (c) => {
  const r = await rpc(c, 'mark_announcement_read', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
  });
  return responseJson(c, r, 200, 404);
});
app.post('/v1/condominiums/:id/announcements/:announcementId/acknowledge', async (c) => {
  const r = await rpc(c, 'acknowledge_announcement', {
    target_condominium: uuidSchema.parse(c.req.param('id')),
    target_announcement: uuidSchema.parse(c.req.param('announcementId')),
  });
  return responseJson(c, r, 200, 409);
});
app.get('/v1/condominiums/:id/announcements/:announcementId/recipients', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(
    c,
    `announcement_recipients?condominium_id=eq.${id}&announcement_id=eq.${announcementId}&select=*&order=created_at.asc,user_id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/announcements/:announcementId/events', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(
    c,
    `announcement_events?condominium_id=eq.${id}&announcement_id=eq.${announcementId}&select=*&order=created_at.asc,id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
app.get('/v1/condominiums/:id/announcements/:announcementId/attachments', async (c) => {
  const id = uuidSchema.parse(c.req.param('id'));
  const announcementId = uuidSchema.parse(c.req.param('announcementId'));
  const r = await rest(
    c,
    `announcement_attachments?condominium_id=eq.${id}&announcement_id=eq.${announcementId}&select=*&order=created_at.asc,id.asc`,
  );
  return c.json(await r.json(), r.ok ? 200 : 403);
});
'''
replace_once(
    'apps/api/src/index.ts',
    "app.get('/v1/condominiums/:id/request-categories', async (c) => {",
    announcement_routes + "\napp.get('/v1/condominiums/:id/request-categories', async (c) => {",
)

replace_once(
    'apps/api/src/notifications/templates.ts',
    "  receivable_overdue: { version: 1, subject: 'Cargo vencido', intro: 'Tienes un cargo vencido.' },",
    "  receivable_overdue: { version: 1, subject: 'Cargo vencido', intro: 'Tienes un cargo vencido.' },\n  announcement_published: {\n    version: 1,\n    subject: 'Nuevo anuncio',\n    intro: 'Se publicó un nuevo anuncio en tu condominio.',\n  },",
)

replace_once(
    'apps/api/src/notifications/renderer.ts',
    "    plain(payload.reason),\n    plain(payload.amount)",
    "    plain(payload.reason),\n    plain(payload.announcement_title),\n    plain(payload.announcement_summary),\n    plain(payload.priority),\n    plain(payload.amount)",
)

replace_once(
    'apps/api/src/notifications/worker.ts',
    "  await serviceRpc<number>(env, 'generate_due_notification_events', {",
    "  await serviceRpc<number>(env, 'publish_due_announcements', {\n    run_at: runAt.toISOString(),\n  });\n  await serviceRpc<number>(env, 'generate_due_notification_events', {",
)

replace_once(
    'apps/api/test/notification-worker.test.ts',
    "  processNotificationDelivery,\n} from '../src/notifications/worker';",
    "  processNotificationDelivery,\n  runScheduled,\n} from '../src/notifications/worker';",
)
replace_once(
    'apps/api/test/notification-worker.test.ts',
    "describe('notification queue scheduling', () => {",
    r'''describe('notification queue scheduling', () => {
  it('publishes due announcements before expanding notification events', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('publish_due_announcements')) return Response.json(1);
        if (url.includes('generate_due_notification_events')) return Response.json(0);
        if (url.includes('claim_notification_events')) return Response.json([]);
        if (url.includes('claim_due_notification_deliveries')) return Response.json([]);
        throw new Error(url);
      }),
    );
    await runScheduled(env(), new Date('2026-08-01T12:00:00Z'));
    expect(calls.findIndex((url) => url.includes('publish_due_announcements'))).toBeLessThan(
      calls.findIndex((url) => url.includes('generate_due_notification_events')),
    );
  });''',
)
