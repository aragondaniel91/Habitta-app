import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
const invitation = readFileSync(
  new URL('./components/CustomerInvitationExperience.tsx', import.meta.url),
  'utf8',
);
const invitationClient = readFileSync(
  new URL('./lib/customerInvitation.ts', import.meta.url),
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
const customersHtml = readFileSync(
  new URL('../../platform-admin/customers.html', import.meta.url),
  'utf8',
);
const securityEntry = readFileSync(
  new URL('../../api/src/security-entry.ts', import.meta.url),
  'utf8',
);

describe('HAB-484 pilot-ready customer provisioning', () => {
  it('routes the emailed customer invitation before the normal app shell', () => {
    expect(main).toContain("pathname !== '/app/bienvenida'");
    expect(main).toContain("new URLSearchParams(search).get('invitacion')");
    expect(main).toContain('<CustomerInvitationEntry rawToken={customerToken} />');
    expect(main).toContain('getMyCustomerOnboardingInvitation');
    expect(main).toContain('habitta_customer_invitation_id');
    expect(main).toContain("window.location.replace('/')");
  });

  it('uses the invitation-aware auth flow without persisting the raw token', () => {
    expect(invitation).toContain('getCustomerInvitationPreview(rawToken)');
    expect(invitation).toContain('acceptCustomerInvitation(rawToken)');
    expect(invitation).toContain("registration_source: 'customer_invitation'");
    expect(invitation).toContain('/app/bienvenida?invitacion=');
    expect(invitation).not.toContain('localStorage');
    expect(invitation).not.toContain('sessionStorage');
    expect(invitationClient).toContain("rpc('get_my_customer_onboarding_invitation')");
  });

  it('turns Platform Admin into an onboarding operating surface', () => {
    expect(onboardingHtml).toContain('id="new-customer-button"');
    expect(onboardingHtml).toContain('Onboarding de clientes');
    expect(onboardingHtml).toContain('id="onboarding-body"');
    expect(onboardingHtml).toContain('id="new-customer-plan"');
    expect(onboardingHtml).toContain('id="new-customer-period"');
    expect(customersHtml).toContain('href="/onboarding.html?new=1">+ Nuevo cliente</a>');
    expect(customersHtml).toContain('href="/onboarding.html">Onboarding</a>');
  });

  it('uses the Worker for email delivery but keeps catalogue/auth reads on safe existing boundaries', () => {
    expect(onboardingScript).toContain("workerRequest('/v1/platform/customer-invitations'");
    expect(onboardingScript).toContain('/rest/v1/plans?select=');
    expect(onboardingScript).toContain('Authorization: `Bearer ${accessToken}`');
    expect(onboardingScript).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(onboardingScript).not.toContain('token_hash');
    expect(onboardingScript).not.toContain('invitation.token');
  });

  it('preserves a clear handoff from completed onboarding to Customer 360', () => {
    expect(onboardingScript).toContain('/customers.html?organization=${encodeURIComponent(');
    expect(onboardingScript).toContain("state === 'completed'");
    expect(onboardingScript).toContain('Customer 360 disponible');
  });

  it('admits Platform Admin to only the customer-onboarding Worker family', () => {
    expect(securityEntry).toContain("const PLATFORM_ADMIN_ORIGIN = 'https://admin.mihabitta.com'");
    expect(securityEntry).toContain(
      "const CUSTOMER_ONBOARDING_API_PATH = '/v1/platform/customer-invitations'",
    );
    expect(securityEntry).toContain('path.startsWith(CUSTOMER_ONBOARDING_API_PATH)');
    expect(securityEntry).toContain('normalized === PLATFORM_ADMIN_ORIGIN');
    expect(securityEntry).not.toContain(
      'CORS_ALLOWED_ORIGINS: https://app.mihabitta.com,https://admin.mihabitta.com',
    );
  });
});
