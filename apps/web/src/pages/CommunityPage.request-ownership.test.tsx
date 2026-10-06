// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../lib/roles';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../lib/api', () => ({ apiRequest }));

import { CommunityPage } from './CommunityPage';

const session = (token: string) => ({ access_token: token }) as never;

function unit(code: string) {
  return { id: `${code}-id`, code, status: 'active' };
}

function person(id: string, firstName: string, lastName: string) {
  return { id, first_name: firstName, last_name: lastName, email: `${id}@example.com`, phone: '', status: 'active' };
}

function responseFor(unitCode: string, personName: string, path: string) {
  if (path.endsWith('/units')) return [unit(unitCode)];
  if (path.endsWith('/buildings')) return [];
  if (path.endsWith('/people')) return [person(`${unitCode}-p`, personName, 'Residente')];
  return [{ property_topology: 'unspecified' }];
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

describe('CommunityPage request ownership', () => {
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

  const render = (condominiumId: string, token = 'token-1') =>
    act(async () => {
      root.render(
        createElement(
          RolesProvider,
          { value: ['condominium_admin'] },
          createElement(CommunityPage, {
            condominiumId,
            condominiumName: condominiumId,
            session: session(token),
            onNavigate: () => {},
          }),
        ),
      );
    });

  it('holds a mid-flight condominium switch pending, rendering neither the old nor the new condominium data, then renders only the new data once it resolves', async () => {
    const c2Units = deferred<ReturnType<typeof unit>[]>();

    apiRequest.mockImplementation((path: string) => {
      if (path.includes('/c2/') && path.endsWith('/units')) return c2Units.promise;
      if (path.includes('/c1/')) return Promise.resolve(responseFor('C1-101', 'Ana', path));
      if (path.includes('/c2/')) return Promise.resolve(responseFor('C2-205', 'Beto', path));
      return Promise.resolve([]);
    });

    await render('c1');
    await flush();
    expect(host.textContent).toContain('Ana');

    await render('c2');
    await flush();

    // The replacement condominium's response is still pending: the old condominium's directory
    // must already be gone, the new condominium's directory must not yet exist, and the full
    // Community loading state must be visible in their place.
    expect(host.querySelector('[aria-label="Cargando comunidad"]')).toBeTruthy();
    expect(host.textContent).not.toContain('Ana');
    expect(host.textContent).not.toContain('Beto');

    await act(async () => c2Units.resolve([unit('C2-205')]));
    await flush();

    expect(host.textContent).toContain('Beto');
    expect(host.textContent).not.toContain('Ana');
  });

  it('drops a stale condominium response that resolves after a later switch already loaded', async () => {
    const c1Units = deferred<ReturnType<typeof unit>[]>();

    apiRequest.mockImplementation((path: string) => {
      if (path.includes('/c1/') && path.endsWith('/units')) return c1Units.promise;
      if (path.includes('/c1/')) return Promise.resolve(responseFor('C1-101', 'Ana', path));
      if (path.includes('/c2/')) return Promise.resolve(responseFor('C2-205', 'Beto', path));
      return Promise.resolve([]);
    });

    await render('c1');
    await flush();

    await render('c2');
    await flush();
    expect(host.textContent).toContain('Beto');

    await act(async () => c1Units.resolve([unit('C1-101')]));
    await flush();

    expect(host.textContent).toContain('Beto');
    expect(host.textContent).not.toContain('Ana');
  });

  it('keeps the previously loaded directory visible through a same-condominium token refresh', async () => {
    apiRequest.mockImplementation((path: string) => Promise.resolve(responseFor('C1-101', 'Ana', path)));

    await render('c1', 'token-1');
    await flush();
    expect(host.textContent).toContain('Ana');

    await render('c1', 'token-2');
    await flush();

    expect(host.querySelector('[aria-label="Cargando comunidad"]')).toBeFalsy();
    expect(host.textContent).toContain('Ana');
  });
});
