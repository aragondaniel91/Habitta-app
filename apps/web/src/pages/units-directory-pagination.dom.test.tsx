// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnitsPage } from './UnitsPage';
import type { DirectoryUnit } from '../features/units/types';

const api = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ apiRequest: api }));
vi.mock('../lib/roles', () => ({
  useCondominiumRoles: () => ['condominium_admin'],
  canManage: () => true,
  canAccessRoute: () => true,
}));

function createUnit(index: number): DirectoryUnit {
  return {
    id: 'unit-' + index,
    condominiumId: 'condo-test',
    buildingId: index <= 24 ? 'b1' : 'b2',
    code: 'A-' + index,
    floor: String(index),
    type: 'apartment',
    status: index === 48 ? 'inactive' : 'active',
    ownershipPercentage: index,
    createdAt: '2026-09-01',
    updatedAt: new Date(Date.UTC(2026, 8, index)).toISOString(),
    building: {
      id: index <= 24 ? 'b1' : 'b2',
      name: index <= 24 ? 'Torre A' : 'Torre B',
    },
    owners: [],
    occupancies: [],
  };
}

describe('Units directory pagination interactions', () => {
  let root: Root;
  let host: HTMLDivElement;
  const units = Array.from({ length: 48 }, (_, i) => createUnit(i + 1));

  const displayedCodes = () =>
    [...host.querySelectorAll('.units-v3-row__identity strong')].map((row) =>
      row.textContent?.trim(),
    );
  const select = async (ariaLabel: string, value: string) => {
    const field = host.querySelector<HTMLSelectElement>(`select[aria-label="${ariaLabel}"]`)!;
    expect(field).not.toBeNull();
    await act(async () => {
      field.value = value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const click = async (text: string) => {
    const button = [...host.querySelectorAll('button')].find((item) =>
      item.textContent?.trim().startsWith(text),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, '', '/app/units');
    api.mockReset();
    api.mockImplementation((path: string) => {
      if (path.endsWith('/units-directory')) return Promise.resolve({ units });
      if (path.endsWith('/buildings'))
        return Promise.resolve([
          { id: 'b1', condominium_id: 'condo-test', name: 'Torre A' },
          { id: 'b2', condominium_id: 'condo-test', name: 'Torre B' },
        ]);
      return Promise.resolve([{ id: 'condo-test', property_topology: 'multi_building_complex' }]);
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(UnitsPage, {
          condominiumId: 'condo-test',
          condominiumName: 'Condominio piloto',
          session: {} as never,
        }),
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('shows 10 of 48, paginates, and keeps the API data client-side', async () => {
    expect(displayedCodes()).toHaveLength(10);
    expect(displayedCodes()[0]).toContain('A-1');
    expect(host.textContent).toContain('1–10 de 48 unidades');
    await click('Siguiente');
    expect(displayedCodes()[0]).toContain('A-11');
    expect(host.textContent).toContain('Página 2 de 5');
    await select('Unidades por página', '25');
    expect(displayedCodes()).toHaveLength(25);
    expect(host.textContent).toContain('1–25 de 48 unidades');
    await click('Siguiente');
    expect(displayedCodes()).toHaveLength(23);
    expect(host.textContent).toContain('26–48 de 48 unidades');
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('navigates directly by page number with one active, accessible page', async () => {
    expect(host.querySelector('.units-v3-directory-controls')?.textContent).toContain(
      '48 resultados',
    );
    const pageFive = host.querySelector<HTMLButtonElement>('button[aria-label="Ir a la página 5"]');
    expect(pageFive).not.toBeNull();
    await act(async () => pageFive!.click());
    expect(displayedCodes()).toHaveLength(8);
    expect(displayedCodes()[0]).toContain('A-41');
    expect(host.textContent).toContain('41–48 de 48 unidades');
    expect(pageFive!.getAttribute('aria-current')).toBe('page');
    expect(host.querySelectorAll('.units-v3-pagination__number[aria-current="page"]')).toHaveLength(
      1,
    );

    const pageOne = host.querySelector<HTMLButtonElement>('button[aria-label="Ir a la página 1"]');
    await act(async () => pageOne!.click());
    expect(displayedCodes()[0]).toContain('A-1');
    expect(pageOne!.getAttribute('aria-current')).toBe('page');
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('resets pagination on sort and filter, and renders the actual update date', async () => {
    await click('Siguiente');
    await select('Ordenar unidades', 'updated-desc');
    expect(displayedCodes()[0]).toContain('A-48');
    expect(host.textContent).toContain('1–10 de 48 unidades');
    expect(host.textContent).toContain('Actualización');
    await select('Filtrar por estado', 'inactive');
    expect(displayedCodes()).toHaveLength(1);
    expect(displayedCodes()[0]).toContain('A-48');
    expect(host.textContent).toContain('1–1 de 1 unidad');
  });

  it('returns to page 1 when switching buildings from a later page', async () => {
    await click('Siguiente');
    await click('Siguiente');
    expect(host.textContent).toContain('Página 3 de 5');
    await select('Filtrar por edificio', 'b2');
    expect(displayedCodes()).toHaveLength(10);
    expect(displayedCodes()[0]).toContain('A-25');
    expect(host.textContent).toContain('1–10 de 24 unidades');
    expect(host.textContent).toContain('Página 1 de 3');
    expect(api).toHaveBeenCalledTimes(3);
  });
});
