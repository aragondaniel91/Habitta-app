import { Hono } from 'hono';
import { z } from 'zod';
import { resolveNotificationsEnvironment } from './config/notifications-env';
import { withinRateLimit } from './http-security';
import { sendNotificationEmail } from './notifications/email-provider';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };

type ResidentRole = 'owner' | 'tenant';

export type ResidentInvitationDelivery = {
  status: 'disabled' | 'sent' | 'failed';
  recipient: string | null;
  provider: string;
  mode: string;
  providerId?: string;
  errorCode?: string;
};

type UnitContext = {
  code: string;
  buildings?: { name?: string | null } | null;
};

const invitationInputSchema = z.object({
  personId: z.string().uuid(),
  unitId: z.string().uuid(),
  role: z.enum(['owner', 'tenant']),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

const residentInvitationRpcSchema = z.object({
  invitation: z.object({
    id: z.string().uuid(),
    condominium_id: z.string().uuid(),
    person_id: z.string().uuid(),
    unit_id: z.string().uuid(),
    email: z.string().email(),
    intended_role: z.enum(['owner', 'tenant']),
    status: z.string(),
    expires_at: z.string(),
  }),
  raw_token: z.string().min(1),
});

const roleLabels: Record<ResidentRole, string> = {
  owner: 'Propietario',
  tenant: 'Inquilino',
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

const supabaseHeaders = (env: NotificationBindings, token: string) => ({
  apikey: env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const recordResidentInvitationDelivery = async ({
  env,
  token,
  invitationId,
  delivery,
}: {
  env: NotificationBindings;
  token: string;
  invitationId: string;
  delivery: ResidentInvitationDelivery;
}) => {
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/record_resident_invitation_delivery`,
      {
        method: 'POST',
        headers: supabaseHeaders(env, token),
        body: JSON.stringify({
          target_invitation_id: invitationId,
          target_status: delivery.status,
          target_provider: delivery.provider || 'unknown',
          target_mode: delivery.mode || 'disabled',
          target_error_code: delivery.errorCode ?? null,
          target_provider_id: delivery.providerId ?? null,
        }),
      },
    );

    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: 'resident_invitation_delivery_audit_failed',
          invitationId,
          status: delivery.status,
          provider: delivery.provider,
          mode: delivery.mode,
          httpStatus: response.status,
        }),
      );
      return false;
    }
    return true;
  } catch {
    console.error(
      JSON.stringify({
        event: 'resident_invitation_delivery_audit_exception',
        invitationId,
        status: delivery.status,
        provider: delivery.provider,
        mode: delivery.mode,
      }),
    );
    return false;
  }
};

const readErrorMessage = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['message', 'error', 'details']) {
    if (typeof record[key] === 'string') return record[key];
  }
  return '';
};

export const residentInvitationRoutes = new Hono<AppEnvironment>();

residentInvitationRoutes.post('/:condominiumId/resident-invitations', async (c) => {
  const condominiumIdResult = z.string().uuid().safeParse(c.req.param('condominiumId'));
  if (!condominiumIdResult.success) return c.json({ error: 'Invalid condominium identifier' }, 400);

  // Transport-level distributed limiter rejects abuse before parsing JSON, calling the resident
  // invitation RPC, generating a one-time token or attempting email. HAB-125 keeps the independent
  // database rate guard as the fail-safe for every caller, including future mobile clients.
  if (!(await withinRateLimit(c.env.INVITATION_LIMIT, c.get('userId')))) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  const parsed = invitationInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const condominiumId = condominiumIdResult.data;
  const token = c.get('token');
  const rpcResponse = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/create_resident_invitation`, {
    method: 'POST',
    headers: supabaseHeaders(c.env, token),
    body: JSON.stringify({
      target_condominium_id: condominiumId,
      target_person_id: parsed.data.personId,
      target_unit_id: parsed.data.unitId,
      target_role: parsed.data.role,
      target_expires_at: parsed.data.expiresAt ?? null,
    }),
  });

  const rawRpcData: unknown = await rpcResponse.json();
  if (!rpcResponse.ok) {
    const message = readErrorMessage(rawRpcData).toLowerCase();
    if (message.includes('resident invitation rate limit exceeded')) {
      return c.json({ error: 'Too many requests' }, 429);
    }
    return c.json({ error: 'Resident invitation could not be created' }, 400);
  }

  const rpcResult = residentInvitationRpcSchema.safeParse(rawRpcData);
  if (!rpcResult.success) {
    console.error(
      JSON.stringify({
        event: 'resident_invitation_rpc_payload_invalid',
        condominiumId,
      }),
    );
    return c.json({ error: 'Resident invitation could not be created' }, 502);
  }
  const rpcData = rpcResult.data;

  const [condominiumResponse, unitResponse] = await Promise.all([
    fetch(`${c.env.SUPABASE_URL}/rest/v1/condominiums?id=eq.${condominiumId}&select=name&limit=1`, {
      headers: supabaseHeaders(c.env, token),
    }),
    fetch(
      `${c.env.SUPABASE_URL}/rest/v1/units?id=eq.${rpcData.invitation.unit_id}&condominium_id=eq.${condominiumId}&select=code,buildings(name)&limit=1`,
      { headers: supabaseHeaders(c.env, token) },
    ),
  ]);

  const condominiums = condominiumResponse.ok
    ? ((await condominiumResponse.json()) as Array<{ name: string }>)
    : [];
  const unitRows = unitResponse.ok ? ((await unitResponse.json()) as UnitContext[]) : [];
  const condominiumName = condominiums[0]?.name ?? 'tu condominio';
  const unit = unitRows[0];
  const unitLabel = unit
    ? unit.buildings?.name
      ? `${unit.buildings.name} · ${unit.code}`
      : unit.code
    : 'la unidad asignada';
  const roleLabel = roleLabels[rpcData.invitation.intended_role];
  const appBaseUrl = c.env.APP_BASE_URL.replace(/\/$/, '');
  const invitationUrl = `${appBaseUrl}/invite/${rpcData.raw_token}`;
  const emailLogoUrl = `${appBaseUrl}/icon-192.png`;

  let notificationEnvironment;
  try {
    notificationEnvironment = resolveNotificationsEnvironment(c.env);
  } catch (error) {
    const delivery = {
      status: 'failed',
      recipient: null,
      provider: c.env.NOTIFICATIONS_EMAIL_PROVIDER ?? 'unknown',
      mode: c.env.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',
      errorCode: safeConfigurationError(error),
    } satisfies ResidentInvitationDelivery;
    console.error(
      JSON.stringify({
        event: 'resident_invitation_email_configuration_failed',
        invitationId: rpcData.invitation.id,
        provider: delivery.provider,
        mode: delivery.mode,
        errorCode: delivery.errorCode,
      }),
    );
    const auditPersisted = await recordResidentInvitationDelivery({
      env: c.env,
      token,
      invitationId: rpcData.invitation.id,
      delivery,
    });
    return c.json(
      { invitation: rpcData.invitation, invitationUrl, emailDelivery: delivery, auditPersisted },
      201,
    );
  }

  const delivery: ResidentInvitationDelivery = {
    status: 'disabled',
    recipient: null,
    provider: notificationEnvironment.emailProvider,
    mode: notificationEnvironment.emailMode,
  };

  // Intentional transactional exception: an authorized People operator explicitly creates this
  // resident access. It does not use condominium notification fan-out preferences. HAB-125 validates
  // the exact person/unit/role relationship and both transport + DB rate limits remain in force.
  if (notificationEnvironment.emailMode !== 'disabled') {
    const recipient =
      notificationEnvironment.emailMode === 'sandbox'
        ? notificationEnvironment.sandboxEmail
        : rpcData.invitation.email;
    const subjectPrefix = notificationEnvironment.emailMode === 'sandbox' ? '[HABITTA DEV] ' : '';
    const subject = `${subjectPrefix}Invitación a ${condominiumName} en Habitta`;
    const expirationLabel = new Date(rpcData.invitation.expires_at).toLocaleString('es');
    const text = [
      `Has sido invitado a ${condominiumName} como ${roleLabel} de ${unitLabel}.`,
      '',
      'Abre este enlace seguro para aceptar tu acceso a Habitta:',
      invitationUrl,
      '',
      `La invitación vence el ${expirationLabel}.`,
      'Si no esperabas esta invitación, puedes ignorar este correo.',
    ].join('\n');
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#f5f7fa;padding:32px;color:#333d4b">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:16px;overflow:hidden">
          <div style="background:#0d1b2a;padding:24px 28px;color:#ffffff">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
              <tr>
                <td style="vertical-align:middle;padding-right:10px">
                  <img src="${escapeHtml(emailLogoUrl)}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none"/>
                </td>
                <td style="vertical-align:middle;color:#ffffff;font-family:Inter,Arial,sans-serif;font-size:24px;font-weight:700;line-height:1">Habitta</td>
              </tr>
            </table>
            <div style="margin-top:10px;color:#b9c7d5;font-size:13px">Tu comunidad, en un solo lugar</div>
          </div>
          <div style="padding:28px">
            <p style="margin:0 0 8px;color:#1b4f72;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Invitación de residente</p>
            <h1 style="margin:0 0 16px;color:#0d1b2a;font-size:24px">Accede a ${escapeHtml(condominiumName)}</h1>
            <p style="line-height:1.65">La administración te invitó como <strong>${escapeHtml(roleLabel)}</strong> de <strong>${escapeHtml(unitLabel)}</strong>.</p>
            <p style="margin:24px 0">
              <a href="${escapeHtml(invitationUrl)}" style="display:inline-block;background:#28a745;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:700">Aceptar invitación</a>
            </p>
            <p style="font-size:13px;color:#667085;line-height:1.6">Este enlace es personal y vence el ${escapeHtml(expirationLabel)}. Si no esperabas esta invitación, puedes ignorar el correo.</p>
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
            deduplicationKey: `habitta-resident-invitation-${rpcData.invitation.id}`,
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
              event: 'resident_invitation_email_failed',
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
            event: 'resident_invitation_email_exception',
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

  const auditPersisted = await recordResidentInvitationDelivery({
    env: c.env,
    token,
    invitationId: rpcData.invitation.id,
    delivery,
  });

  return c.json(
    { invitation: rpcData.invitation, invitationUrl, emailDelivery: delivery, auditPersisted },
    201,
  );
});
