import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<AppEnvironment>;

const uuid = z.string().uuid();
const currency = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const money = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/)
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero');
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const optionalUrl = z.string().trim().url().max(1000).optional();

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    summary: optionalText(500),
    description: z.string().trim().min(3).max(8000),
    category: z.enum(['budget', 'maintenance', 'improvement', 'community', 'policy', 'other']),
    votingBasis: z.enum(['one_per_owner', 'one_per_unit']),
    quorumPercentage: z.number().min(0).max(100),
    approvalThresholdPercentage: z.number().gt(0).max(100).default(50),
    budgetAmount: money.optional(),
    currencyCode: currency.optional(),
    opensAt: z.string().datetime({ offset: true }).optional(),
    closesAt: z.string().datetime({ offset: true }),
    options: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(160),
          description: optionalText(500),
        }),
      )
      .min(2)
      .max(12),
    attachments: z
      .array(
        z.object({
          documentType: z.enum(['quote', 'budget', 'support', 'minutes', 'other']),
          fileName: z.string().trim().min(1).max(200),
          url: optionalUrl,
        }),
      )
      .max(12)
      .optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.budgetAmount) !== Boolean(value.currencyCode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currencyCode'],
        message: 'Budget amount and currency must be provided together',
      });
    }
    const opensAt = value.opensAt ? Date.parse(value.opensAt) : Date.now();
    if (Date.parse(value.closesAt) <= opensAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closesAt'],
        message: 'Closing date must follow the opening date',
      });
    }
    const labels = value.options.map((option) => option.label.toLocaleLowerCase('es'));
    if (new Set(labels).size !== labels.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Voting options must be unique',
      });
    }
  });

const rulesSchema = z.object({
  quorumPercentage: z.number().min(0).max(100),
  approvalThresholdPercentage: z.number().gt(0).max(100),
  expectedVersion: z.number().int().positive().optional(),
});

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
              : (value.message ?? 'Invalid request'),
    },
    status,
  );
};

export const governanceThresholdRoutes = new Hono<AppEnvironment>();

governanceThresholdRoutes.post('/:id/governance-proposals', async (c) => {
  const parsed = await body(c, createSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'create_governance_proposal_v2', {
    target_condominium: uuid.parse(c.req.param('id')),
    proposal_title: parsed.title,
    proposal_summary: parsed.summary ?? null,
    proposal_description: parsed.description,
    proposal_category: parsed.category,
    proposal_voting_basis: parsed.votingBasis,
    proposal_quorum: parsed.quorumPercentage,
    proposal_budget_amount: parsed.budgetAmount ?? null,
    proposal_currency: parsed.currencyCode ?? null,
    opens_on: parsed.opensAt ?? null,
    closes_on: parsed.closesAt,
    options_value: parsed.options.map((option, index) => ({
      label: option.label,
      description: option.description ?? null,
      sortOrder: index,
    })),
    attachments_value: parsed.attachments ?? [],
    approval_threshold: parsed.approvalThresholdPercentage,
  });
  return responseJson(c, response, 201);
});

governanceThresholdRoutes.patch('/:id/governance-proposals/:proposalId/voting-rules', async (c) => {
  const parsed = await body(c, rulesSchema);
  if (parsed instanceof Response) return parsed;
  const response = await rpc(c, 'configure_governance_voting_rules', {
    target_condominium: uuid.parse(c.req.param('id')),
    target_proposal: uuid.parse(c.req.param('proposalId')),
    quorum_value: parsed.quorumPercentage,
    approval_threshold_value: parsed.approvalThresholdPercentage,
    expected_version: parsed.expectedVersion ?? null,
  });
  return responseJson(c, response);
});
