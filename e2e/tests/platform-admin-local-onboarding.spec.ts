import { expect, test, type Page } from '@playwright/test';

const platformAdminUrl = 'http://127.0.0.1:4174';
const session = { access_token: 'local-platform-admin-session', token_type: 'bearer' };
const now = Date.now();
const futureExpiry = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

const plans = [
  { code: 'essential', name: 'Esencial', catalog_monthly_usd: 29, catalog_annual_usd: 290 },
];
const operations = [
  {
    organization_id: 'org-360', organization_name: 'Condominio Aurora', account_type: 'customer',
    condominium_id: 'condo-360', condominium_name: 'Aurora Central', active_unit_count: 24,
    membership_count: 31, building_count: 2, subscription_id: 'sub-360', subscription_status: 'active',
    trial_ends_at: null, current_period_end: futureExpiry, plan_name: 'Esencial', plan_code: 'essential',
    billing_period: 'monthly', contracted_period_amount: 29, catalog_reference_amount: 29,
    currency: 'USD', commercial_status: 'confirmed', billing_consent_recorded: true,
    billing_method_ready: true, auto_bill_enabled: false, created_at: new Date(now).toISOString(),
  },
];
const commercial = [{ ...operations[0], effective_period_amount: 29, commercial_status: 'confirmed' }];
const customer360 = {
  organization: { id: 'org-360', name: 'Condominio Aurora', account_type: 'customer', billable: true },
  condominiums: [{
    id: 'condo-360', name: 'Aurora Central', active_unit_count: 24, membership_count: 31,
    terms: { plan_name: 'Esencial', plan_code: 'essential', billing_period: 'monthly', contracted_period_amount: 29, currency: 'USD' },
    subscription: { status: 'active', current_period_end: futureExpiry }, effective_period_amount: 29,
    billing_readiness: { consent_recorded: true, method_ready: true, auto_bill_enabled: false }, attention: {},
  }],
  adjustment_history: [],
  commercial_history: [{ created_at: new Date(now).toISOString(), event_type: 'Contrato confirmado', actor_user_id: 'operator-1' }],
};

function invitation(status: 'pending' | 'accepted' | 'completed', email: string) {
  return {
    id: `invite-${status}`, email, plan_code: 'essential', billing_period: 'monthly', status,
    operational_state: status, delivery_status: 'pending', created_at: new Date(now).toISOString(),
    expires_at: futureExpiry, reference: `LOCAL-${status}`, blocker_code: status === 'pending'
      ? 'awaiting_customer_acceptance' : status === 'accepted' ? 'awaiting_workspace_completion' : 'none',
    ...(status === 'completed' ? { onboarding_completed_at: new Date(now).toISOString() } : {}),
  };
}

async function seedAndMock(page: Page) {
  let submittedExpiry = '';
  const invitations = [
    invitation('pending', 'pendiente@example.test'), invitation('accepted', 'aceptada@example.test'),
    invitation('completed', 'completada@example.test'),
  ];
  await page.addInitScript((value) => sessionStorage.setItem('habitta-admin-session', JSON.stringify(value)), session);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== 'platform-admin-e2e.invalid') return route.continue();
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.includes('/platform_admins')) return json([{ user_id: 'local-platform-admin' }]);
    if (url.pathname.includes('/plans')) return json(plans);
    if (url.pathname.endsWith('/get_platform_operations_overview')) return json(operations);
    if (url.pathname.endsWith('/get_platform_commercial_overview')) return json(commercial);
    if (url.pathname.endsWith('/get_platform_customer_360')) return json(customer360);
    if (url.pathname.endsWith('/platform_list_commercial_offers')) return json([]);
    if (url.pathname.endsWith('/v1/platform/customer-invitations') && request.method() === 'GET') return json({ invitations });
    if (url.pathname.endsWith('/v1/platform/customer-invitations') && request.method() === 'POST') {
      const payload = request.postDataJSON() as { email: string; planCode: string; billingPeriod: string; expiresAt: string };
      submittedExpiry = payload.expiresAt;
      invitations.unshift({ ...invitation('pending', payload.email), id: 'invite-submitted', plan_code: payload.planCode, billing_period: payload.billingPeriod, expires_at: payload.expiresAt });
      return json({ invitation: invitations[0] });
    }
    throw new Error(`Unexpected local E2E request: ${request.method()} ${url.pathname}`);
  });
  return { submittedExpiry: () => submittedExpiry };
}

test.beforeEach(async ({ request }, testInfo) => {
  if (!process.env.E2E_BASE_URL) return;
  try {
    const response = await request.get(platformAdminUrl, { timeout: 1_000 });
    testInfo.skip(!response.ok(), 'Platform Admin local server is unavailable for this local-only suite.');
  } catch {
    testInfo.skip(true, 'Platform Admin local server is unavailable for this local-only suite.');
  }
});

test('submits the real onboarding form and renders pending, accepted, and completed states', async ({ page }) => {
  const harness = await seedAndMock(page); // Must run before the first navigation: the app redirects without this session.
  await page.goto('/onboarding.html');

  await expect(page.locator('#onboarding-body').getByText('Invitada', { exact: true })).toHaveCount(1);
  await expect(page.locator('#onboarding-body').getByText('Aceptada', { exact: true })).toHaveCount(1);
  await expect(page.locator('#onboarding-body').getByText('Completada', { exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: /Nuevo cliente/ }).click();
  await page.locator('#new-customer-email').fill('nueva@example.test');
  await page.locator('#new-customer-reference').fill('HAB-484-LOCAL');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText('nueva@example.test')).toBeVisible();
  expect(new Date(harness.submittedExpiry()).getTime()).toBeGreaterThan(now);
});

test('renders Customer 360 and Comercial content with their cross-navigation links', async ({ page }) => {
  await seedAndMock(page);
  await page.goto('/customers.html?organization=org-360');
  await expect(page.getByText('Customer 360', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Condominio Aurora' })).toBeVisible();
  await expect(page.getByText('Aurora Central', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Onboarding' })).toHaveAttribute('href', '/onboarding.html');
  await expect(page.getByRole('link', { name: 'Comercial' }).first()).toHaveAttribute('href', '/commercial.html');

  await page.goto('/commercial.html?organization=org-360&condominium=condo-360');
  await expect(page.getByRole('heading', { name: 'Acciones comerciales' })).toBeVisible();
  await expect(page.getByText('Condominio Aurora', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Customer 360/ })).toHaveAttribute('href', /customers\.html\?organization=org-360/);
  await expect(page.getByRole('link', { name: 'Actividad' }).first()).toHaveAttribute('href', /commercial\.html\?view=activity/);
});
