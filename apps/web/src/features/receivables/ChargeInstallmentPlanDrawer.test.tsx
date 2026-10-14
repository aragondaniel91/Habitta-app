// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChargeInstallmentPlanDrawer } from './ChargeInstallmentPlanDrawer';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const condoId = '11111111-1111-4111-8111-111111111111';
const conceptId = '22222222-2222-4222-8222-222222222222';
const towerId = '33333333-3333-4333-8333-333333333333';
const unitA = '44444444-4444-4444-8444-444444444444';
const unitB = '55555555-5555-4555-8555-555555555555';

const setValue = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ChargeInstallmentPlanDrawer', () => {
  it('uses only the legacy batch preview and commit path for Pago único', async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => {
        const url = String(input);
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        requests.push({ url, body });
        return new Response(
          JSON.stringify({ count: 2, total: '200.00', currencyCode: 'USD', status: 'posted' }),
        );
      }),
    );
    const refresh = vi.fn(async () => undefined);
    const close = vi.fn();
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () =>
      root.render(
        <ChargeInstallmentPlanDrawer
          buildingNameById={{ [towerId]: 'Torre A' }}
          concepts={[{ id: conceptId, name: 'Extraordinaria', is_active: true } as never]}
          condominiumId={condoId}
          onClose={close}
          onRefresh={refresh}
          selectedCurrency="USD"
          session={{ access_token: 'token' } as never}
          units={
            [
              { id: unitA, code: 'A-101', building_id: towerId, status: 'active' },
              { id: unitB, code: 'A-102', building_id: towerId, status: 'active' },
            ] as never
          }
        />,
      ),
    );

    await setValue(element.querySelector('[name="plan-concept"]') as HTMLSelectElement, conceptId);
    await setValue(
      element.querySelector('[name="plan-name"]') as HTMLInputElement,
      'Reparación puntual',
    );
    await setValue(
      element.querySelector('input[inputmode="decimal"]') as HTMLInputElement,
      '100.00',
    );
    await setValue(element.querySelector('[name="plan-issue"]') as HTMLInputElement, '2026-11-01');
    await setValue(element.querySelector('[name="plan-due"]') as HTMLInputElement, '2026-11-15');
    const boxes = Array.from(
      element.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    await act(async () => boxes[0]?.click());
    expect(element.textContent).toContain('1 unidades seleccionadas: A-101');
    await act(async () => boxes[1]?.click());
    expect(element.textContent).toContain('2 unidades seleccionadas: A-101, A-102');
    await act(async () => {
      (element.querySelector('form') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain(`/v1/condominiums/${condoId}/charge-batches/preview`);
    expect(requests[0]?.body).toMatchObject({
      distributionMethod: 'fixed_per_unit',
      fixedAmount: '100.00',
      rows: [{ unitId: unitA }, { unitId: unitB }],
    });
    await act(async () => {
      Array.from(element.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Confirmar'))
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toContain(`/v1/condominiums/${condoId}/charge-batches/commit`);
    expect(requests[1]?.body).toMatchObject({
      distributionMethod: 'fixed_per_unit',
      rows: [{ unitId: unitA }, { unitId: unitB }],
    });
    expect(requests[1]?.body.idempotencyKey).toBe(requests[0]?.body.idempotencyKey);
    expect(
      requests.some(
        (request) =>
          request.url.includes('charge-installment-plans') ||
          request.url.includes('payment-agreements'),
      ),
    ).toBe(false);
    expect(refresh).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('publishes one original charge and one pending proposal per selected tower unit', async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => {
        const url = String(input);
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        requests.push({ url, body });
        if (url.endsWith('/preview'))
          return new Response(
            JSON.stringify({
              count: 2,
              total: '200.00',
              currencyCode: 'USD',
              valid: [
                {
                  unit_id: unitA,
                  unit_code: 'A-101',
                  legal_owner: 'Ana Propietaria',
                  amount: '100.00',
                },
                {
                  unit_id: unitB,
                  unit_code: 'A-102',
                  legal_owner: 'Beto Propietario',
                  amount: '100.00',
                },
              ],
              blockers: [],
            }),
          );
        return new Response(
          JSON.stringify({
            status: 'posted',
            receivable_ids: ['r-a', 'r-b'],
            agreement_ids: ['a-a', 'a-b'],
          }),
        );
      }),
    );
    const refresh = vi.fn(async () => undefined);
    const close = vi.fn();
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () =>
      root.render(
        <ChargeInstallmentPlanDrawer
          buildingNameById={{ [towerId]: 'Torre A' }}
          concepts={[{ id: conceptId, name: 'Extraordinaria', is_active: true } as never]}
          condominiumId={condoId}
          onClose={close}
          onRefresh={refresh}
          selectedCurrency="USD"
          session={{ access_token: 'token' } as never}
          units={
            [
              { id: unitA, code: 'A-101', building_id: towerId, status: 'active' },
              { id: unitB, code: 'A-102', building_id: towerId, status: 'active' },
              {
                id: '66666666-6666-4666-8666-666666666666',
                code: 'B-201',
                building_id: 'other',
                status: 'active',
              },
            ] as never
          }
        />,
      ),
    );

    const selects = Array.from(element.querySelectorAll('select')) as HTMLSelectElement[];
    await setValue(selects[0]!, 'plan');
    await setValue(element.querySelector('[name="plan-concept"]') as HTMLSelectElement, conceptId);
    await setValue(
      element.querySelector('[name="plan-name"]') as HTMLInputElement,
      'Fondo de ascensor',
    );
    await setValue(
      element.querySelector('input[inputmode="decimal"]') as HTMLInputElement,
      '100.00',
    );
    await setValue(element.querySelector('[name="plan-issue"]') as HTMLInputElement, '2026-11-01');
    await setValue(element.querySelector('[name="plan-due"]') as HTMLInputElement, '2026-11-15');
    await setValue(
      (Array.from(element.querySelectorAll('select')) as HTMLSelectElement[])[3]!,
      towerId,
    );
    const unitBoxes = Array.from(
      element.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    await act(async () => unitBoxes.forEach((box) => box.click()));
    await setValue(element.querySelector('input[type="number"]') as HTMLInputElement, '3');
    await act(async () => {
      Array.from(element.querySelectorAll('button'))
        .find((button) => button.textContent === 'Generar calendario editable')
        ?.click();
    });
    expect(element.querySelectorAll('input[type="date"]')).toHaveLength(5);
    expect(element.textContent).toContain('2 unidades seleccionadas: A-101, A-102');
    await act(async () => {
      (element.querySelector('form') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    const preview = requests.find((request) => request.url.endsWith('/preview'));
    expect(preview?.body.rows).toEqual([{ unitId: unitA }, { unitId: unitB }]);
    expect(preview?.body.installments).toHaveLength(3);
    expect(
      (preview?.body.installments as { amount: string }[]).reduce(
        (sum, row) => sum + Number(row.amount),
        0,
      ),
    ).toBe(100);
    expect(element.textContent).toContain(
      'Se creará un cargo original y una propuesta pendiente por cada unidad.',
    );
    await act(async () => {
      Array.from(element.querySelectorAll('button'))
        .find((button) => button.textContent === 'Confirmar publicación')
        ?.click();
      await Promise.resolve();
    });
    const publication = requests.find((request) => request.url.endsWith('/publish'));
    expect(publication?.body.rows).toEqual([{ unitId: unitA }, { unitId: unitB }]);
    expect(publication?.body.installments).toHaveLength(3);
    expect(refresh).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
