// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentsPage as AdminPaymentsPage } from './AdminPaymentsPage';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  access_token: 'token',
  user: { id: 'person-1' },
} as never;

function paginated<T>(items: T[]) {
  return {
    items,
    page: 1,
    pageSize: 10,
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
      const path = new URL(url).pathname + new URL(url).search;
      if (path.includes('/payments/review-queue'))
        return Promise.resolve(jsonResponse(paginated([])));
      if (path.includes('/payments/summary')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/units')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/buildings')) return Promise.resolve(jsonResponse([]));
      if (path.includes('/payment-methods')) return Promise.resolve(jsonResponse(paginated([])));
      if (path.includes('/charge-concepts')) return Promise.resolve(jsonResponse(paginated([])));
      if (path.includes('/payments?')) return Promise.resolve(jsonResponse(paginated([])));
      return Promise.resolve(jsonResponse(paginated([])));
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

describe('Payments honors a dashboard "Acción requerida" deep link, then cleans up the URL', () => {
  it('opens the review tab pre-filtered to submitted and strips the hint from the URL', async () => {
    installFetch();
    window.history.replaceState(null, '', '/app/payments?status=submitted&currency=USD');
    const { element, root } = mount();

    await act(async () => {
      root.render(
        <AdminPaymentsPage
          condominiumId="condo-1"
          condominiumName="Condominio Demo"
          session={session}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const statusSelect = Array.from(element.querySelectorAll('select')).find(
      (select) => select.value === 'submitted',
    );
    expect(statusSelect).toBeDefined();
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/app/payments');
  });
});
