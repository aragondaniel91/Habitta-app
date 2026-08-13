import { Hono } from 'hono';
import { z } from 'zod';
import { resolveNotificationsEnvironment } from './config/notifications-env';
import { withinRateLimit } from './http-security';
import { sendNotificationEmail } from './notifications/email-provider';
import { HABITTA_EMAIL_LOGO_MONO_BASE64 } from './notifications/email-assets';
import type { NotificationBindings } from './notifications/types';
import { structureRoutes } from './structure-routes';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };

type CreatedInvitation = {
  id: string;
  condominium_id: string;
  email: string;
  intended_role: 'condominium_admin' | 'accountant' | 'assistant' | 'payment_reviewer';
  status: string;
  expires_at: string;
};

type RpcResult = {
  invitation: CreatedInvitation;
  raw_token: string;
};

type InvitationDelivery = {
  status: 'disabled' | 'sent' | 'failed';
  recipient: string | null;
  provider: string;
  mode: string;
  providerId?: string;
  errorCode?: string;
};

const invitationInputSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['condominium_admin', 'accountant', 'assistant', 'payment_reviewer']),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

const roleLabels: Record<CreatedInvitation['intended_role'], string> = {
  condominium_admin: 'Administrador del condominio',
  accountant: 'Contabilidad',
  assistant: 'Asistente administrativo',
  payment_reviewer: 'Revisor de pagos',
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const safeConfigurationError = (error: unknown) =>
  error instanceof Error && /^notifications_[a-z_]+$/.test(error.message)
    ? error.message
    : 'notifications_configuration_error';

export const adminInvitationRoutes = new Hono<AppEnvironment>();
adminInvitationRoutes.route('/', structureRoutes);

// This route is mounted before the legacy generic list helper. Keeping the condominium-scoped
// people read here prevents that helper from validating a non-existent unitId parameter.
adminInvitationRoutes.get('/:condominiumId/people', async (c) => {
  const condominiumIdResult = z.string().uuid().safeParse(c.req.param('condominiumId'));
  if (!condominiumIdResult.success) return c.json({ error: 'Invalid condominium identifier' }, 400);

  const response = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/people?condominium_id=eq.${condominiumIdResult.data}&select=*&order=last_name.asc,first_name.asc`,
    {
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.get('token')}`,
      },
    },
  );
  const result = await response.json();
  return c.json(result, response.ok ? 200 : 400);
});

