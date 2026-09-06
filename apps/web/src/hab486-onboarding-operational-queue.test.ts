import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260905050000_hab486_onboarding_operational_codes.sql',
    import.meta.url,
  ),
  'utf8',
);
const onboardingHtml = readFileSync(
  new URL('../../platform-admin/onboarding.html', import.meta.url),
  'utf8',
);
const onboardingScript = readFileSync(
  new URL('../../platform-admin/onboarding.js', import.meta.url),
  'utf8',
);
const invitationRoutes = readFileSync(
  new URL('../../api/src/customer-invitation-routes.ts', import.meta.url),
  'utf8',
);

describe('HAB-486 Platform Admin onboarding operating queue', () => {
  it('derives stable blocker and next-action codes inside the authorized database read model', () => {
    expect(migration).toContain('operational_state text');
    expect(migration).toContain('blocker_code text');
    expect(migration).toContain('next_action_code text');
    expect(migration).toContain('guided_activation_pending boolean');
    expect(migration).toContain("onboarding_result #>> '{guided_activation,status}'");
    expect(migration).toContain("then 'email_delivery_failed'");
    expect(migration).toContain("then 'awaiting_customer_acceptance'");
    expect(migration).toContain("then 'awaiting_workspace_completion'");
    expect(migration).toContain("then 'pending_platform_activation'");
    expect(migration).toContain("then 'complete_commercial_activation'");
    expect(migration).toContain("then 'open_customer_360'");
  });

  it('renders the authoritative blocker and next action without guessing from browser-only text', () => {
    expect(onboardingHtml).toContain('<th>Bloqueo / próximo paso</th>');
    expect(onboardingScript).toContain('invitation.operational_state');
    expect(onboardingScript).toContain('invitation.blocker_code');
    expect(onboardingScript).toContain('invitation.next_action_code');
    expect(onboardingScript).toContain("pending_platform_activation: 'Activación pendiente'");
    expect(onboardingScript).toContain(
      "complete_commercial_activation: 'Completar activación comercial'",
    );
    expect(onboardingScript).toContain("open_customer_360: 'Abrir Customer 360'");
  });

  it('hands guided activation to the existing commercial surface and completed customers to Customer 360', () => {
    expect(onboardingScript).toContain(
      "invitation.next_action_code === 'complete_commercial_activation'",
    );
    expect(onboardingScript).toContain(
      "params.set('condominium', invitation.onboarding_condominium_id)",
    );
    expect(onboardingScript).toContain('/commercial.html?${params.toString()}');
    expect(onboardingScript).toContain('/customers.html?organization=${encodeURIComponent(');
  });

  it('preserves the narrow security boundary and never surfaces raw onboarding internals', () => {
    expect(invitationRoutes).toContain("rpcRequest(c, 'list_customer_invitations_for_platform')");
    expect(onboardingScript).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(onboardingScript).not.toContain('token_hash');
    expect(onboardingScript).not.toContain('onboarding_result');
    expect(invitationRoutes).not.toContain('onboarding_result');
    expect(invitationRoutes).not.toContain('token_hash');
  });
});
