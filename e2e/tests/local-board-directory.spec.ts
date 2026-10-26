import { expect, test } from '@playwright/test';

const email = process.env.HABITTA_LOCAL_BOARD_EMAIL;
const password = process.env.HABITTA_LOCAL_BOARD_PASSWORD;

test.describe('local board directory authenticated browser verification', () => {
  test.skip(!email || !password, 'Requires local-only test account credentials in environment');

  test('authenticated admin can navigate and paginate read-only registered buildings', async ({
    page,
  }) => {
    const target = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
    const host = new URL(target).hostname;
    test.skip(!['localhost', '127.0.0.1'].includes(host), 'Local-only verification');
    const buildingNames = Array.from({ length: 12 }, (_, index) => ({
      id: 'visual-' + (index + 1),
      name: 'Torre ' + (index + 1),
    }));
    await page.route('**/v1/condominiums/*/buildings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildingNames),
      });
    });

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/app/board-groups-preview');
    await page.locator('input[type=email]').fill(email!);
    await page.locator('input[type=password]').fill(password!);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    const directory = page.getByRole('region', { name: 'Edificios registrados' });
    await expect(directory.getByText('Torre 1', { exact: true })).toBeVisible();
    await expect(directory.locator('li')).toHaveCount(10);
    await directory.getByRole('button', { name: 'Siguiente' }).click();
    await expect(directory.locator('li')).toHaveCount(2);
    await expect(directory.getByText('Página 2 de 2')).toBeVisible();
    await directory.getByPlaceholder('Nombre del edificio registrado').fill('Torre 12');
    await expect(directory.locator('li')).toHaveCount(1);
    await expect(directory.getByText('Torre 12', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