adminInvitationRoutes.post('/:condominiumId/admin-invitations', async (c) => {
  const condominiumIdResult = z.string().uuid().safeParse(c.req.param('condominiumId'));
  if (!condominiumIdResult.success) return c.json({ error: 'Invalid condominium identifier' }, 400);

  // Transport-level distributed limiter: reject abuse before parsing JSON, hitting Supabase,
  // generating a token or attempting email. The database trigger remains the fail-safe boundary.
  if (!(await withinRateLimit(c.env.INVITATION_LIMIT, c.get('userId')))) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  const parsed = invitationInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const condominiumId = condominiumIdResult.data;
  const rpcResponse = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_admin_invitation`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target_condominium_id: condominiumId,
      target_email: parsed.data.email.toLowerCase(),
      target_role: parsed.data.role,
      target_expires_at: parsed.data.expiresAt ?? null,
    }),
  });

  const rpcData = (await rpcResponse.json()) as RpcResult | { message?: string; error?: string };
  if (!rpcResponse.ok || !('invitation' in rpcData) || !('raw_token' in rpcData)) {
    const message = 'message' in rpcData ? (rpcData.message ?? '') : '';
    if (message.toLowerCase().includes('admin invitation rate limit exceeded')) {
      return c.json({ error: 'Too many requests' }, 429);
    }
    return c.json(rpcData, 400);
  }

  const condominiumResponse = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/condominiums?id=eq.${condominiumId}&select=name&limit=1`,
    {
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.get('token')}`,
      },
    },
  );
  const condominiums = condominiumResponse.ok
    ? ((await condominiumResponse.json()) as Array<{ name: string }>)
    : [];
  const condominiumName = condominiums[0]?.name ?? 'tu condominio';
  const invitationUrl = `${c.env.APP_BASE_URL.replace(/\/$/, '')}/admin-invite/${rpcData.raw_token}`;

  let notificationEnvironment;
  try {
    notificationEnvironment = resolveNotificationsEnvironment(c.env);
  } catch (error) {
    const errorCode = safeConfigurationError(error);
    console.error(
      JSON.stringify({
        event: 'admin_invitation_email_configuration_failed',
        invitationId: rpcData.invitation.id,
        provider: c.env.NOTIFICATIONS_EMAIL_PROVIDER ?? 'unknown',
        mode: c.env.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',
        errorCode,
      }),
    );
    return c.json(
      {
        invitation: rpcData.invitation,
        invitationUrl,
        emailDelivery: {
          status: 'failed',
          recipient: null,
          provider: c.env.NOTIFICATIONS_EMAIL_PROVIDER ?? 'unknown',
          mode: c.env.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',
          errorCode,
        } satisfies InvitationDelivery,
      },
      201,
    );
  }

  const delivery: InvitationDelivery = {
    status: 'disabled',
    recipient: null,
    provider: notificationEnvironment.emailProvider,
    mode: notificationEnvironment.emailMode,
  };

  if (notificationEnvironment.emailMode !== 'disabled') {
    const recipient =
      notificationEnvironment.emailMode === 'sandbox'
        ? notificationEnvironment.sandboxEmail
        : rpcData.invitation.email;
    const roleLabel = roleLabels[rpcData.invitation.intended_role];
    const subjectPrefix = notificationEnvironment.emailMode === 'sandbox' ? '[HABITTA DEV] ' : '';
    const subject = `${subjectPrefix}Invitación para administrar ${condominiumName}`;
    const expirationLabel = new Date(rpcData.invitation.expires_at).toLocaleString('es');
    const text = [
      `Has sido invitado como ${roleLabel} en ${condominiumName}.`,
      '',
      'Abre este enlace seguro para aceptar la invitación:',
      invitationUrl,
      '',
      `La invitación vence el ${expirationLabel}.`,
      'Si no esperabas esta invitación, puedes ignorar este correo.',
    ].join('\n');
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#f5f7fa;padding:32px;color:#333d4b">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:16px;overflow:hidden">
          <div style="background:#0d1b2a;padding:24px 28px;color:#ffffff">
            <img src="data:image/png;base64,${HABITTA_EMAIL_LOGO_MONO_BASE64}" width="130" alt="Habitta" style="display:block;width:130px;height:auto"/>
            <div style="margin-top:6px;color:#b9c7d5;font-size:13px">Gestión de condominios</div>
          </div>
          <div style="padding:28px">
            <p style="margin:0 0 8px;color:#1b4f72;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Invitación administrativa</p>
            <h1 style="margin:0 0 16px;color:#0d1b2a;font-size:24px">Únete al equipo de ${escapeHtml(condominiumName)}</h1>
            <p style="line-height:1.65">Has sido invitado como <strong>${escapeHtml(roleLabel)}</strong>. Tu acceso se limitará al condominio y al rol autorizados.</p>
            <p style="margin:24px 0">
              <a href="${escapeHtml(invitationUrl)}" style="display:inline-block;background:#28a745;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:700">Aceptar invitación</a>
            </p>
            <p style="font-size:13px;color:#667085;line-height:1.6">Este enlace vence el ${escapeHtml(expirationLabel)}. Si no esperabas esta invitación, puedes ignorar el correo.</p>
          </div>
        </div>
      </div>
    `;

    if (recipient) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      delivery.recipient = recipient;

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
            deduplicationKey: `habitta-admin-invitation-${rpcData.invitation.id}`,
          },
          controller.signal,
        );

        if (result.ok) {
          delivery.status = 'sent';
          if (result.providerId) delivery.providerId = result.providerId;
        } else {
          delivery.status = 'failed';
          delivery.errorCode = result.errorCode;
          if (result.providerId) delivery.providerId = result.providerId;
          console.error(
            JSON.stringify({
              event: 'admin_invitation_email_failed',
              invitationId: rpcData.invitation.id,
              provider: delivery.provider,
              mode: delivery.mode,
              errorCode: result.errorCode,
              providerId: result.providerId ?? null,
              retryable: result.retryable,
            }),
          );
        }
      } catch (error) {
        delivery.status = 'failed';
        delivery.errorCode =
          error instanceof DOMException && error.name === 'AbortError'
            ? 'email_delivery_timeout'
            : 'email_delivery_exception';
        console.error(
          JSON.stringify({
            event: 'admin_invitation_email_exception',
            invitationId: rpcData.invitation.id,
            provider: delivery.provider,
            mode: delivery.mode,
            errorCode: delivery.errorCode,
          }),
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  return c.json(
    {
      invitation: rpcData.invitation,
      invitationUrl,
      emailDelivery: delivery,
    },
    201,
  );
});
