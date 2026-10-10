// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DashboardPayment,
  DashboardReceivable,
  DashboardUnit,
  ReceivableAging,
  ReceivableSummary,
} from '../lib/dashboard';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../lib/api', () => ({ apiRequest }));

import { ReportsPage } from './ReportsPage';

const session = (token: string) => ({ access_token: token }) as never;

type Dataset = {
  units: DashboardUnit[];
  receivables: DashboardReceivable[];
  payments: DashboardPayment[];
  summaries: ReceivableSummary[];
  aging: ReceivableAging[];
};

function dataset(unitCode: string, currencyCode: string, amount: string): Dataset {
  return {
    units: [{ id: `${unitCode}-id`, code: unitCode, status: 'active' }],
    receivables: [
      {
        id: `${unitCode}-receivable`,
        unit_id: `${unitCode}-id`,
        description: 'Cuota de mantenimiento',
        currency_code: currencyCode,
        outstanding_amount: amount,
        original_amount: amount,
        status: 'open',
        issue_date: '2026-09-01',
        due_date: '2026-09-10',
      },
    ],
    payments: [],
    summaries: [
      {
        currency_code: currencyCode,
        net_outstanding: amount,
        total_debits: amount,
        total_credits: '0',
      },
    ],
    aging: [
      {
        currency_code: currencyCode,
        current_amount: amount,
        days_1_30: '0',
        days_31_60: '0',
        days_61_90: '0',
        over_90: '0',
      },
    ],
  };
}

function twoCurrencyDataset(): Dataset {
  const usd = dataset('C1-USD', 'USD', '50.00');
  const ves = dataset('C1-VES', 'VES', '900.00');
  return {
    units: [...usd.units, ...ves.units],
    receivables: [...usd.receivables, ...ves.receivables],
    payments: [],
    summaries: [...usd.summaries, ...ves.summaries],
    aging: [...usd.aging, ...ves.aging],
  };
}

function responseFor(data: Dataset, path: string) {
  if (path.endsWith('/units')) return data.units;
  if (path.endsWith('/receivables/summary')) return data.summaries;
  if (path.endsWith('/receivables/aging')) return data.aging;
  if (path.endsWith('/receivables')) return data.receivables;
  if (path.endsWith('/payments')) return data.payments;
  return [];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function findButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}; visible: ${document.body.textContent}`);
  return button;
}

function selectValue(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ReportsPage request ownership', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const render = (condominiumId: string, token = 'token-1') =>
    act(async () => {
      root.render(
        createElement(ReportsPage, {
          condominiumId,
          condominiumName: condominiumId,
          session: session(token),
        }),
      );
    });

  it('holds a mid-flight condominium switch pending, rendering neither the old nor the new condominium data, then renders only the new data once it resolves', async () => {
    const c1 = dataset('C1-101', 'USD', '50.00');
    const c2 = dataset('C2-205', 'VES', '900.00');
    const c2Units = deferred<DashboardUnit[]>();

    apiRequest.mockImplementation((path: string) => {
      if (path.includes('/c2/') && path.endsWith('/units')) return c2Units.promise;
      if (path.includes('/c1/')) return Promise.resolve(responseFor(c1, path));
      if (path.includes('/c2/')) return Promise.resolve(responseFor(c2, path));
      return Promise.resolve([]);
    });

    await render('c1');
    await flush();
    expect(host.textContent).toContain('C1-101');

    await render('c2');
    await flush();

    // The replacement condominium's response is still pending: the old condominium's figures
    // must already be gone, the new condominium's figures must not yet exist, and the Reports
    // loading state must be visible in their place.
    expect(host.querySelector('[aria-label="Cargando reportes"]')).toBeTruthy();
    expect(host.textContent).not.toContain('C1-101');
    expect(host.textContent).not.toContain('C2-205');

    await act(async () => c2Units.resolve(c2.units));
    await flush();

    expect(host.textContent).toContain('C2-205');
    expect(host.textContent).not.toContain('C1-101');
  });

  it('drops a stale condominium response that resolves after a later switch already loaded', async () => {
    const c1 = dataset('C1-101', 'USD', '50.00');
    const c2 = dataset('C2-205', 'VES', '900.00');
    const c1Units = deferred<DashboardUnit[]>();

    apiRequest.mockImplementation((path: string) => {
      if (path.includes('/c1/') && path.endsWith('/units')) return c1Units.promise;
      if (path.includes('/c1/')) return Promise.resolve(responseFor(c1, path));
      if (path.includes('/c2/')) return Promise.resolve(responseFor(c2, path));
      return Promise.resolve([]);
    });

    await render('c1');
    await flush();

    await render('c2');
    await flush();
    expect(host.textContent).toContain('C2-205');

    await act(async () => c1Units.resolve(c1.units));
    await flush();

    expect(host.textContent).toContain('C2-205');
    expect(host.textContent).not.toContain('C1-101');
  });

  it('preserves the selected period and currency through a same-condominium token refresh', async () => {
    const data = twoCurrencyDataset();
    apiRequest.mockImplementation((path: string) => Promise.resolve(responseFor(data, path)));

    await render('c1', 'token-1');
    await flush();

    act(() => findButton('VES').click());
    await flush();
    expect(host.textContent).toContain('C1-VES');

    const periodSelect = host.querySelector<HTMLSelectElement>(
      '[aria-label="Período del reporte"]',
    )!;
    act(() => selectValue(periodSelect, '3'));
    await flush();

    await render('c1', 'token-2');
    await flush();

    expect(host.querySelector<HTMLSelectElement>('[aria-label="Período del reporte"]')?.value).toBe(
      '3',
    );
    expect(findButton('VES').getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('C1-VES');
  });
});
