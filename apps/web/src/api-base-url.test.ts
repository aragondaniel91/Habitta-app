import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const apiClientUrl = new URL('./lib/api.ts', import.meta.url);
const notificationApiUrl = new URL('./features/notifications/api.ts', import.meta.url);
const paymentApiUrl = new URL('./features/payments/api.ts', import.meta.url);

describe('API base URL configuration', () => {
  it('prefers the release variable before the legacy variable and localhost fallback', async () => {
    const source = await readFile(apiClientUrl, 'utf8');
    const configured = source.indexOf('import.meta.env.VITE_API_BASE_URL');
    const legacy = source.indexOf('import.meta.env.VITE_API_URL');
    const local = source.indexOf("'http://localhost:8787'");

    expect(configured).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(configured);
    expect(local).toBeGreaterThan(legacy);
    expect(source).toContain('fetch(`${apiBaseUrl}${path}`');
    expect(source).toContain('export const apiBaseUrl');
  });

  it('keeps notifications and payments on the shared API base URL', async () => {
    const [notifications, payments] = await Promise.all([
      readFile(notificationApiUrl, 'utf8'),
      readFile(paymentApiUrl, 'utf8'),
    ]);

    expect(notifications).toContain("import { apiRequest } from '../../lib/api'");
    expect(payments).toContain("import { apiBaseUrl } from '../../lib/api'");

    for (const source of [notifications, payments]) {
      expect(source).not.toContain('import.meta.env.VITE_API_URL');
      expect(source).not.toContain('http://localhost:8787');
    }
  });
});
