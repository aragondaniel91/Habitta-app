// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnitsPage } from './UnitsPage';
import type { PropertyTopology } from '../lib/unit-domain';

const api = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ apiRequest: api }));
vi.mock('../lib/roles', () => ({
  useCondominiumRoles: () => ['condominium_admin'],
  canManage: () => true,
  canAccessRoute: () => true,
}));

describe('Unidades minimal overview layout', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, '', '/app/units');
    api.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const renderOverview = async (topology: PropertyTopology, callback?: () => void) => {
    api.mockImplementation((path: string) => {
      if (path.endsWith('/units-directory')) {
        return Promise.resolve({
          units: [
            {
              id: 'unit-1',
              condominiumId: 'condo-test',
              buildingId: null,
              code: 'A-01',
              floor: '1',
              type: 'apartment',
              status: 'active',
              ownershipPercentage: 100,
              createdAt: '2026-10-01',
              updatedAt: '2026-10-22',
              building: null,
              owners: [{ firstName: 'Valentina', lastName: 'Rojas' }],
              occupancies: [{ firstName: 'Valentina', lastName: 'Rojas' }],
            },
          ],
        });
      }
      if (path.endsWith('/buildings')) return Promise.resolve([]);
      return Promise.resolve([{ id: 'condo-test', property_topology: topology }]);
    });
    await act(async () => {
      root.render(
        createElement(UnitsPage, {
          condominiumId: 'condo-test',
          condominiumName: 'Residencias Ávila Esmeralda',
          session: {} as never,
          ...(callback ? { onConfigureStructure: callback } : {}),
        }),
      );
    });
  };

  it('presents four consistent KPI cards sourced from the directory and keeps the listing', async () => {
    await renderOverview('house_community');
    const grid = host.querySelector('.units-v3-overview-metrics');
    expect(grid).not.toBeNull();
    const cards = [...grid!.querySelectorAll('.ux-metric-card')];
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.querySelector('.ux-metric-card__label')?.textContent)).toEqual([
      'Unidades',
      'Activas',
      'Con propietarios',
      'Ocupadas',
    ]);
    expect(cards.map((card) => card.querySelector('strong')?.textContent)).toEqual([
      '1',
      '1',
      '1',
      '1',
    ]);
    expect(host.querySelectorAll('.units-v3-row')).toHaveLength(1);
    expect(host.textContent).toContain('Residencias Ávila Esmeralda');
    expect(host.textContent).not.toContain('Estructura pendiente de definir');
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('offers a real structure CTA and keeps unit creation gated when topology is unspecified', async () => {
    const configure = vi.fn();
    await renderOverview('unspecified', configure);
    const banner = host.querySelector('.units-v3-structure-banner');
    expect(banner?.textContent).toContain('Estructura pendiente de definir');
    expect(banner?.textContent).toContain('Definir estructura');
    expect(host.querySelector('.page-header__actions')?.textContent).not.toContain(
      'Definir tipo de propiedad',
    );
    const action = [...banner!.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Definir estructura'),
    );
    expect(action).not.toBeUndefined();
    await act(async () => action!.click());
    expect(configure).toHaveBeenCalledTimes(1);
    const newUnit = [
      ...host.querySelectorAll<HTMLButtonElement>('.page-header__actions button'),
    ].find((button) => button.textContent?.includes('Nueva unidad'));
    expect(newUnit?.disabled).toBe(true);
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('keeps structure configuration in the header only when no attention banner is required', async () => {
    const configure = vi.fn();
    await renderOverview('multi_building_complex', configure);
    expect(host.querySelector('.units-v3-structure-banner')).toBeNull();
    const actions = host.querySelector('.page-header__actions');
    const button = [...actions!.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes('Configurar estructura'),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(configure).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('shows only informational guidance if configuring structure is not available', async () => {
    await renderOverview('unspecified');
    expect(host.querySelector('.units-v3-structure-banner__copy')?.textContent).toContain(
      'Estructura pendiente de definir',
    );
    expect(host.querySelector('.units-v3-structure-banner button')).toBeNull();
  });

  it('retains the special one-building configuration gate and working action', async () => {
    const configure = vi.fn();
    await renderOverview('single_building', configure);
    const banner = host.querySelector('.units-v3-structure-banner');
    expect(banner?.textContent).toContain('Edificio pendiente');
    expect(host.querySelector('.page-header__actions')?.textContent).not.toContain(
      'Configurar estructura',
    );
    const button = banner?.querySelector('button');
    expect(button?.textContent).toContain('Configurar edificio');
    await act(async () => button!.click());
    expect(configure).toHaveBeenCalledTimes(1);
    const newUnit = [
      ...host.querySelectorAll<HTMLButtonElement>('.page-header__actions button'),
    ].find((item) => item.textContent?.includes('Nueva unidad'));
    expect(newUnit?.disabled).toBe(true);
  });
});
