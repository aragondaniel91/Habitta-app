// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransferDrawer } from './TreasuryDrawers';
import type { TreasuryAccount } from './types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const accounts: TreasuryAccount[] = [
  {
    id: 'bank-usd',
    name: 'Banco principal',
    account_type: 'bank',
    currency_code: 'USD',
    bank_name: null,
    account_reference: null,
    notes: null,
    is_active: true,
    balance: '100.00',
    latest_movement_at: null,
  },
  {
    id: 'cash-usd',
    name: 'Caja operativa',
    account_type: 'cash',
    currency_code: 'USD',
    bank_name: null,
    account_reference: null,
    notes: null,
    is_active: true,
    balance: '20.00',
    latest_movement_at: null,
  },
  {
    id: 'bank-ves',
    name: 'Banco VES',
    account_type: 'bank',
    currency_code: 'VES',
    bank_name: null,
    account_reference: null,
    notes: null,
    is_active: true,
    balance: '50.00',
    latest_movement_at: null,
  },
  {
    id: 'archived-usd',
    name: 'Cuenta archivada',
    account_type: 'cash',
    currency_code: 'USD',
    bank_name: null,
    account_reference: null,
    notes: null,
    is_active: false,
    balance: '999.00',
    latest_movement_at: null,
  },
];

const setValue = (control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
  const prototype =
    control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('TransferDrawer', () => {
  it('filters destinations, displays balances and submits the optional reference', async () => {
    const onSubmit = vi.fn<(input: unknown) => Promise<void>>(() => Promise.resolve());
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);

    await act(async () => {
      root.render(<TransferDrawer accounts={accounts} onClose={() => {}} onSubmit={onSubmit} />);
    });

    const [origin, destination] = element.querySelectorAll<HTMLSelectElement>('select');
    expect(origin?.value).toBe('bank-usd');
    expect(destination?.disabled).toBe(false);
    expect(Array.from(destination?.options ?? []).map((option) => option.value)).toEqual(['', 'cash-usd']);
    expect(element.textContent).toContain('Saldo actual: USD 100,00.');
    expect(element.textContent).not.toContain('Cuenta archivada');

    await act(async () => {
      setValue(destination!, 'cash-usd');
      setValue(element.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!, '25.00');
      setValue(
        element.querySelector<HTMLInputElement>('input[placeholder="Transferencia a caja operativa"]')!,
        'Reposición de caja',
      );
      setValue(element.querySelector<HTMLInputElement>('input[placeholder="Ej. comprobante 00421"]')!, 'doc-42');
    });

    expect(element.textContent).toContain('Monto (USD)');
    expect(element.textContent).toContain('Origen: USD 100,00 → USD 75,00');
    expect(element.textContent).toContain('Destino: USD 20,00 → USD 45,00');
    expect(element.querySelector('.treasury-transfer-amount-date-grid')?.querySelectorAll('.field')).toHaveLength(2);

    await act(async () => {
      element.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAccountId: 'bank-usd',
        toAccountId: 'cash-usd',
        reference: 'doc-42',
      }),
    );
    await act(async () => root.unmount());
  });

  it('blocks submission when the origin has no other active account in its currency', async () => {
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () => {
      root.render(<TransferDrawer accounts={accounts} onClose={() => {}} onSubmit={async () => undefined} />);
    });

    const [origin, destination] = element.querySelectorAll<HTMLSelectElement>('select');
    await act(async () => setValue(origin!, 'bank-ves'));
    expect(destination?.disabled).toBe(true);
    expect(element.textContent).toContain('Se requiere otra cuenta activa en la misma moneda');
    expect(
      Array.from(element.querySelectorAll('button')).find(
        (button) => button.textContent === 'Registrar transferencia',
      )?.disabled,
    ).toBe(true);
    await act(async () => root.unmount());
  });

  it('retains the overdraft reason and confirmation guard before enabling an overdraft transfer', async () => {
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () => {
      root.render(<TransferDrawer accounts={accounts} onClose={() => {}} onSubmit={async () => undefined} />);
    });

    const [, destination] = element.querySelectorAll<HTMLSelectElement>('select');
    await act(async () => {
      setValue(destination!, 'cash-usd');
      setValue(element.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!, '125.00');
      setValue(
        element.querySelector<HTMLInputElement>('input[placeholder="Transferencia a caja operativa"]')!,
        'Reposición de caja',
      );
    });
    const submit = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent === 'Confirmar transferencia',
    );
    expect(element.textContent).toContain('La cuenta origen quedará en negativo.');
    expect(submit?.disabled).toBe(true);

    await act(async () => {
      setValue(element.querySelector<HTMLTextAreaElement>('textarea')!, 'Necesidad operativa');
      element.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    });
    expect(submit?.disabled).toBe(false);
    await act(async () => root.unmount());
  });
});
