// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../lib/api', () => ({ apiRequest }));

import { AuditLogPage } from './AuditLogPage';

const session = { access_token: 'test-token' } as never;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const auditEvent = (summary: string) => ({
  event_id: `${summary}-id`,
  occurred_at: '2026-10-01T12:00:00.000Z',
  actor_user_id: null,
  module: 'payments' as const,
  entity_type: 'payment',
  entity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  action: 'payment_recorded',
  severity: 'info' as const,
  summary,
  metadata: {},
  correlation_id: null,
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('AuditLogPage request ownership', () => {
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
  });

  const render = (condominiumId: string) =>
    act(async () => {
      root.render(
        createElement(AuditLogPage, {
          condominiumId,
          condominiumName: condominiumId,
          session,
        }),
      );
    });

  it('clears prior-scope rows immediately and ignores a stale old-scope failure', async () => {
    const c1Refresh = deferred<ReturnType<typeof auditEvent>[]>();
    const c2 = deferred<ReturnType<typeof auditEvent>[]>();
    let c1Calls = 0;
    apiRequest.mockImplementation((path: string) => {
      if (path.includes('/c1/')) {
        c1Calls += 1;
        return c1Calls === 1 ? Promise.resolve([auditEvent('Evento C1')]) : c1Refresh.promise;
      }
      if (path.includes('/c2/')) return c2.promise;
      return Promise.resolve([]);
    });

    await render('c1');
    await flush();
    expect(host.textContent).toContain('Evento C1');
    const moduleFilter = host.querySelector<HTMLSelectElement>('select')!;
    act(() => {
      moduleFilter.value = 'payments';
      moduleFilter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(moduleFilter.value).toBe('payments');
    act(() =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Actualizar'))
        ?.click(),
    );
    await flush();
    await render('c2');
    await flush();

    expect(host.querySelector('[aria-label="Cargando auditoría"]')).toBeTruthy();
    expect(host.textContent).not.toContain('Evento C1');
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('');

    await act(async () => c1Refresh.reject(new Error('old condominium failed')));
    await flush();
    expect(host.textContent).not.toContain('old condominium failed');

    await act(async () => c2.resolve([auditEvent('Evento C2')]));
    await flush();
    expect(host.textContent).toContain('Evento C2');
    expect(host.textContent).not.toContain('old condominium failed');
  });

  it('drops an old-scope response that resolves after the new scope', async () => {
    const c1 = deferred<ReturnType<typeof auditEvent>[]>();
    apiRequest.mockImplementation((path: string) => {
      if (path.includes('/c1/')) return c1.promise;
      if (path.includes('/c2/')) return Promise.resolve([auditEvent('Evento C2')]);
      return Promise.resolve([]);
    });

    await render('c1');
    await render('c2');
    await flush();
    expect(host.textContent).toContain('Evento C2');

    await act(async () => c1.resolve([auditEvent('Evento C1')]));
    await flush();
    expect(host.textContent).toContain('Evento C2');
    expect(host.textContent).not.toContain('Evento C1');
  });
});
