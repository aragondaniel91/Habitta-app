// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StructureManagementPage } from './StructureManagementPage';

const api = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ apiRequest: api }));
vi.mock('../lib/roles', () => ({ useCondominiumRoles: () => ['condominium_admin'] }));

describe('HAB-PILOT-004 visual billing scope setup', () => {
  let root: Root;
  let node: HTMLDivElement;
  let mode: 'unit' | 'building';
  let unitCount: number;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mode = 'unit';
    unitCount = 0;
    api.mockReset();
    api.mockImplementation(
      (path: string, _session: unknown, init?: { method?: string; body?: string }) => {
        if (path.endsWith('/charge-scope') && init?.method === 'PATCH') {
          mode = JSON.parse(init.body ?? '{}').chargeScope;
          return Promise.resolve({ condominium_id: 'condo1', charge_scope: mode });
        }
        if (path.endsWith('/buildings')) return Promise.resolve([]);
        if (path.endsWith('/units'))
          return Promise.resolve(
            Array.from({ length: unitCount }, (_, i) => ({
              id: 'unit-' + i,
              condominium_id: 'condo1',
              code: 'A-' + i,
              type: 'apartment',
              building_id: null,
              floor: null,
              status: 'active',
              ownership_percentage: null,
            })),
          );
        if (path.endsWith('/condo1'))
          return Promise.resolve([
            {
              id: 'condo1',
              property_topology: 'multi_building_complex',
              charge_scope: mode,
              declared_building_count: 10,
            },
          ]);
        throw new Error('Unexpected request: ' + path);
      },
    );
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
  });

  afterEach(() => {
    act(() => root.unmount());
    node.remove();
  });

  async function render() {
    await act(async () =>
      root.render(
        createElement(StructureManagementPage, {
          condominiumId: 'condo1',
          condominiumName: 'Residencias La Muchachera',
          session: {} as never,
        }),
      ),
    );
  }

  it('offers a choice only while the general condominium has no units', async () => {
    await render();
    const section = node.querySelector('[data-testid="structure-billing-mode"]');
    expect(section?.textContent).toContain('¿A quién se le generan las cuotas?');
    const choices = [...section!.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
    expect(choices).toHaveLength(2);
    expect(choices[0]?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => choices[1]!.click());
    expect(choices[1]?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      const save = [...section!.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Guardar modalidad'),
      );
      save?.click();
    });
    expect(api).toHaveBeenCalledWith('/v1/condominiums/condo1/charge-scope', expect.anything(), {
      method: 'PATCH',
      body: JSON.stringify({ chargeScope: 'building' }),
    });
    expect(section?.textContent).toContain('Por edificio completo');
  });

  it('locks the mode whenever an account already exists', async () => {
    unitCount = 1;
    await render();
    const section = node.querySelector('[data-testid="structure-billing-mode"]');
    expect(section?.textContent).toContain('Configuración fijada');
    expect(section?.textContent).toContain('protege');
    expect(section?.querySelectorAll('button[aria-pressed]')).toHaveLength(0);
    expect(api).not.toHaveBeenCalledWith(
      expect.stringContaining('charge-scope'),
      expect.anything(),
      expect.anything(),
    );
  });
});
