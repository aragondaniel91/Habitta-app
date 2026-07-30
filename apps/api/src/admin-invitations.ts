import { Hono } from 'hono';
import { z } from 'zod';
import { resolveNotificationsEnvironment } from './config/notifications-env';
import { sendNotificationEmail } from './notifications/email-provider';
import type { NotificationBindings } from './notifications/types';

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
  providerId?: string;
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

export const adminInvitationRoutes = new Hono<AppEnvironment>();

adminInvitationRoutes.post('/:condominiumId/admin-invitations', async (c) => {
  const condominiumIdResult = z.string().uuid().safeParse(c.req.param('condominiumId'));
  if (!condominiumIdResult.success) return c.json({ error: 'Invalid condominium identifier' }, 400);

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

  const notificationEnvironment = resolveNotificationsEnvironment(c.env);
  const delivery: InvitationDelivery = {
    status: 'disabled',
    recipient: null,
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
            <strong style="font-size:22px">Habitta</strong>
            <div style="margin-top:4px;color:#b9c7d5;font-size:13px">Gestión de condominios</div>
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
        }
      } catch {
        delivery.status = 'failed';
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