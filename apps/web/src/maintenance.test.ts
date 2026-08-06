import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appUrl = new URL('./App.tsx', import.meta.url);
const navigationUrl = new URL('./navigation.ts', import.meta.url);
const pageUrl = new URL('./pages/MaintenancePage.tsx', import.meta.url);
const headerUrl = new URL('./maintenance-header-standard.css', import.meta.url);

describe('maintenance administrator workspace', () => {
  it('adds a real maintenance route and renders the module page', async () => {
    const [app, navigation] = await Promise.all([
      readFile(appUrl, 'utf8'),
      readFile(navigationUrl, 'utf8'),
    ]);
    expect(navigation).toContain("key: 'maintenance'");
    expect(navigation).toContain("path: '/app/maintenance'");
    expect(app).toContain("currentRoute.key === 'maintenance'");
    expect(app).toContain('<MaintenancePage');
  });

  it('uses authenticated API endpoints for operational mutations', async () => {
    const page = await readFile(pageUrl, 'utf8');
    expect(page).toContain('/maintenance/assets`');
    expect(page).toContain('/maintenance/plans`');
    expect(page).toContain('/maintenance/work-orders`');
    expect(page).toContain('/maintenance/generate`');
    expect(page).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(page).not.toContain('supabase.rpc');
  });

  it('follows the approved module header contract', async () => {
    const [page, header] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(headerUrl, 'utf8'),
    ]);
    expect(page).toContain('className="maintenance-overview"');
    expect(page).toContain('className="maintenance-kicker"');
    expect(header).toContain('border-bottom: 1px solid var(--border)');
    expect(header).toContain('font-size: var(--module-header-title-size)');
  });
});
