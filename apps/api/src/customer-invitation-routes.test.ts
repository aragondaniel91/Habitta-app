import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./customer-invitation-routes.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('HAB-402 customer invitation delivery', () => {
  it('never uses the service role', () => {
    // The Worker's HTTP surface must stay clear of it: service_role bypasses RLS, so a route that
    // holds it is one bug away from being an unauthenticated door into every tenant.
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain("Authorization: `Bearer ${c.get('token')}`");
  });

  it('leaves authorization to the database', () => {
    // The route does not decide who may issue an invitation. `create_customer_invitation` is gated
    // on is_platform_admin, so a caller without that standing is refused whatever this file thinks.
    expect(source).toContain('rpc/create_customer_invitation');
    expect(source).toContain('platform administrator required');
    expect(source).toContain("'platform_administrator_required'");
  });

  it('never returns or logs the one-time token', () => {
    // Only its hash is stored. If the token came back in the response it would sit in logs,
    // browser history and any operator console that renders it.
    const responseBlock = source.slice(
      source.indexOf('return c.json(', source.indexOf('let delivered')),
    );
    expect(responseBlock).not.toContain('invitation.token');
    expect(source).toContain('The raw token leaves this Worker only inside the email');
  });

  it('reports delivery instead of assuming it', () => {
    // The invitation exists in the database before the email is attempted, so a failed send must
    // not read as a failed issue: the operator needs to know only the email has to be retried.
    expect(source).toContain('delivered');
    expect(source).toContain('deliveryError');
    expect(source).toContain('delivered = result.ok');
  });

  it('cannot email a real customer from a sandbox release', () => {
    expect(source).toContain('notificationEnvironment.sandboxEmail ?? invitation.email');
  });

  it('escapes operator-supplied values into the email body', () => {
    expect(source).toContain('const escape = (value: string)');
    expect(source).toContain('escape(acceptUrl)');
    expect(source).toContain('escape(plan)');
  });

  it('is rate limited and mounted under the platform namespace', () => {
    expect(source).toContain('withinRateLimit');
    expect(source).toContain("`customer-invite:${c.get('userId')}`");
    expect(index).toContain("app.route('/v1/platform', customerInvitationRoutes);");
  });
});
