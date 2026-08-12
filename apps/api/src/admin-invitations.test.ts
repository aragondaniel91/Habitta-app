import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeSourceUrl = new URL('./admin-invitations.ts', import.meta.url);
const apiSourceUrl = new URL('./index.ts', import.meta.url);

describe('administrator invitation email route', () => {
  it('mounts behind the authenticated condominium API', async () => {
    const source = await readFile(apiSourceUrl, 'utf8');

    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', adminInvitationRoutes)");
  });

  it('rate-limits before parsing the request or calling Supabase', async () => {
    const source = await readFile(routeSourceUrl, 'utf8');
    const limiter = source.indexOf('withinRateLimit(c.env.INVITATION_LIMIT');
    const bodyParse = source.indexOf('invitationInputSchema.safeParse(await c.req.json())');
    const rpc = source.indexOf('rpc/create_admin_invitation');

    expect(source).toContain("return c.json({ error: 'Too many requests' }, 429)");
    expect(limiter).toBeGreaterThanOrEqual(0);
    expect(bodyParse).toBeGreaterThan(limiter);
    expect(rpc).toBeGreaterThan(bodyParse);
  });

  it('creates the invitation with the user token and uses the configured email provider', async () => {
    const source = await readFile(routeSourceUrl, 'utf8');

    expect(source).toContain('rpc/create_admin_invitation');
    expect(source).toContain("Authorization: `Bearer ${c.get('token')}`");
    expect(source).toContain('sendNotificationEmail');
    expect(source).toContain('notificationEnvironment.emailProvider');
    expect(source).toContain('habitta-admin-invitation-${rpcData.invitation.id}');
    expect(source).not.toContain('https://api.resend.com/emails');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('maps the database fail-safe invitation limit to HTTP 429', async () => {
    const source = await readFile(routeSourceUrl, 'utf8');

    expect(source).toContain("message.toLowerCase().includes('admin invitation rate limit exceeded')");
    expect(source).toContain("return c.json({ error: 'Too many requests' }, 429)");
  });

  it('keeps a backup link when email delivery is unavailable', async () => {
    const source = await readFile(routeSourceUrl, 'utf8');

    expect(source).toContain('invitationUrl');
    expect(source).toContain("status: 'disabled'");
    expect(source).toContain("delivery.status = 'failed'");
  });
});
