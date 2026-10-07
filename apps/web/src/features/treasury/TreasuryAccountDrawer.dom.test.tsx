// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountDrawer } from './TreasuryDrawers';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setControlValue = (control: HTMLInputElement | HTMLSelectElement, value: string) => {
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AccountDrawer Banco/Caja interaction', () => {
  it('removes and clears bank-only fields when the operator changes Banco to Caja', async () => {
    const onSubmit = vi.fn<(input: unknown) => Promise<void>>(() => Promise.resolve());
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);

    await act(async () => {
      root.render(<AccountDrawer onClose={() => {}} onSubmit={onSubmit} />);
    });

    expect(element.querySelector('input[placeholder="Banco de Venezuela"]')).not.toBeNull();
    expect(element.querySelector('input[placeholder="•••• 4821"]')).not.toBeNull();
    expect(element.querySelector('input[placeholder="Cuenta bancaria principal"]')).not.toBeNull();

    const name = element.querySelector<HTMLInputElement>('input[placeholder="Cuenta bancaria principal"]')!;
    const bankName = element.querySelector<HTMLInputElement>('input[placeholder="Banco de Venezuela"]')!;
    const reference = element.querySelector<HTMLInputElement>('input[placeholder="•••• 4821"]')!;
    const accountType = element.querySelector<HTMLSelectElement>('select')!;
    await act(async () => {
      setControlValue(name, 'Caja de cobros');
      setControlValue(bankName, 'Banco de pruebas');
      setControlValue(reference, '•••• 4821');
      setControlValue(accountType, 'cash');
    });

    expect(element.querySelector('input[placeholder="Banco de Venezuela"]')).toBeNull();
    expect(element.querySelector('input[placeholder="•••• 4821"]')).toBeNull();
    expect(element.querySelector('input[placeholder="Caja principal"]')).not.toBeNull();

    await act(async () => setControlValue(accountType, 'bank'));
    expect(element.querySelector<HTMLInputElement>('input[placeholder="Banco de Venezuela"]')?.value).toBe('');
    expect(element.querySelector<HTMLInputElement>('input[placeholder="•••• 4821"]')?.value).toBe('');
    await act(async () => setControlValue(accountType, 'cash'));

    await act(async () => {
      element.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ accountType: 'cash', name: 'Caja de cobros' }),
    );
    const submitted = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submitted).not.toHaveProperty('bankName');
    expect(submitted).not.toHaveProperty('accountReference');
    await act(async () => root.unmount());
  });

  it('has no account-opening-balance input and keeps Tipo and Moneda in the same layout track', () => {
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    act(() => root.render(<AccountDrawer onClose={() => {}} onSubmit={async () => undefined} />));

    const grid = element.querySelector('.treasury-account-type-grid');
    expect(grid?.querySelectorAll('.treasury-account-type-field')).toHaveLength(2);
    expect(element.textContent).toContain('Identificador de cuenta');
    expect(element.textContent).toContain('Últimos 4 dígitos, alias o referencia interna.');
    expect(element.textContent).not.toContain('Saldo inicial');
    expect(element.textContent).not.toContain('account_holder');
    act(() => root.unmount());
  });
});
