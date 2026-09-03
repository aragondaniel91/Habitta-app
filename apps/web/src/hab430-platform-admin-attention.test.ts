import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const adminApp = readFileSync(
  fileURLToPath(new URL('../../platform-admin/app.js', import.meta.url)),
  'utf8',
);

describe('HAB-430 Platform Admin command-center attention', () => {
  it('keeps the existing narrow Postgres-backed read boundary', () => {
    expect(adminApp).toContain('/rest/v1/rpc/get_platform_operations_overview');
    expect(adminApp).toContain('/rest/v1/platform_admins?select=user_id');
    expect(adminApp).not.toContain('service_role');
  });

  it('does not turn demo or internal condominiums into commercial attention', () => {
    expect(adminApp).toContain("return row.account_type === 'customer';");
    expect(adminApp).toContain('return isBillableCustomer(row) && !row.subscription_id;');
    expect(adminApp).toContain('if (!isBillableCustomer(row)) return false;');
    expect(adminApp).toContain("noSubscriptionLabel.textContent = 'Clientes sin suscripción';");
  });

  it('lets the operator drill from attention into the exact portfolio slice', () => {
    expect(adminApp).toContain("applyAttentionFilter('trial_ending')");
    expect(adminApp).toContain("applyAttentionFilter('no_subscription')");
    expect(adminApp).toContain("attentionFilter === 'trial_ending'");
    expect(adminApp).toContain("attentionFilter === 'no_subscription'");
    expect(adminApp).toContain("card.setAttribute('role', 'button')");
    expect(adminApp).toContain("card.setAttribute('tabindex', '0')");
    expect(adminApp).toContain("card.setAttribute('aria-pressed', 'false')");
    expect(adminApp).toContain("event.key !== 'Enter' && event.key !== ' '");
  });

  it('returns to ordinary portfolio filtering after a manual filter change', () => {
    expect(adminApp).toContain('const handleManualFilter = () => {');
    expect(adminApp).toContain('attentionFilter = null;');
    expect(adminApp).toContain('updateAttentionState();');
    expect(adminApp).toContain('renderTable(filteredRows());');
  });
});
