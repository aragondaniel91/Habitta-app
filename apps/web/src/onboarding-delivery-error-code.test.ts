import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const onboardingScript = readFileSync(
  new URL('../../platform-admin/onboarding.js', import.meta.url),
  'utf8',
);
const onboardingStyles = readFileSync(
  new URL('../../platform-admin/onboarding.css', import.meta.url),
  'utf8',
);

/*
 * Reported from production: three invitations to the same address all showed "Falló" with no
 * further detail, so diagnosing the cause meant opening DevTools, finding the
 * /v1/platform/customer-invitations network response, and reading delivery_error_code by hand
 * (e.g. "zeptomail_401_TM_4001"). The API already returns that field (customer-invitation-routes.ts
 * CustomerInvitationListItem.delivery_error_code) — the admin table just never rendered it. Show it
 * next to "Requiere reenvío" so a failed send is self-diagnosable from the queue itself.
 */
describe('Platform Admin onboarding surfaces the email delivery_error_code', () => {
  it('renders the provider error code next to the resend hint for failed deliveries', () => {
    expect(onboardingScript).toContain(
      "invitation.delivery_status === 'failed' && invitation.delivery_error_code",
    );
    expect(onboardingScript).toContain("errorCode.className = 'onboarding-error-code'");
    expect(onboardingScript).toContain('errorCode.textContent = invitation.delivery_error_code');
    expect(onboardingScript).toContain('Código del proveedor de email');
  });

  it('styles the error code as a distinguishable, copyable chip', () => {
    expect(onboardingStyles).toContain('.onboarding-error-code');
    expect(onboardingStyles).toContain('user-select: all');
  });
});
