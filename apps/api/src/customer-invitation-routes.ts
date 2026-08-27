import { Hono } from 'hono';
import { z } from 'zod';
import { resolveNotificationsEnvironment } from './config/notifications-env';
import { withinRateLimit } from './http-security';
import { sendNotificationEmail } from './notifications/email-provider';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };

type IssuedInvitation = {
  id: string;
  email: string;
  plan_code: string | null;
  expires_at: string;
  token: string;
};

const issueInputSchema = z.object({
  email: z.string().trim().min(5).max(320).email(),
  planCode: z.string().trim().min(1).max(60).optional(),
  reference: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().min(1).max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const customerInvitationRoutes = new Hono<AppEnvironment>();

/*
 * Issuing the invitation a paying customer receives.
 *
 * Authorization is not decided here: the RPC is gated on `is_platform_admin`, so a caller without
 * that standing is refused by the database whatever this route believes. The route's job is to
 * turn the one-time token into an email and never to persist it.
 */
customerInvitationRoutes.post('/customer-invitations', async (c) => {
  if (!(await withinRateLimit(c.env.PROOF_UPLOAD_LIMIT, `customer-invite:${c.get('userId')}`))) {
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

  const rpcResponse = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_customer_invitation`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target_email: parsed.data.email.toLowerCase(),
      target_plan_code: parsed.data.planCode ?? null,
      target_reference: parsed.data.reference ?? null,
      target_notes: parsed.data.notes ?? null,
      target_expires_at: parsed.data.expiresAt ?? null,
    }),
  });

  const rpcData = (await rpcResponse.json().catch(() => null)) as
    IssuedInvitation | { message?: string } | null;

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

  const subject = 'Tu acceso a Habitta';
  const plan = invitation.plan_code ? ` (plan ${invitation.plan_code})` : '';
  const text = [
    'Gracias por sumarte a Habitta.',
    '',
    `Tu suscripción${plan} ya está activa. Crea tu cuenta desde este enlace:`,
    acceptUrl,
    '',
    `El enlace vence el ${new Date(invitation.expires_at).toLocaleDateString('es-VE')}.`,
    'Si no reconoces este correo, puedes ignorarlo.',
  ].join('\n');

  // The email carries values that came from an operator's form, so it escapes them rather than
  // trusting them: an address or a plan code with markup in it must not become markup here.
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const html = [
    '<p>Gracias por sumarte a Habitta.</p>',
    `<p>Tu suscripción${escape(plan)} ya está activa. Crea tu cuenta desde este enlace:</p>`,
    `<p><a href="${escape(acceptUrl)}">Crear mi cuenta</a></p>`,
    `<p>El enlace vence el ${escape(new Date(invitation.expires_at).toLocaleDateString('es-VE'))}.</p>`,
    '<p>Si no reconoces este correo, puedes ignorarlo.</p>',
  ].join('');

  /*
   * Delivery is reported, never assumed. The invitation already exists in the database, so a
   * failed send must not read as a failed issue: the operator needs to know the record is there
   * and only the email has to be retried, which is what `delivered` distinguishes.
   */
  let delivered = false;
  let deliveryError: string | undefined;

  // In sandbox mode every message is redirected to one inbox, so a development release can never
  // email a real customer.
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

  // The raw token leaves this Worker only inside the email. It is never returned to the caller,
  // never logged, and only its hash was stored, so a compromised operator console cannot replay it.
  return c.json(
    {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        planCode: invitation.plan_code,
        expiresAt: invitation.expires_at,
      },
      delivered,
      ...(deliveryError ? { deliveryError } : {}),
    },
    201,
  );
});

/*
 * Retiring an invitation sent to the wrong address.
 *
 * Resending only helps when the address was right; a mistyped one stays live until it expires and
 * whoever owns that inbox can redeem it. Authorization is the database's again, and the record is
 * retired rather than deleted so the mistake stays visible to whoever audits it later.
 */
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

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/revoke_customer_invitation`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ target_invitation: invitationId, revoke_reason: reason }),
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
