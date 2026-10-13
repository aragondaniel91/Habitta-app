// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentsDrawerHost } from './PaymentsDrawers';
import { paymentApi } from '../features/payments/api';
import { RolesProvider } from '../lib/roles';

vi.mock('../features/payments/api', () => ({ paymentApi: vi.fn() }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.mocked(paymentApi);
const session = { access_token: 'test-token' } as Session;

const setValue = (
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) => {
  const prototype =
    control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value);
  control.dispatchEvent(
    new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
  );
};

const renderMethodsDrawer = () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  document.body.append(host);
  act(() => {
    root.render(
      <RolesProvider value={['condominium_admin']}>
        <PaymentsDrawerHost
          buildingNameById={{}}
          condominiumId="condominium-1"
          drawer={{ type: 'methods' }}
          methods={[]}
          onChanged={async () => undefined}
          onClose={() => undefined}
          receivables={[]}
          session={session}
          units={[]}
        />
      </RolesProvider>,
    );
  });
  return { host, root };
};

const typeSelect = (host: HTMLElement) =>
  host.querySelector<HTMLSelectElement>('select[name="methodType"]')!;
const submitForm = async (host: HTMLElement) => {
  await act(async () => {
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('manual payment method type-specific fields', () => {
  it('shows only the holder/bank/account fields for bank_transfer', () => {
    const { host, root } = renderMethodsDrawer();
    expect(host.querySelector('input[name="accountHolder"]')).not.toBeNull();
    expect(host.querySelector('input[name="bankName"]')).not.toBeNull();
    expect(host.querySelector('input[name="accountIdentifierMasked"]')).not.toBeNull();
    expect(host.querySelector('input[name="phoneMasked"]')).toBeNull();
    expect(host.querySelector('input[name="emailMasked"]')).toBeNull();
    act(() => root.unmount());
  });

  it('shows holder/bank/phone for pago_movil and hides account/email', () => {
    const { host, root } = renderMethodsDrawer();
    act(() => setValue(typeSelect(host), 'pago_movil'));
    expect(host.querySelector('input[name="accountHolder"]')).not.toBeNull();
    expect(host.querySelector('input[name="bankName"]')).not.toBeNull();
    expect(host.querySelector('input[name="phoneMasked"]')).not.toBeNull();
    expect(host.querySelector('input[name="accountIdentifierMasked"]')).toBeNull();
    expect(host.querySelector('input[name="emailMasked"]')).toBeNull();
    act(() => root.unmount());
  });

  it('shows holder/email/phone for zelle and hides bank/account', () => {
    const { host, root } = renderMethodsDrawer();
    act(() => setValue(typeSelect(host), 'zelle'));
    expect(host.querySelector('input[name="accountHolder"]')).not.toBeNull();
    expect(host.querySelector('input[name="emailMasked"]')).not.toBeNull();
    expect(host.querySelector('input[name="phoneMasked"]')).not.toBeNull();
    expect(host.querySelector('input[name="bankName"]')).toBeNull();
    expect(host.querySelector('input[name="accountIdentifierMasked"]')).toBeNull();
    act(() => root.unmount());
  });

  it('shows only delivery instructions for cash', () => {
    const { host, root } = renderMethodsDrawer();
    act(() => setValue(typeSelect(host), 'cash'));
    expect(host.querySelector('input[name="accountHolder"]')).toBeNull();
    expect(host.querySelector('input[name="bankName"]')).toBeNull();
    expect(host.querySelector('input[name="accountIdentifierMasked"]')).toBeNull();
    expect(host.querySelector('input[name="phoneMasked"]')).toBeNull();
    expect(host.querySelector('input[name="emailMasked"]')).toBeNull();
    expect(host.querySelector('textarea[name="instructions"]')).not.toBeNull();
    expect(host.textContent).toContain('Lugar e instrucciones para entregar efectivo');
    act(() => root.unmount());
  });

  it('shows beneficiary/bank/account and SWIFT/IBAN guidance for international_transfer', () => {
    const { host, root } = renderMethodsDrawer();
    act(() => setValue(typeSelect(host), 'international_transfer'));
    expect(host.querySelector('input[name="accountHolder"]')).not.toBeNull();
    expect(host.querySelector('input[name="bankName"]')).not.toBeNull();
    expect(host.querySelector('input[name="accountIdentifierMasked"]')).not.toBeNull();
    expect(host.textContent).toContain('SWIFT/BIC e IBAN');
    act(() => root.unmount());
  });

  it('shows account email + instructions, clearly manual, for paypal_manual', () => {
    const { host, root } = renderMethodsDrawer();
    act(() => setValue(typeSelect(host), 'paypal_manual'));
    expect(host.querySelector('input[name="emailMasked"]')).not.toBeNull();
    expect(host.querySelector('textarea[name="instructions"]')).not.toBeNull();
    expect(host.querySelector('input[name="bankName"]')).toBeNull();
    expect(host.querySelector('input[name="accountIdentifierMasked"]')).toBeNull();
    act(() => root.unmount());
  });

  it('shows only instructions for other', () => {
    const { host, root } = renderMethodsDrawer();
    act(() => setValue(typeSelect(host), 'other'));
    expect(host.querySelector('input[name="accountHolder"]')).toBeNull();
    expect(host.querySelector('textarea[name="instructions"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it('never submits fields belonging to a type the operator did not select', async () => {
    api.mockResolvedValue(undefined as never);
    const { host, root } = renderMethodsDrawer();
    act(() => setValue(typeSelect(host), 'zelle'));
    act(() => setValue(host.querySelector('input[name="displayName"]')!, 'Zelle administración'));
    act(() => setValue(host.querySelector('input[name="accountHolder"]')!, 'Habitta C.A.'));
    act(() => setValue(host.querySelector('input[name="emailMasked"]')!, 'pagos@habitta.test'));
    await submitForm(host);

    expect(api).toHaveBeenCalledOnce();
    const body = JSON.parse((api.mock.calls[0]?.[2] as { body: string }).body);
    expect(body.methodType).toBe('zelle');
    expect(body.accountHolder).toBe('Habitta C.A.');
    expect(body.emailMasked).toBe('pagos@habitta.test');
    expect(body.bankName).toBe('');
    expect(body.accountIdentifierMasked).toBe('');
    act(() => root.unmount());
  });

  it('uses truthful, non-masking labels', () => {
    const { host, root } = renderMethodsDrawer();
    expect(host.textContent).toContain('Número de cuenta');
    expect(host.textContent).not.toContain('Cuenta enmascarada');
    act(() => setValue(typeSelect(host), 'pago_movil'));
    expect(host.textContent).toContain('Teléfono');
    expect(host.textContent).not.toContain('Teléfono enmascarado');
    act(() => setValue(typeSelect(host), 'paypal_manual'));
    expect(host.textContent).toContain('Correo');
    expect(host.textContent).not.toContain('Correo enmascarado');
    act(() => root.unmount());
  });
});
