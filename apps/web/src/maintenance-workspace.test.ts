import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8');
const navigationSource = readFileSync(
  fileURLToPath(new URL('./navigation.ts', import.meta.url)),
  'utf8',
);
const pageSource = readFileSync(
  fileURLToPath(new URL('./pages/MaintenancePage.tsx', import.meta.url)),
  'utf8',
);
const mainSource = readFileSync(fileURLToPath(new URL('./main.tsx', import.meta.url)), 'utf8');

describe('maintenance administrator workspace integration', () => {
  it('uses the shared AppShell header instead of rendering a duplicate page title', () => {
    expect(navigationSource).toContain("title: 'Activos y mantenimiento'");
    expect(appSource).toContain("currentRoute.key === 'maintenance'");
    expect(pageSource).not.toContain('<h1>');
    expect(pageSource).not.toContain('className="page-header"');
  });

  it('exposes the four operational views and real API actions', () => {
    expect(pageSource).toContain("type Tab = 'overview' | 'assets' | 'plans' | 'work-orders'");
    expect(pageSource).toContain('/maintenance/assets');
    expect(pageSource).toContain('/maintenance/plans');
    expect(pageSource).toContain('/maintenance/work-orders');
    expect(pageSource).toContain('/maintenance/generate-due');
  });

  it('loads dedicated responsive styles', () => {
    expect(mainSource).toContain("import './maintenance.css'");
  });
});
