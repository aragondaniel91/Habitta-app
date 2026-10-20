// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AllocationInput, AllocationPreview, Receivable } from '../types';
import { PaymentAllocationEditor } from './PaymentAllocationEditor';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const charge: Receivable = {
  id: 'charge-1',
  unit_id: 'unit-1',
  description: 'Condominio octubre',
  currency_code: 'USD',
  outstanding_amount: '7.00',
};
const allocation: AllocationInput = {
  receivableItemId: charge.id,
  paymentAmount: '5.00',
  receivableAmount: '5.00',
  paymentCurrencyCode: 'USD',
  receivableCurrencyCode: 'USD',
  receivablePerPaymentRate: '1',
};
const preview: AllocationPreview = {
  total_used: '5.00',
  remaining: '0.00',
  errors: [],
  warnings: [],
  recognized_by_currency: { USD: '5.00' },
  allocations: [],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('reviewer uses resident distribution without choosing the obligation again', () => {
  it('previews the original allocation automatically; never exposes a selector or editable amount', async () => {
    const pending = deferred<AllocationPreview>();
    const onPreview = vi.fn(() => pending.promise);
    const onApprove = vi.fn(async () => {});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <PaymentAllocationEditor
          receivables={[charge]}
          paymentCurrency="USD"
          proposedAllocations={[allocation]}
          onPreview={onPreview}
          onApprove={onApprove}
        />,
      ),
    );
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith([allocation]);
    expect(host.querySelector('select')).toBeNull();
    expect(host.querySelector('input')).toBeNull();
    expect(host.textContent).toContain('Distribución indicada por el residente');
    expect(host.textContent).toContain('Aplicar 5.00 USD');
    expect(host.textContent).toContain('Validando automáticamente');
    await act(async () => pending.resolve(preview));
    expect(host.textContent).toContain('Usado: 5.00');
    const action = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Aprobar pago'),
    );
    expect(action).toBeDefined();
    await act(async () => action!.click());
    const confirm = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Confirmar aprobación'),
    );
    expect(confirm).toBeDefined();
    await act(async () => confirm!.click());
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onApprove).toHaveBeenCalledWith([allocation]);
    await act(async () => root.unmount());
  });

  it('blocks approval if the server rejects the proposal preview', async () => {
    const onPreview = vi.fn(async () => ({
      ...preview,
      errors: ['Saldo cambiado, se requiere corrección'],
    }));
    const onApprove = vi.fn(async () => {});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <PaymentAllocationEditor
          receivables={[charge]}
          paymentCurrency="USD"
          proposedAllocations={[allocation]}
          onPreview={onPreview}
          onApprove={onApprove}
        />,
      ),
    );
    const approveButton = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Aprobar pago'),
    );
    expect(approveButton?.disabled).toBe(true);
    expect(host.textContent).toContain('Saldo cambiado');
    expect(onApprove).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('retains manual selection only for historical payments with no intent', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onPreview = vi.fn(async () => preview);
    await act(async () =>
      root.render(
        <PaymentAllocationEditor
          receivables={[charge]}
          paymentCurrency="USD"
          onPreview={onPreview}
          onApprove={vi.fn()}
        />,
      ),
    );
    expect(host.querySelector('select')).not.toBeNull();
    expect(onPreview).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
