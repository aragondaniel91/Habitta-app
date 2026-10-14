// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentAgreementsPanel } from './PaymentAgreementsPanel';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PaymentAgreementsPanel', () => {
  it('shows agreement progress as derived payment status, never as a payment action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) =>
        String(input).includes('/receivables?')
          ? new Response(
              JSON.stringify({
                items: [],
                page: 1,
                pageSize: 100,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
              }),
            )
          : new Response(
              JSON.stringify([
                {
                  id: 'a-1',
                  status: 'accepted',
                  initiated_by: 'resident',
                  proposing_actor_kind: 'resident',
                  currency_code: 'USD',
                  version: 2,
                  schedule: [{ due_date: '2026-12-01', amount: '50.00' }],
                  progress: { posted_amount: '20.00', current_source_outstanding: '80.00' },
                  events: [{ event_type: 'proposed', created_at: '2026-10-01' }],
                },
              ]),
            ),
      ),
    );
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () =>
      root.render(
        <PaymentAgreementsPanel
          canManage={false}
          condominiumId="condo-1"
          session={{ access_token: 'token' } as never}
        />,
      ),
    );
    expect(element.textContent).toContain('Nuevo convenio');
    expect(element.textContent).toContain('Pagado aplicado: 20.00');
    expect(element.textContent).toContain('Pendiente: 80.00');
    expect(element.textContent).not.toContain('Registrar pago');
    await act(async () => root.unmount());
  });

  it('offers accept/counter/reject to the side that must respond, never to whoever just proposed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) =>
        String(input).includes('/receivables?')
          ? new Response(
              JSON.stringify({
                items: [],
                page: 1,
                pageSize: 100,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
              }),
            )
          : new Response(
              JSON.stringify([
                {
                  id: 'a-2',
                  status: 'pending',
                  initiated_by: 'resident',
                  proposing_actor_kind: 'administrator',
                  currency_code: 'USD',
                  version: 2,
                  schedule: [{ due_date: '2026-12-01', amount: '60.00' }],
                  progress: null,
                  events: [],
                },
              ]),
            ),
      ),
    );
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () =>
      root.render(
        <PaymentAgreementsPanel
          canManage={false}
          condominiumId="condo-1"
          session={{ access_token: 'token' } as never}
        />,
      ),
    );
    const detailButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent === 'Ver detalle',
    );
    await act(async () => detailButton?.click());
    expect(element.textContent).toContain('Aceptar');
    expect(element.textContent).toContain('Enviar contraoferta');
    expect(element.textContent).toContain('Rechazar');
    expect(element.textContent).not.toContain('Cancelar propuesta');
    await act(async () => root.unmount());
  });

  it('searches agreements by the displayed unit code and Spanish status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) =>
        String(input).includes('/receivables?')
          ? new Response(
              JSON.stringify({
                items: [],
                page: 1,
                pageSize: 100,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
              }),
            )
          : new Response(
              JSON.stringify([
                {
                  id: 'a-3',
                  unit_id: 'u-1',
                  status: 'accepted',
                  initiated_by: 'resident',
                  proposing_actor_kind: 'resident',
                  currency_code: 'USD',
                  version: 1,
                  schedule: [],
                  progress: null,
                  events: [],
                },
              ]),
            ),
      ),
    );
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () =>
      root.render(
        <PaymentAgreementsPanel
          canManage
          condominiumId="condo-1"
          session={{ access_token: 'token' } as never}
          unitLabel={(unitId) => (unitId === 'u-1' ? 'A-1' : unitId)}
        />,
      ),
    );
    const search = element.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      search.value = 'aceptado';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(element.textContent).toContain('A-1');
    await act(async () => {
      search.value = 'A-1';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(element.textContent).toContain('Aceptado');
    await act(async () => root.unmount());
  });

  it('loads every receivables page before offering an original charge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = String(input);
        if (!url.includes('/receivables?')) return new Response(JSON.stringify([]));
        const page = new URL(url).searchParams.get('page');
        return new Response(
          JSON.stringify(
            page === '1'
              ? {
                  items: [
                    {
                      id: 'r-1',
                      unit_id: 'u-1',
                      currency_code: 'USD',
                      outstanding_amount: '10.00',
                      description: 'Primera',
                    },
                  ],
                  page: 1,
                  pageSize: 100,
                  total: 2,
                  totalPages: 2,
                  hasNextPage: true,
                  hasPreviousPage: false,
                }
              : {
                  items: [
                    {
                      id: 'r-2',
                      unit_id: 'u-2',
                      currency_code: 'USD',
                      outstanding_amount: '20.00',
                      description: 'Segunda',
                    },
                  ],
                  page: 2,
                  pageSize: 100,
                  total: 2,
                  totalPages: 2,
                  hasNextPage: false,
                  hasPreviousPage: true,
                },
          ),
        );
      }),
    );
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () => {
      root.render(
        <PaymentAgreementsPanel
          canManage
          condominiumId="condo-1"
          session={{ access_token: 'token' } as never}
          unitLabel={(unitId) => (unitId === 'u-2' ? 'B-2' : 'A-1')}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(element.querySelector('select')?.textContent).toContain('B-2 · Segunda · USD 20.00');
    await act(async () => root.unmount());
  });
});
