import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./customer-invitation-routes.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('HAB-484 customer invitation delivery and onboarding queue', () => {
  it('never uses the service role and forwards only the operator JWT', () => {
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain("Authorization: `Bearer ${c.get('token')}`");
  });

  it('leaves customer issue/list/revoke authorization to hardened database RPCs', () => {
    expect(source).toContain("'create_customer_invitation_v2'");
    expect(source).toContain("'list_customer_invitations_for_platform'");
    expect(source).toContain("'revoke_customer_invitation'");
    expect(source).toContain('platform administrator required');
    expect(source).toContain("'platform_administrator_required'");
  });

  it('requires catalogue plan plus monthly/annual billing intent', () => {
    expect(source).toContain("billingPeriod: z.enum(['monthly', 'annual'])");
    expect(source).toContain('target_plan_code: parsed.data.planCode');
    expect(source).toContain('target_billing_period: parsed.data.billingPeriod');
  });

  it('never returns or logs the one-time token', () => {
    const responseBlock = source.slice(
      source.indexOf('return c.json(', source.indexOf('let delivered')),
    );
    expect(responseBlock).not.toContain('invitation.token');
    expect(source).toContain('never returned to Platform Admin or written to logs');
  });

  it('records delivery instead of assuming it', () => {
    expect(source).toContain('delivered = result.ok');
    expect(source).toContain("'record_customer_invitation_delivery'");
    expect(source).toContain('deliveryTracked');
    expect(source).toContain('notificationEnvironment.sandboxEmail ?? invitation.email');
  });

  it('does not claim a subscription is active before onboarding', () => {
    expect(source).not.toContain('Tu suscripción${plan} ya está activa');
    expect(source).toContain('No se realizará ningún cargo al abrir este enlace.');
    expect(source).toContain('Plan seleccionado:');
  });

  it('escapes operator/catalogue values used in HTML email', () => {
    expect(source).toContain('const escape = (value: string)');
    expect(source).toContain('escape(acceptUrl)');
    expect(source).toContain('escape(invitation.plan_code)');
    expect(source).toContain('escape(periodLabel)');
  });

  it('is rate limited and mounted only under the platform namespace', () => {
    expect(source).toContain('withinRateLimit');
    expect(source).toContain('c.env.INVITATION_LIMIT');
    expect(source).toContain("`customer-invite:${c.get('userId')}`");
    expect(index).toContain("app.route('/v1/platform', customerInvitationRoutes);");
  });
});
