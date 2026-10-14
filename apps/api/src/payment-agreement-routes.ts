import type { Context, Hono } from 'hono';
import {
  paymentAgreementCreateSchema,
  paymentAgreementTransitionSchema,
  uuidSchema,
} from '@habitta/validation';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type Environment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<Environment>;

const rest = (c: AppContext, path: string, init: RequestInit = {}) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const rpc = (c: AppContext, name: string, payload: unknown) =>
  rest(c, `rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });

const failure = async (c: AppContext, response: Response) => {
  const details = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  const status =
    details?.code === '42501'
      ? 403
      : details?.code === 'P0002'
        ? 404
        : details?.code === '40001'
          ? 409
          : 400;
  return c.json({ error: details?.message ?? 'Request failed' }, status);
};

const schedule = (
  installments: { dueDate: string; amount: string; currencyCode?: string | undefined }[],
) =>
  installments.map((item) => ({
    due_date: item.dueDate,
    amount: item.amount,
    ...(item.currencyCode ? { currency_code: item.currencyCode } : {}),
  }));

export function registerPaymentAgreementRoutes(router: Hono<Environment>) {
  router.get('/:id/payment-agreements', async (c) => {
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const agreements = await rest(
      c,
      `payment_agreements?condominium_id=eq.${condominiumId}&select=*&order=updated_at.desc`,
    );
    if (!agreements.ok) return failure(c, agreements);
    const items = (await agreements.json()) as { id: string }[];
    if (!items.length) return c.json([]);
    const ids = items.map((item) => item.id).join(',');
    const [sources, events, progress] = await Promise.all([
      rest(c, `payment_agreement_receivables?agreement_id=in.(${ids})&select=*`),
      rest(
        c,
        `payment_agreement_events?agreement_id=in.(${ids})&select=*&order=sequence_number.asc`,
      ),
      rest(c, `payment_agreement_progress?agreement_id=in.(${ids})&select=*`),
    ]);
    if (!sources.ok) return failure(c, sources);
    if (!events.ok) return failure(c, events);
    if (!progress.ok) return failure(c, progress);
    const sourcesByAgreement = new Map<string, unknown[]>();
    for (const item of (await sources.json()) as { agreement_id: string }[]) {
      sourcesByAgreement.set(item.agreement_id, [
        ...(sourcesByAgreement.get(item.agreement_id) ?? []),
        item,
      ]);
    }
    const eventsByAgreement = new Map<string, unknown[]>();
    for (const item of (await events.json()) as { agreement_id: string }[]) {
      eventsByAgreement.set(item.agreement_id, [
        ...(eventsByAgreement.get(item.agreement_id) ?? []),
        item,
      ]);
    }
    const progressByAgreement = new Map<string, unknown>();
    for (const item of (await progress.json()) as { agreement_id: string }[])
      progressByAgreement.set(item.agreement_id, item);
    return c.json(
      items.map((item) => ({
        ...item,
        receivables: sourcesByAgreement.get(item.id) ?? [],
        events: eventsByAgreement.get(item.id) ?? [],
        progress: progressByAgreement.get(item.id) ?? null,
      })),
    );
  });

  router.post('/:id/payment-agreements', async (c) => {
    const parsed = paymentAgreementCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const condominiumId = uuidSchema.parse(c.req.param('id'));
    const value = parsed.data;
    const response = await rpc(c, 'create_payment_agreement', {
      target_condominium: condominiumId,
      target_unit: value.unitId,
      target_legal_obligor: value.legalObligorPersonId ?? null,
      target_currency: value.currencyCode,
      target_schedule: schedule(value.installments),
      target_receivable_ids: value.receivableItemIds,
      target_reason: value.reason ?? null,
      target_idempotency_key: value.idempotencyKey,
    });
    if (!response.ok) return failure(c, response);
    return c.json(await response.json(), 201);
  });

  router.post('/:id/payment-agreements/:agreementId/transition', async (c) => {
    uuidSchema.parse(c.req.param('id'));
    const agreementId = uuidSchema.parse(c.req.param('agreementId'));
    const parsed = paymentAgreementTransitionSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const value = parsed.data;
    const response = await rpc(c, 'transition_payment_agreement', {
      target_agreement: agreementId,
      target_action: value.action,
      target_schedule: value.installments ? schedule(value.installments) : null,
      target_reason: value.reason ?? null,
      expected_version: value.expectedVersion ?? null,
    });
    if (!response.ok) return failure(c, response);
    return c.json(await response.json());
  });
}
