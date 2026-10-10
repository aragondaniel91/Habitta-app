import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./maintenance-routes.ts', import.meta.url)),
  'utf8',
);
const operationsSource = readFileSync(
  fileURLToPath(new URL('./operations-routes-base.ts', import.meta.url)),
  'utf8',
);
const operationsWrapperSource = readFileSync(
  fileURLToPath(new URL('./operations-routes.ts', import.meta.url)),
  'utf8',
);
const idempotencyMigration = readFileSync(
  fileURLToPath(
    new URL(
      '../../../supabase/migrations/20261008110000_request_work_order_idempotency.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('maintenance routes contract', () => {
  it('mounts maintenance under the authenticated condominium operations router', () => {
    expect(operationsSource).toContain("import { maintenanceRoutes } from './maintenance-routes'");
    expect(operationsSource).toContain("operationsRoutes.route('/', maintenanceRoutes)");
    expect(operationsWrapperSource).toContain(
      "import { operationsRoutes as baseOperationsRoutes } from './operations-routes-base'",
    );
    expect(operationsWrapperSource).toContain(
      "baseOperationsRoutes.route('/', maintenanceFinancialRoutes)",
    );
  });

  it('keeps maintenance resources condominium-scoped', () => {
    expect(source).toContain("maintenanceRoutes.get('/:id/maintenance/assets'");
    expect(source).toContain("maintenanceRoutes.get('/:id/maintenance/plans'");
    expect(source).toContain("maintenanceRoutes.get('/:id/maintenance/work-orders'");
    expect(source).toContain('condominium_id=eq.${condominiumId}');
  });

  it('uses security-definer RPCs for every mutation', () => {
    expect(source).toContain("rpc(c, 'create_maintenance_asset'");
    expect(source).toContain("rpc(c, 'update_maintenance_asset'");
    expect(source).toContain("rpc(c, 'create_maintenance_plan'");
    expect(source).toContain("rpc(c, 'update_maintenance_plan'");
    expect(source).toContain("rpc(c, 'create_maintenance_work_order'");
    expect(source).toContain("rpc(c, 'update_maintenance_work_order'");
    expect(source).toContain("rpc(c, 'transition_maintenance_work_order'");
    expect(source).toContain("rpc(c, 'add_maintenance_service_log'");
    expect(source).toContain("rpc(c, 'generate_due_maintenance_work_orders'");
    expect(source).not.toMatch(
      /rest\(c,\s*'maintenance_(assets|plans|work_orders|service_logs)'\s*,\s*\{\s*method:\s*'(POST|PUT|PATCH|DELETE)'/s,
    );
  });

  it('requires optimistic versions for editable maintenance records', () => {
    expect(source).toContain('const assetUpdateSchema');
    expect(source).toContain('const planUpdateSchema');
    expect(source).toContain('const workOrderUpdateSchema');
    expect(
      source.match(/expectedVersion: z\.number\(\)\.int\(\)\.positive\(\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(source).toContain('expected_version: parsed.expectedVersion');
  });

  it('filters linked orders and forwards the request idempotency intent without weakening tenancy', () => {
    expect(source).toContain(
      "const requestId = c.req.query('requestId') ? uuid.parse(c.req.query('requestId')) : null",
    );
    expect(source).toContain('requestId ? `request_id=eq.${requestId}` : null');
    expect(source).toContain('idempotencyKey: uuid.optional()');
    expect(source).toContain('idempotency_key: parsed.idempotencyKey ?? null');
    expect(idempotencyMigration).toContain('pg_advisory_xact_lock');
    expect(idempotencyMigration).toContain('maintenance_work_orders_request_intent_unique');
    expect(idempotencyMigration).toContain('public.can_manage_maintenance(target_condominium)');
  });

  it('validates lifecycle, location and service cost invariants at the edge', () => {
    expect(source).toContain("z.enum(['scheduled', 'in_progress', 'completed', 'cancelled'])");
    expect(source).toContain('A completion or cancellation note is required');
    expect(source).toContain('An asset can belong to a building or a unit, not both');
    expect(source).toContain('Warranty date must not precede installation date');
    expect(source).toContain('Amount and currency must be provided together');
    expect(source).toContain('A service performer is required');
  });

  it('maps authorization, missing records and optimistic conflicts consistently', () => {
    expect(source).toContain("value.code === '42501'");
    expect(source).toContain("value.message?.includes('version conflict')");
    expect(source).toContain("value.message?.includes('not found')");
  });

  it('treats malformed mutation bodies as client validation errors', () => {
    expect(source).toContain("return c.json({ error: 'Invalid JSON body' }, 400)");
  });
});
