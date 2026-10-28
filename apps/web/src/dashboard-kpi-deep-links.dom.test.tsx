// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdministrativeDashboard } from './pages/AdministrativeDashboard';
import type { AppRoute } from './navigation';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  access_token: 'token',
  user: { id: 'person-1' },
} as never;

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
      if (path.endsWith('/units')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/people')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/receivables/summary')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/receivables/aging')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/receivables')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/payments')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/payments/review-queue')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/requests')) return Promise.resolve(jsonResponse([]));
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

describe('Dashboard KPI deep links preserve filter context (pilot #1 + #3)', () => {
  it('sends the "Saldo total pendiente" card to Fees with no forced status, and "Cobrado este mes" to Payments filtered to approved', async () => {
    installFetch();
    const { element, root } = mount();
    const onNavigateFiltered = vi.fn();

    await act(async () => {
      root.render(
        <AdministrativeDashboard
          condominiumId="condo-1"
          condominiumName="Condominio Demo"
          onNavigate={() => {}}
          onNavigateFiltered={onNavigateFiltered}
          session={session}
        />,
      );
    });
    // Flush the pending microtasks from Promise.all in the load effect.
    await act(async () => {
      await Promise.resolve();
    });

    const pendingCard = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Saldo total pendiente'),
    );
    expect(pendingCard).toBeDefined();
    await act(async () => {
      pendingCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigateFiltered).toHaveBeenCalledTimes(1);
    const [feesRoute, feesSearch] = onNavigateFiltered.mock.calls[0] as [AppRoute, string];
    expect(feesRoute.key).toBe('fees');
    expect(feesSearch).toBe('');

    const collectedCard = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Cobrado este mes'),
    );
    await act(async () => {
      collectedCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigateFiltered).toHaveBeenCalledTimes(2);
    const [paymentsRoute, paymentsSearch] = onNavigateFiltered.mock.calls[1] as [AppRoute, string];
    expect(paymentsRoute.key).toBe('payments');
    expect(paymentsSearch).toBe('status=approved');
  });

  it('routes "Acción requerida" to submitted and "En revisión administrativa" to under_review, as two distinct states', async () => {
    installFetch();
    const { element, root } = mount();
    const onNavigateFiltered = vi.fn();

    await act(async () => {
      root.render(
        <AdministrativeDashboard
          condominiumId="condo-2"
          condominiumName="Condominio Demo"
          onNavigate={() => {}}
          onNavigateFiltered={onNavigateFiltered}
          session={session}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(element.textContent).toContain('Acción requerida');
    expect(element.textContent).toContain('En revisión administrativa');

    const actionRequiredButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Acción requerida'),
    );
    await act(async () => {
      actionRequiredButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const [, submittedSearch] = onNavigateFiltered.mock.calls[0] as [AppRoute, string];
    expect(submittedSearch).toBe('status=submitted');

    const adminReviewButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('En revisión administrativa'),
    );
    await act(async () => {
      adminReviewButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const [, underReviewSearch] = onNavigateFiltered.mock.calls[1] as [AppRoute, string];
    expect(underReviewSearch).toBe('status=under_review');
  });
});
