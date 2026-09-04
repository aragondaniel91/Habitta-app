import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { resolveNotificationsEnvironment } from './config/notifications-env';
import { withinRateLimit } from './http-security';
import { sendNotificationEmail } from './notifications/email-provider';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };
type CustomerInvitationContext = Context<AppEnvironment>;

type IssuedInvitation = {
  id: string;
  email: string;
  plan_code: string;
  billing_period: 'monthly' | 'annual';
  expires_at: string;
  token: string;
};

type CustomerInvitationListItem = {
  id: string;
  email: string;
  plan_code: string;
  billing_period: 'monthly' | 'annual';
  reference: string | null;
  notes: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  delivery_status: 'pending' | 'sent' | 'failed';
  delivery_error_code: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  last_delivery_at: string | null;
  onboarding_organization_id: string | null;
  onboarding_condominium_id: string | null;
  onboarding_completed_at: string | null;
};

const issueInputSchema = z.object({
  email: z.string().trim().min(5).max(320).email(),
  planCode: z.string().trim().min(1).max(60),
  billingPeriod: z.enum(['monthly', 'annual']),
  reference: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().min(1).max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const customerInvitationRoutes = new Hono<AppEnvironment>();

const rpcRequest = (c: CustomerInvitationContext, name: string, body: unknown = {}) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

/*
 * Platform onboarding queue. The RPC is the authorization boundary and deliberately omits token
 * hashes/raw tokens. Prospective-customer email is visible only to a Platform Admin in this narrow
 * operating surface.
 */
customerInvitationRoutes.get('/customer-invitations', async (c) => {
  const response = await rpcRequest(c, 'list_customer_invitations_for_platform');
  const data = (await response.json().catch(() => null)) as
    | CustomerInvitationListItem[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(data)) {
    const message = (
      data && !Array.isArray(data) && typeof data === 'object' && 'message' in data
        ? (data.message ?? '')
        : ''
    ).toLowerCase();
    if (message.includes('platform administrator required')) {
      return c.json({ error: 'platform_administrator_required' }, 403);
    }
    return c.json({ error: 'customer_invitation_list_failed' }, 400);
  }

  return c.json({ invitations: data });
});

/*
 * Issue the invitation a prospective customer receives. The one-time token is consumed here only
 * to build the email; it is never returned to Platform Admin or written to logs.
 */
customerInvitationRoutes.post('/customer-invitations', async (c) => {
  if (!(await withinRateLimit(c.env.INVITATION_LIMIT, `customer-invite:${c.get('userId')}`))) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const parsed = issueInputSchema.safeParse(payload);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const rpcResponse = await rpcRequest(c, 'create_customer_invitation_v2', {
    target_email: parsed.data.email.toLowerCase(),
    target_plan_code: parsed.data.planCode,
    target_billing_period: parsed.data.billingPeriod,
    target_reference: parsed.data.reference ?? null,
    target_notes: parsed.data.notes ?? null,
    target_expires_at: parsed.data.expiresAt ?? null,
  });

  const rpcData = (await rpcResponse.json().catch(() => null)) as
    | IssuedInvitation
    | { message?: string }
    | null;

  if (!rpcResponse.ok || !rpcData || !('token' in rpcData)) {
    const message = (rpcData && 'message' in rpcData ? (rpcData.message ?? '') : '').toLowerCase();
    if (message.includes('platform administrator required')) {
      return c.json(
        {
          error: 'platform_administrator_required',
          publicMessage: 'Solo el equipo de Habitta puede emitir una invitación de cliente.',
        },
        403,
      );
    }
    if (message.includes('invalid email')) {
      return c.json(
        { error: 'invalid_email', publicMessage: 'Introduce un correo electrónico válido.' },
        422,
      );
    }
    if (message.includes('public plan not found')) {
      return c.json(
        { error: 'invalid_plan', publicMessage: 'Selecciona un plan vigente del catálogo.' },
        422,
      );
    }
    if (message.includes('billing period')) {
      return c.json(
        { error: 'invalid_billing_period', publicMessage: 'Selecciona facturación mensual o anual.' },
        422,
      );
    }
    if (message.includes('invalid expiration')) {
      return c.json(
        {
          error: 'invalid_expiration',
          publicMessage: 'La expiración debe estar entre una hora y 90 días.',
        },
        422,
      );
    }
    return c.json({ error: 'customer_invitation_failed' }, 400);
  }

  const invitation = rpcData;
  const appBaseUrl = c.env.APP_BASE_URL.replace(/\/$/, '');
  const acceptUrl = `${appBaseUrl}/app/bienvenida?invitacion=${encodeURIComponent(invitation.token)}`;
  const notificationEnvironment = resolveNotificationsEnvironment(c.env);
  const periodLabel = invitation.billing_period === 'annual' ? 'anual' : 'mensual';

  const subject = 'Tu invitación a Habitta';
  const text = [
    'Habitta te invitó a configurar tu espacio de administración.',
    '',
    `Plan seleccionado: ${invitation.plan_code} · facturación ${periodLabel}.`,
    'No se realizará ningún cargo al abrir este enlace.',
    '',
    'Crea o inicia sesión con tu cuenta y completa los datos de tu primer condominio:',
    acceptUrl,
    '',
    `El enlace vence el ${new Date(invitation.expires_at).toLocaleDateString('es-VE')}.`,
    'Si no reconoces este correo, puedes ignorarlo.',
  ].join('\n');

  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const html = [
    '<p>Habitta te invitó a configurar tu espacio de administración.</p>',
    `<p><strong>Plan seleccionado:</strong> ${escape(invitation.plan_code)} · facturación ${escape(periodLabel)}.</p>`,
    '<p>No se realizará ningún cargo al abrir este enlace.</p>',
    '<p>Crea o inicia sesión con tu cuenta y completa los datos de tu primer condominio:</p>',
    `<p><a href="${escape(acceptUrl)}">Comenzar en Habitta</a></p>`,
    `<p>El enlace vence el ${escape(new Date(invitation.expires_at).toLocaleDateString('es-VE'))}.</p>`,
    '<p>Si no reconoces este correo, puedes ignorarlo.</p>',
  ].join('');

  let delivered = false;
  let deliveryError: string | undefined;
  const recipient = notificationEnvironment.sandboxEmail ?? invitation.email;

  if (recipient) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const result = await sendNotificationEmail(
        c.env,
        notificationEnvironment.emailProvider,
        {
          fromEmail: c.env.NOTIFICATIONS_FROM_EMAIL,
          fromName: c.env.NOTIFICATIONS_FROM_NAME,
          to: recipient,
          subject,
          html,
          text,
          deduplicationKey: `customer-invitation:${invitation.id}`,
        },
        controller.signal,
      );
      delivered = result.ok;
      if (!result.ok) deliveryError = result.errorCode;
    } catch {
      deliveryError = 'delivery_exception';
    } finally {
      clearTimeout(timeout);
    }
  } else {
    deliveryError = 'no_recipient';
  }

  // Delivery tracking is best-effort metadata. The authoritative invitation already exists; a
  // provider outage must be represented as "issued, email failed" instead of erasing the record.
  const deliveryResponse = await rpcRequest(c, 'record_customer_invitation_delivery', {
    target_invitation: invitation.id,
    delivered,
    error_code: deliveryError ?? null,
  });
  const deliveryTracked = deliveryResponse.ok;
  await deliveryResponse.arrayBuffer().catch(() => undefined);

  return c.json(
    {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        planCode: invitation.plan_code,
        billingPeriod: invitation.billing_period,
        expiresAt: invitation.expires_at,
      },
      delivered,
      deliveryTracked,
      ...(deliveryError ? { deliveryError } : {}),
    },
    201,
  );
});

