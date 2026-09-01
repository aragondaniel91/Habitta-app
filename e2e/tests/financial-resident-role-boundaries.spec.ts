import { expect, test, type Page } from '@playwright/test';

const requiredEnvironment = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_FIXTURE_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const password = process.env.E2E_FIXTURE_PASSWORD ?? '';

const emails = {
  administrator: 'habitta-e2e-admin@example.invalid',
  family: 'habitta-e2e-family@example.invalid',
  authorized: 'habitta-e2e-authorized@example.invalid',
};

const ids = {
  primaryUnitA102: '33333333-3333-4333-8333-333333333332',
};

// Landing on /app/dashboard is what authentication means here, and nothing more. This helper also
// signs in the administrator, whose dashboard is the administrative one and never carries the
// resident "Inicio" heading -- so asserting it here made a resident-specific detail into a generic
// auth contract. The historical financial specs authenticate the same way, on the URL alone.
//
// The heading is still asserted where it genuinely is the contract: the deep-link test below, which
// requires a restricted resident to land on the resident home.
const signIn = async (page: Page, email: string) => {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('input[type="password"][autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/app\/dashboard/);
};

const forbiddenResidentApi = (url: string) => {
  const pathname = new URL(url).pathname;
  return /\/v1\/condominiums\/[^/]+\/(?:receivables(?:\/summary)?|payments|requests|governance-proposals)(?:\/|$)/.test(
    pathname,
  );
};

const assertRestrictedResident = async (
  page: Page,
  email: string,
  standing: 'Familiar' | 'Ocupante autorizado',
) => {
  const forbiddenRequests: string[] = [];
  page.on('request', (request) => {
    if (forbiddenResidentApi(request.url()))
      forbiddenRequests.push(new URL(request.url()).pathname);
  });

  await signIn(page, email);
  await expect(page.getByText(standing, { exact: true })).toBeVisible();
  await expect(page.getByText(/E2E-A102/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acceso residencial' })).toBeVisible();

  for (const forbiddenText of [
    'Saldo pendiente',
    'Próxima cuota pendiente',
    'Estado de cuenta',
    'Pagos y recibos',
    'Solicitudes abiertas',
    'Votaciones pendientes',
  ]) {
    await expect(page.getByText(forbiddenText, { exact: true })).toHaveCount(0);
  }

  // Let the dashboard settle so the network assertion covers effects as well as first paint.
  await page.waitForLoadState('networkidle');
  expect(forbiddenRequests).toEqual([]);

  // These are the only community modules HAB-418 deliberately exposes to restricted residents.
  await page.goto('/app/documents');
  await expect(page).toHaveURL(/\/app\/documents$/);
  // Pinned to the page's own title. A bare name match is a substring match, so 'Documentos' also
  // selected the empty-state heading 'No hay documentos para mostrar' and Playwright refused the
  // ambiguity. Naming the level asserts the page rendered, which is what this line was for.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Documentos', exact: true }),
  ).toBeVisible();

  await page.goto('/app/announcements');
  await expect(page).toHaveURL(/\/app\/announcements$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Anuncios', exact: true }),
  ).toBeVisible();

  // Financial, governance, request and directory-style community deep links are normalized to an
  // allowed URL, not merely hidden while the forbidden path remains in the address bar.
  for (const path of [
    '/app/fees',
    '/app/payments',
    '/app/requests',
    '/app/governance',
    '/app/community',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  }

  await page.waitForLoadState('networkidle');
  expect(forbiddenRequests).toEqual([]);
};

test.describe('HAB-418 restricted resident browser boundaries', () => {
  test.skip(
    missingEnvironment.length > 0,
    `Supabase local y fixture financiero requeridos: ${missingEnvironment.join(', ')}`,
  );

  test('family member gets a real resident dashboard without financial or operational leakage', async ({
    page,
  }) => {
    await assertRestrictedResident(page, emails.family, 'Familiar');
  });

  test('authorized occupant gets the same restricted resident boundary', async ({ page }) => {
    await assertRestrictedResident(page, emails.authorized, 'Ocupante autorizado');
  });

  test('People admin UI actually offers both new invitation roles on their compatible unit', async ({
    page,
  }) => {
    await signIn(page, emails.administrator);
    await page.goto('/app/people');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Personas', exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Habitta E2E Family/ }).click();
    await page.getByRole('button', { name: 'Acceso digital' }).click();
    const roleSelect = page.getByLabel('Rol que recibirá');
    await expect(roleSelect.locator('option[value="family_member"]')).toHaveText('Familiar');
    await expect(roleSelect.locator('option[value="authorized_occupant"]')).toHaveText(
      'Ocupante autorizado',
    );
    await roleSelect.selectOption('family_member');
    await expect(page.getByLabel('Unidad vinculada')).toHaveValue(ids.primaryUnitA102);
    await expect(page.getByText(/E2E-A102 · Familiar/)).toBeVisible();

    await page.getByRole('button', { name: /Habitta E2E Authorized/ }).click();
    await page.getByRole('button', { name: 'Acceso digital' }).click();
    await page.getByLabel('Rol que recibirá').selectOption('authorized_occupant');
    await expect(page.getByLabel('Unidad vinculada')).toHaveValue(ids.primaryUnitA102);
    await expect(page.getByText(/E2E-A102 · Ocupante autorizado/)).toBeVisible();
  });
});
