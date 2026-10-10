// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../../lib/roles';
import { AccountStatementDrawer } from './AccountStatementDrawer';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AccountStatementDrawer', () => {
  it('loads a selected unit directly and summarizes ledger activity by currency', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/account-statement')) {
          return new Response(JSON.stringify({
            account: { condominium_name: 'Prueba', unit_code: 'A-101' },
            period: { from: null, to: '2026-01-31' }, owners: [],
            opening_balances: [{ currency_code: 'USD', amount: '20' }],
            movements: [{ ledger_entry_id: '1', effective_date: '2026-01-10', description: 'Cuota', entry_type: 'charge', debit: '100', credit: null, running_balance: '120', currency_code: 'USD' }, { ledger_entry_id: '2', effective_date: '2026-01-11', description: 'Pago', entry_type: 'payment_credit', debit: null, credit: '25', running_balance: '95', currency_code: 'USD' }],
            closing_balances: [{ currency_code: 'USD', amount: '95' }],
          }));
        }
        if (url.includes('/solvency?')) return new Response(JSON.stringify({ eligible: false, as_of_date: '2026-01-31', balances: [], policy: { balance_basis: 'outstanding', grace_days: 0, tolerance_per_currency: '0', certificate_validity_days: 30 } }));
        return new Response(JSON.stringify([]));
      }),
    );
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () => root.render(<RolesProvider value={['board_member']}><AccountStatementDrawer buildingNameById={{}} condominiumId="condominium-1" onClose={() => undefined} session={{ access_token: 'token' } as never} units={[{ id: 'unit-1', code: 'A-101', building_id: null }]} /></RolesProvider>));
    const select = element.querySelector('select')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'unit-1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(element.textContent).toContain('Actividad del período');
    expect(element.textContent).toContain('Cargos');
    expect(element.textContent).toContain('Pagos aplicados');
    expect(element.textContent!.indexOf('Saldo al cierre')).toBeLessThan(
      element.textContent!.indexOf('Solvencia al'),
    );
    expect(element.textContent).not.toContain('Configurar política financiera');
    await act(async () => root.unmount());
  });
});
