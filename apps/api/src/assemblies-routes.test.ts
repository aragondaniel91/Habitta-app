import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./assemblies-routes.ts', import.meta.url)),
  'utf8',
);
const wrapper = readFileSync(
  fileURLToPath(new URL('./operations-routes.ts', import.meta.url)),
  'utf8',
);

describe('assemblies routes contract', () => {
  it('mounts assemblies under authenticated condominium operations', () => {
    expect(wrapper).toContain("import { assembliesRoutes } from './assemblies-routes'");
    expect(wrapper).toContain("baseOperationsRoutes.route('/', assembliesRoutes)");
  });

  it('keeps all assembly reads condominium-scoped', () => {
    expect(source).toContain("assembliesRoutes.get('/:id/assemblies'");
    expect(source).toContain('condominium_id=eq.${condominiumId}');
    expect(source).toContain('assembly_id=eq.${assemblyId}');
  });

  it('exposes action items inside the existing assembly resource', () => {
    expect(source).toContain(
      "assembliesRoutes.get('/:id/assemblies/:assemblyId/action-items'",
    );
    expect(source).toContain(
      "assembliesRoutes.post('/:id/assemblies/:assemblyId/action-items'",
    );
    expect(source).toContain(
      "assembliesRoutes.patch('/:id/assemblies/:assemblyId/action-items/:actionItemId'",
    );
    expect(source).toContain(
      "'/:id/assemblies/:assemblyId/action-items/:actionItemId/transition'",
    );
    expect(source).toContain(
      'assembly_action_items?condominium_id=eq.${condominiumId}',
    );
  });

  it('uses lifecycle RPCs for every sensitive write', () => {
    expect(source).toContain("rpc(c, 'create_assembly'");
    expect(source).toContain("rpc(c, 'add_assembly_agenda_item'");
    expect(source).toContain("rpc(c, 'transition_assembly'");
    expect(source).toContain("rpc(c, 'record_assembly_attendance'");
    expect(source).toContain("rpc(c, 'save_assembly_minutes'");
    expect(source).toContain("rpc(c, 'publish_assembly_minutes'");
    expect(source).toContain("rpc(c, 'create_assembly_resolution'");
    expect(source).toContain("rpc(c, 'publish_assembly_resolution'");
    expect(source).toContain("rpc(c, 'create_assembly_action_item'");
    expect(source).toContain("rpc(c, 'update_assembly_action_item'");
    expect(source).toContain("rpc(c, 'transition_assembly_action_item'");
    expect(source).not.toMatch(
      /rest\(c,\s*'(assemblies|assembly_agenda_items|assembly_attendance|assembly_resolutions|assembly_action_items)'\s*,\s*\{\s*method:\s*'(POST|PUT|PATCH|DELETE)'/s,
    );
  });

  it('requires optimistic versions for lifecycle, minutes and action item mutations', () => {
    expect(
      source.match(/expectedVersion: z\.number\(\)\.int\(\)\.positive\(\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(5);
    expect(source).toContain('expected_version: parsed.expectedVersion');
  });

  it('validates action item status and operational link inputs', () => {
    expect(source).toContain(
      "z.enum(['open', 'in_progress', 'completed', 'cancelled'])",
    );
    expect(source).toContain('resolutionId: optionalUuid');
    expect(source).toContain('serviceRequestId: optionalUuid');
    expect(source).toContain('maintenanceWorkOrderId: optionalUuid');
    expect(source).toContain('next_status: parsed.status');
  });

  it('does not expose the internal eligibility-capture RPC', () => {
    expect(source).not.toContain("rpc(c, 'capture_assembly_eligibility'");
  });

  it('maps authorization and version conflicts consistently', () => {
    expect(source).toContain("value.code === '42501'");
    expect(source).toContain("value.message?.includes('version conflict')");
    expect(source).toContain("value.message?.includes('not found')");
  });
});
