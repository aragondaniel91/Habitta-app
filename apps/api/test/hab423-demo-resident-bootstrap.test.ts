import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);

describe('HAB-423 Production demo resident access bootstrap', () => {
  it('uses real Auth and HAB-125 authorization semantics without email or direct membership writes', async () => {
    const script = await readFile(
      new URL('scripts/bootstrap-production-demo-residents.sh', root),
      'utf8',
    );

    expect(script).toContain('APPLY="${APPLY:-false}"');
    expect(script).toContain(
      "readonly REQUIRED_CONFIRMATION='BOOTSTRAP-HABITTA-PRODUCTION-DEMO-RESIDENTS'",
    );
    expect(script).toContain('/auth/v1/admin/users');
    expect(script).toContain("rpc_call 'create_resident_invitation'");
    expect(script).toContain("rpc_call 'accept_invitation'");
    expect(script).toContain('hab423.demo.resident.owner@habitta.invalid');
    expect(script).toContain('hab423.demo.resident.tenant@habitta.invalid');
    expect(script).toContain('CONDO_ADMIN_CREDENTIALS_FILE must have mode 600');
    expect(script).toContain('RESIDENT_CREDENTIALS_FILE must have mode 600');
    expect(script).toContain('resident_invitation_delivery_events');
    expect(script).toContain(
      'outbound-email delivery audit changed; HAB-423 must not send invitation email',
    );

    expect(script).not.toContain('/resident-invitations');
    expect(script).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(script).not.toMatch(/insert\s+into\s+public\.condominium_memberships/i);
    expect(script).not.toMatch(/update\s+public\.people/i);
    expect(script).not.toMatch(/update\s+public\.subscriptions/i);
    expect(script).not.toMatch(/insert\s+into\s+public\.payments/i);
  });
});
