// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentMethod, Receivable } from '../types';
import { ResidentPaymentWizard } from './ResidentPaymentWizard';

vi.mock('../api', () => ({ paymentApi: vi.fn(), paymentProof: vi.fn() }));
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = { access_token: 'test', user: { id: 'admin-1' } } as Session;
const methods: PaymentMethod[] = [
  {
    id: 'cash',
    currency_code: 'USD',
    display_name: 'Efectivo',
    is_active: true,
    method_type: 'cash',
    requires_reference: false,
    requires_proof: false,
  },
];
const units = [
  { id: 'unit-1', label: 'A-101' },
  { id: 'unit-2', label: 'B-202' },
];
const charge = (id: string, unitId: string): Receivable => ({
  id,
  unit_id: unitId,
  description: 'Cuota ' + id,
  outstanding_amount: '7.00',
  currency_code: 'USD',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function choose(field: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(field, value);
  field.dispatchEvent(new Event('change', { bubbles: true }));
}
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('financial payment wizard: unit-scoped on-demand balances', () => {
  it('loads only after unit selection and shows authoritative outstanding', async () => {
    const pending = deferred<Receivable[]>();
    const loader = vi.fn(() => pending.promise);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <ResidentPaymentWizard
          condominiumId="condo"
          context="administrator"
          loadReceivablesForUnit={loader}
          receivables={[]}
          methods={methods}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDraftCreated={vi.fn()}
          session={session}
          units={units}
        />,
      ),
    );
    expect(loader).not.toHaveBeenCalled();
    await act(async () => choose(host.querySelector('select')!, 'unit-1'));
    expect(loader).toHaveBeenCalledExactlyOnceWith('unit-1');
    expect(host.textContent).toContain('Cargando saldos pendientes');
    expect(host.querySelectorAll('select')).toHaveLength(1);
    await act(async () => pending.resolve([charge('rec-1', 'unit-1')]));
    await act(async () => choose(host.querySelectorAll('select')[1]!, 'USD'));
    expect(host.textContent).toContain('Cuota rec-1');
    expect(host.textContent).toContain('Pendiente 7.00 USD');
    await act(async () => root.unmount());
  });

  it('cannot use an obsolete previous-unit response when user changes units', async () => {
    const first = deferred<Receivable[]>(),
      second = deferred<Receivable[]>();
    const loader = vi.fn((unitId: string) =>
      unitId === 'unit-1' ? first.promise : second.promise,
    );
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <ResidentPaymentWizard
          condominiumId="condo"
          context="administrator"
          loadReceivablesForUnit={loader}
          receivables={[]}
          methods={methods}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDraftCreated={vi.fn()}
          session={session}
          units={units}
        />,
      ),
    );
    await act(async () => choose(host.querySelector('select')!, 'unit-1'));
    await act(async () => choose(host.querySelector('select')!, 'unit-2'));
    await act(async () => first.resolve([charge('old', 'unit-1')]));
    expect(host.textContent).toContain('Cargando saldos pendientes');
    expect(host.textContent).not.toContain('Cuota old');
    await act(async () => second.resolve([charge('new', 'unit-2')]));
    await act(async () => choose(host.querySelectorAll('select')[1]!, 'USD'));
    expect(host.textContent).toContain('Cuota new');
    expect(host.textContent).not.toContain('Cuota old');
    await act(async () => root.unmount());
  });

  it('fails closed on an unavailable snapshot and supports retry', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('Saldo no verificable'))
      .mockResolvedValueOnce([charge('ok', 'unit-1')]);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <ResidentPaymentWizard
          condominiumId="condo"
          context="administrator"
          loadReceivablesForUnit={loader}
          receivables={[]}
          methods={methods}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDraftCreated={vi.fn()}
          session={session}
          units={[units[0]!]}
        />,
      ),
    );
    expect(host.textContent).toContain('Saldo no verificable');
    expect(host.querySelectorAll('select')).toHaveLength(1);
    const retry = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Reintentar carga de cuotas'),
    );
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(loader).toHaveBeenCalledTimes(2);
    await act(async () => choose(host.querySelectorAll('select')[1]!, 'USD'));
    expect(host.textContent).toContain('Cuota ok');
    await act(async () => root.unmount());
  });
});
