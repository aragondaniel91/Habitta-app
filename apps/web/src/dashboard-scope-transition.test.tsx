// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from './lib/roles';
import { AdministrativeDashboard } from './pages/AdministrativeDashboard';
import { ResidentDashboard } from './pages/ResidentDashboard';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type PendingResponse = { path: string; resolve: (response: Response) => void };

const session = {
  access_token: 'token',
  user: { id: 'person-1' },
} as never;

function installDeferredFetch() {
  const pending: PendingResponse[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      new Promise<Response>((resolve) => pending.push({ path: new URL(url).pathname, resolve })),
    ),
  );

  return (condominiumId: string) => {
    for (const request of pending.filter((item) => item.path.includes(`/condominiums/${condominiumId}/`))) {
      const isUnits = request.path.endsWith('/units');
      const isFinancialUnits = request.path.endsWith('/resident-financial-units');
      const isPayments = request.path.endsWith('/payments');
      request.resolve(
        new Response(
          JSON.stringify(
            isUnits
              ? [
                  { id: `${condominiumId}-unit`, code: `${condominiumId.toUpperCase()}-UNIT` },
                  { id: `${condominiumId}-unit-2`, code: `${condominiumId.toUpperCase()}-UNIT-2` },
                ]
              : isFinancialUnits
                ? [
                    {
                      unit_id: `${condominiumId}-unit`,
                      can_submit_payment: true,
                      currency_code: 'USD',
                      net_outstanding: '10',
                      total_debits: '10',
                      total_credits: '0',
                      overdue_amount: '0',
                      upcoming_amount: '10',
                    },
                    {
                      unit_id: `${condominiumId}-unit-2`,
                      can_submit_payment: true,
                      currency_code: 'USD',
                      net_outstanding: '0',
                      total_debits: '0',
                      total_credits: '0',
                      overdue_amount: '0',
                      upcoming_amount: '0',
                    },
                  ]
                : isPayments
                  ? [
                      {
                        id: `${condominiumId}-payment`,
                        unit_id: `${condominiumId}-unit`,
                        payer_name: `${condominiumId.toUpperCase()}-PAYER`,
                        status: 'approved',
                        original_amount: '10',
                        original_currency_code: 'USD',
                        payment_date: '2026-10-01',
                      },
                    ]
                  : [],
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
  };
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

describe('dashboard request ownership across condominium changes', () => {
  it('never lets an administrative response from the previous condominium replace the current view', async () => {
    const resolve = installDeferredFetch();
    const { element, root } = mount();

    await act(async () => {
      root.render(
        <AdministrativeDashboard condominiumId="a" condominiumName="Condominio A" onNavigate={() => {}} session={session} />,
      );
    });
    await act(async () => {
      root.render(
        <AdministrativeDashboard condominiumId="b" condominiumName="Condominio B" onNavigate={() => {}} session={session} />,
      );
    });
    expect(element.textContent).not.toContain('A-PAYER');

    await act(async () => resolve('b'));
    expect(element.textContent).toContain('Condominio B');
    expect(element.textContent).toContain('B-PAYER');

    await act(async () => resolve('a'));
    expect(element.textContent).not.toContain('A-PAYER');
    await act(async () => root.unmount());
  });

  it('clears resident data and unit selection before the replacement condominium settles', async () => {
    const resolve = installDeferredFetch();
    const { element, root } = mount();
    const render = (condominiumId: string, condominiumName: string) =>
      root.render(
        <RolesProvider value={['owner']}>
          <ResidentDashboard condominiumId={condominiumId} condominiumName={condominiumName} onNavigate={() => {}} session={session} />
        </RolesProvider>,
      );

    await act(async () => render('a', 'Condominio A'));
    await act(async () => resolve('a'));
    expect(element.textContent).toContain('A-UNIT');
    const filter = element.querySelector<HTMLSelectElement>('#resident-unit-filter')!;
    await act(async () => {
      filter.value = 'a-unit';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => render('b', 'Condominio B'));
    expect(element.textContent).not.toContain('A-UNIT');
    await act(async () => resolve('b'));
    expect(element.textContent).toContain('B-UNIT');
    expect(element.querySelector<HTMLSelectElement>('#resident-unit-filter')?.value).toBe('');

    await act(async () => resolve('a'));
    expect(element.textContent).not.toContain('A-UNIT');
    await act(async () => root.unmount());
  });
});