customerInvitationRoutes.post('/customer-invitations/:invitationId/revoke', async (c) => {
  const invitationId = c.req.param('invitationId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitationId)) {
    return c.json({ error: 'Invalid invitation identifier' }, 400);
  }

  let reason: string | null = null;
  try {
    const body = (await c.req.json()) as { reason?: unknown };
    if (typeof body?.reason === 'string' && body.reason.trim())
      reason = body.reason.trim().slice(0, 500);
  } catch {
    reason = null;
  }

  const response = await rpcRequest(c, 'revoke_customer_invitation', {
    target_invitation: invitationId,
    revoke_reason: reason,
  });

  const data = (await response.json().catch(() => null)) as { message?: string } | unknown;
  if (!response.ok) {
    const message = (
      data && typeof data === 'object' && 'message' in data
        ? ((data as { message?: string }).message ?? '')
        : ''
    ).toLowerCase();
    if (message.includes('platform administrator required')) {
      return c.json(
        {
          error: 'platform_administrator_required',
          publicMessage: 'Solo el equipo de Habitta puede revocar una invitación de cliente.',
        },
        403,
      );
    }
    if (message.includes('not found')) {
      return c.json(
        { error: 'customer_invitation_not_found', publicMessage: 'Esa invitación no existe.' },
        404,
      );
    }
    if (message.includes('not pending')) {
      return c.json(
        {
          error: 'customer_invitation_not_pending',
          publicMessage: 'Esa invitación ya fue aceptada o revocada.',
        },
        409,
      );
    }
    return c.json({ error: 'customer_invitation_revoke_failed' }, 400);
  }

  return c.json(data, 200);
});
