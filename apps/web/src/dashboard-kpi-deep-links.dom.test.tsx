// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdministrativeDashboard } from './pages/AdministrativeDashboard';
import { RolesProvider } from './lib/roles';
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

function installFetch(currencyCode?: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/units')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/people')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/receivables/summary'))
        return Promise.resolve(
          jsonResponse(
            currencyCode
              ? [
                  {
                    currency_code: currencyCode,
                    net_outstanding: '12.00',
                    total_debits: '12.00',
                    total_credits: '0.00',
                  },
                ]
              : [],
          ),
        );
      if (path.endsWith('/receivables/aging')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/receivables')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/payments')) return Promise.resolve(jsonResponse([]));
      if (path.endsWith('/payments/review-queue'))
        return Promise.resolve(
          jsonResponse([
            {
              id: 'reviewable-payment-1',
              unit_id: 'unit-1',
              status: 'submitted',
              can_approve: true,
              payer_name: 'Residente Demo',
              original_amount: '12.00',
              original_currency_code: 'USD',
              payment_date: '2026-10-28',
            },
          ]),
        );
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
        <RolesProvider value={['condominium_admin']}>
          <AdministrativeDashboard
            condominiumId="condo-1"
            condominiumName="Condominio Demo"
            onNavigate={() => {}}
            onNavigateFiltered={onNavigateFiltered}
            session={session}
          />
        </RolesProvider>,
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

  it('makes active units and financial list CTAs genuine, scoped navigation actions', async () => {
    installFetch();
    const { element, root } = mount();
    const onNavigateFiltered = vi.fn();
    const onNavigate = vi.fn();

    await act(async () => {
      root.render(
        <RolesProvider value={['condominium_admin']}>
          <AdministrativeDashboard
            condominiumId="condo-1"
            condominiumName="Condominio Demo"
            onNavigate={onNavigate}
            onNavigateFiltered={onNavigateFiltered}
            session={session}
          />
        </RolesProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const buttons = Array.from(element.querySelectorAll('button'));
    const activeUnits = buttons.find((button) => button.textContent?.includes('Unidades activas'));
    expect(activeUnits).toBeDefined();
    await act(async () => {
      activeUnits!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ key: 'units' }));

    const allReceivables = buttons.find((button) =>
      button.textContent?.includes('Ver cuentas por cobrar'),
    );
    expect(allReceivables).toBeDefined();
    await act(async () => {
      allReceivables!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigateFiltered).toHaveBeenCalledWith(expect.objectContaining({ key: 'fees' }), '');

    const allPayments = buttons.find((button) => button.textContent?.includes('Ver todos'));
    expect(allPayments).toBeDefined();
    await act(async () => {
      allPayments!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigateFiltered).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'payments' }),
      '',
    );
    await act(async () => root.unmount());
  });

  it('routes "Acción requerida" to submitted and "En revisión administrativa" to under_review, as two distinct states', async () => {
    installFetch();
    const { element, root } = mount();
    const onNavigateFiltered = vi.fn();

    await act(async () => {
      root.render(
        <RolesProvider value={['condominium_admin']}>
          <AdministrativeDashboard
            condominiumId="condo-2"
            condominiumName="Condominio Demo"
            onNavigate={() => {}}
            onNavigateFiltered={onNavigateFiltered}
            session={session}
          />
        </RolesProvider>,
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
    await act(async () => root.unmount());
  });

  it('preserves the selected USD currency on dashboard financial KPI and list links', async () => {
    installFetch('USD');
    const { element, root } = mount();
    const onNavigateFiltered = vi.fn();
    await act(async () => {
      root.render(
        <RolesProvider value={['condominium_admin']}>
          <AdministrativeDashboard
            condominiumId="condo-usd"
            condominiumName="Condominio Demo"
            onNavigate={() => {}}
            onNavigateFiltered={onNavigateFiltered}
            session={session}
          />
        </RolesProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const clickLabel = async (label: string) => {
      const target = Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes(label),
      );
      expect(target, label).toBeDefined();
      await act(async () => {
        target!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    await clickLabel('Saldo total pendiente');
    await clickLabel('Cobrado este mes');
    await clickLabel('Morosidad');
    await clickLabel('Ver cuentas por cobrar');
    await clickLabel('Ver todos');

    expect(
      onNavigateFiltered.mock.calls.map((call) => {
        const [route, search] = call as [AppRoute, string];
        return [route.key, search];
      }),
    ).toEqual([
      ['fees', 'currency=USD'],
      ['payments', 'status=approved&currency=USD'],
      ['fees', 'currency=USD&due=overdue'],
      ['fees', 'currency=USD'],
      ['payments', 'currency=USD'],
    ]);
    await act(async () => root.unmount());
  });

  it('does not offer Units or People navigation to a payment reviewer without those routes', async () => {
    installFetch();
    const { element, root } = mount();
    const onNavigate = vi.fn();
    await act(async () => {
      root.render(
        <RolesProvider value={['payment_reviewer']}>
          <AdministrativeDashboard
            condominiumId="condo-reviewer"
            condominiumName="Condominio Demo"
            onNavigate={onNavigate}
            onNavigateFiltered={() => {}}
            session={session}
          />
        </RolesProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const unitsCard = Array.from(element.querySelectorAll('.dashboard-metric-card')).find((card) =>
      card.textContent?.includes('Unidades activas'),
    );
    expect(unitsCard).toBeDefined();
    expect(unitsCard!.tagName).not.toBe('BUTTON');
    expect(unitsCard!.textContent).not.toContain('Clic para ver las unidades');

    const communityButtons = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.dashboard-community-stats button'),
    );
    expect(communityButtons).toHaveLength(2);
    expect(communityButtons.every((button) => button.disabled)).toBe(true);

    const quickActions = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.dashboard-action-grid button'),
    );
    const findAction = (label: string) =>
      quickActions.find((button) => button.textContent?.includes(label));
    expect(findAction('Generar reporte')?.disabled).toBe(true);
    expect(findAction('Enviar anuncio')?.disabled).toBe(false);
    expect(findAction('Crear cuota')?.disabled).toBe(false);
    const registerPayment = findAction('Registrar pago');
    expect(registerPayment?.disabled).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
    await act(async () => {
      registerPayment!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ key: 'payments' }));
    await act(async () => root.unmount());
  });
});
