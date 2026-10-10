// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../../lib/roles';
import { FinancialAdministrationDrawer } from './FinancialAdministrationDrawer';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('FinancialAdministrationDrawer', () => {
  it('loads and displays the selected unit owners before permitting a transfer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/account-statement')) {
          return new Response(
            JSON.stringify({
              owners: [
                { person_id: 'owner-1', name: 'Ana P\u00e9rez', ownership_percentage: '60' },
                { person_id: 'owner-2', name: 'Luis P\u00e9rez', ownership_percentage: '40' },
              ],
            }),
          );
        }
        return new Response(JSON.stringify([]));
      }),
    );
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);

    await act(async () =>
      root.render(
        <RolesProvider value={['accountant']}>
          <FinancialAdministrationDrawer
            buildingNameById={{}}
            condominiumId="condominium-1"
            onClose={() => undefined}
            session={{ access_token: 'token' } as never}
            units={[{ id: 'unit-1', code: 'A-101', building_id: null }]}
          />
        </RolesProvider>,
      ),
    );

    await act(async () => {
      [...element.querySelectorAll('button')]
        .find((button) => button.textContent === 'Gestionar propiedad')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const select = element.querySelector('select')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
        select,
        'unit-1',
      );
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(element.textContent).toContain('Propiedad de A-101');
    expect(element.textContent).toContain('Ana P\u00e9rez');
    expect(element.textContent).toContain('60%');
    expect(element.textContent).toContain('Luis P\u00e9rez');
    expect(element.textContent).toContain('40%');
    await act(async () => root.unmount());
  });
});
