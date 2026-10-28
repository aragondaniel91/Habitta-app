// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../lib/roles';
import { ReceivablesPage } from './ReceivablesPage';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  access_token: 'token',
  user: { id: 'person-1' },
} as never;

const unit = '33333333-3333-4333-8333-333333333331';

function paginated<T>(items: T[]) {
  return {
    items,
    page: 1,
    pageSize: 50,
    total: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/units'))
        return Promise.resolve(
          jsonResponse([{ id: unit, code: 'A-101', building_id: null, status: 'active' }]),
        );
      if (path.endsWith('/buildings')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/charge-concepts')) return Promise.resolve(jsonResponse(paginated([])));
      if (path.endsWith('/receivables'))
        return Promise.resolve(
          jsonResponse(
            paginated([
              {
                id: 'receivable-1',
                unit_id: unit,
                description: 'Cuota de octubre',
                currency_code: 'USD',
                outstanding_amount: '50',
                status: 'open',
                due_date: '2020-01-01',
              },
            ]),
          ),
        );
      if (path.endsWith('/receivables/summary')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/receivables/aging')) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([]));
    }),
  );
}

function mount() {
  const element = document.createElement('div');
  document.body.append(element);
  return { element, root: createRoot(element) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Receivables honors a dashboard deep link, then cleans up the URL (pilot #1)', () => {
  it('seeds the Vencimiento and currency filters from the URL, then strips the hint', async () => {
    installFetch();
    window.history.replaceState(null, '', `/app/fees?due=overdue&currency=USD&unit=${unit}`);
    const { element, root } = mount();

    await act(async () => {
      root.render(
        <RolesProvider value={['condominium_admin']}>
          <ReceivablesPage
            condominiumId="condo-1"
            condominiumName="Condominio Demo"
            session={session}
          />
        </RolesProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const dueSelect = Array.from(element.querySelectorAll('select')).find(
      (select) => select.value === 'overdue',
    );
    expect(dueSelect).toBeDefined();
    expect(element.textContent).toContain('USD');
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/app/fees');
  });
});
