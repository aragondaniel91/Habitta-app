import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./pages/AuditLogPage.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('./navigation.ts', import.meta.url), 'utf8');

describe('HAB-175 administrator audit workspace contract', () => {
  it('mounts a lazy administrator-only audit module in the app shell', () => {
    expect(appSource).toContain("import('./pages/AuditLogPage')");
    expect(appSource).toContain("activeRoute.key === 'audit'");
    expect(navigationSource).toContain("path: '/app/audit'");
    expect(navigationSource).toContain("label: 'Auditoría'");
    expect(navigationSource).toContain("roles: ['condominium_admin']");
  });

  it('loads the normalized audit endpoint with server-side filters and bounded pagination', () => {
    expect(pageSource).toContain('/audit-events?');
    for (const filter of ['module', 'severity', 'actor', 'entityType', 'from', 'to']) {
      expect(pageSource).toContain(`params.set('${filter}'`);
    }
    expect(pageSource).toContain('const PAGE_SIZE = 50');
    expect(pageSource).toContain('offset: String(offset)');
  });

  it('keeps the audit workspace read-only', () => {
    expect(pageSource).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
    expect(pageSource).not.toContain('supabase.from(');
    expect(pageSource).not.toContain('/rest/v1/');
  });

  it('renders only server-returned sanitized metadata and exposes warning severity', () => {
    expect(pageSource).toContain('JSON.stringify(auditEvent.metadata');
    expect(pageSource).toContain("auditEvent.severity === 'warning'");
    expect(pageSource).toContain('Metadata segura');
  });
});
