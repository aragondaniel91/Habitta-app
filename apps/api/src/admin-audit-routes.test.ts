import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./admin-audit-routes.ts', import.meta.url)),
  'utf8',
);
const wrapper = readFileSync(
  fileURLToPath(new URL('./operations-routes.ts', import.meta.url)),
  'utf8',
);

describe('administrator audit route contract', () => {
  it('mounts the audit route under authenticated condominium operations', () => {
    expect(wrapper).toContain("import { adminAuditRoutes } from './admin-audit-routes'");
    expect(wrapper).toContain("baseOperationsRoutes.route('/', adminAuditRoutes)");
  });

  it('exposes one read-only audit endpoint', () => {
    expect(source).toContain("adminAuditRoutes.get('/:id/audit-events'");
    expect(source).not.toMatch(/adminAuditRoutes\.(post|put|patch|delete)\(/);
  });

  it('delegates authorization and normalization to the database RPC', () => {
    expect(source).toContain("rpc(c, 'list_admin_audit_events'");
    expect(source).toContain('target_condominium: condominiumId.data');
    expect(source).toContain("error.message?.includes('not authorized')");
  });

  it('bounds pagination and validates filters before calling Supabase', () => {
    expect(source).toContain('.int().min(1).max(100).default(50)');
    expect(source).toContain('.int().min(0).default(0)');
    expect(source).toContain("severity: z.enum(['info', 'warning']).optional()");
    expect(source).toContain('filter_severity: query.data.severity ?? null');
    expect(source).toContain("return c.json({ error: 'Invalid audit date range' }, 400)");
  });

  it('does not accept arbitrary module names', () => {
    for (const module of [
      'payments',
      'expenses',
      'treasury',
      'maintenance',
      'governance',
      'assemblies',
    ]) {
      expect(source).toContain(`'${module}'`);
    }
  });
});
