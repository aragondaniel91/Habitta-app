// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person, PersonRelationshipView } from './types';

const {
  api,
  createInvitation,
  revokeInvitation,
  listInvitations,
  listDeliveryEvents,
  drawerCallbacks,
  editorCallbacks,
} = vi.hoisted(() => ({
  api: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  listInvitations: vi.fn(),
  listDeliveryEvents: vi.fn(),
  drawerCallbacks: {
    onChanged: undefined as undefined | ((message: string) => Promise<void> | void),
    onClose: undefined as undefined | (() => void),
  },
  editorCallbacks: {
    onSaved: undefined as undefined | ((person: Person, message: string) => Promise<void> | void),
  },
}));

vi.mock('./api', () => ({ peopleApi: api }));
vi.mock('../../lib/residentAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/residentAccess')>()),
  createResidentInvitation: createInvitation,
  revokeResidentInvitation: revokeInvitation,
  listResidentInvitations: listInvitations,
  listResidentInvitationDeliveryEvents: listDeliveryEvents,
}));
vi.mock('./PersonUnitRelationshipDrawerV3', () => ({
  PersonUnitRelationshipDrawerV3: (props: {
    onChanged: (message: string) => Promise<void> | void;
    onClose: () => void;
    onRequestClose: (target: { kind: 'ownership'; id: string; label: string }) => void;
  }) => {
    drawerCallbacks.onChanged = props.onChanged;
    drawerCallbacks.onClose = props.onClose;
    return createElement('div', { role: 'dialog' }, [
      'Relationship drawer',
      createElement(
        'button',
        { key: 'close', onClick: props.onClose, type: 'button' },
        'Close relationship drawer',
      ),
      createElement(
        'button',
        {
          key: 'request-close',
          onClick: () =>
            props.onRequestClose({ kind: 'ownership', id: 'ownership-a', label: 'test ownership' }),
          type: 'button',
        },
        'Request relationship close',
      ),
    ]);
  },
}));
vi.mock('./PersonEditorDrawerV3', () => ({
  PersonEditorDrawerV3: (props: {
    onSaved: (person: Person, message: string) => Promise<void> | void;
  }) => {
    editorCallbacks.onSaved = props.onSaved;
    return createElement('div', { role: 'dialog' }, 'Person editor');
  },
}));

import { PeoplePanelV3 } from './PeoplePanelV3';

const person = (id: string): Person => ({
  id,
  first_name: id.toUpperCase(),
  last_name: 'Resident',
  email: `${id}@example.com`,
  status: 'active',
});
const people = [person('a'), person('b')];
const relationship = (id: string): PersonRelationshipView => ({
  person: person(id),
  ownerships: [
    {
      id: `ownership-${id}`,
      person_id: id,
      unit_id: 'u1',
      starts_at: '2026-01-01',
      units: { id: 'u1', code: `Unit ${id.toUpperCase()}`, condominium_id: 'c1' },
    },
  ],
  occupancies: [],
  condominiumRelationships: [],
});
const notes = { authorized: true, revisions: [] };
const communication = { assignments: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function click(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}; visible: ${document.body.textContent}`);
  act(() => button.click());
}
function directoryPersonButton(label: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.people-v3-directory__item'),
  ).find((item) => item.textContent?.includes(label));
  if (!button) throw new Error(`Directory person not found: ${label}`);
  return button;
}
function changeDirectorySearch(value: string) {
  const input = document.querySelector('input[type="search"]') as HTMLInputElement | null;
  if (!input) throw new Error('Directory search input not found');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function changeDirectoryStatus(value: string) {
  const select = document.querySelector('.people-v3-directory select') as HTMLSelectElement | null;
  if (!select) throw new Error('Directory status filter not found');
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function setViewport({
  mobile,
  reducedMotion = false,
}: {
  mobile: boolean;
  reducedMotion?: boolean;
}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width: 860px') ? mobile : reducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('PeoplePanelV3 request ownership', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    drawerCallbacks.onChanged = undefined;
    drawerCallbacks.onClose = undefined;
    editorCallbacks.onSaved = undefined;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    listInvitations.mockResolvedValue([]);
    listDeliveryEvents.mockResolvedValue([]);
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units'))
        return Promise.resolve([{ id: 'u1', code: '101', status: 'active' }]);
      if (path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('/communication-responsibilities')) return Promise.resolve(communication);
      if (path.endsWith('/admin-notes')) return Promise.resolve(notes);
      if (path.includes('/relationships'))
        return Promise.resolve(relationship(path.includes('/people/a/') ? 'a' : 'b'));
      return Promise.resolve({});
    });
    await act(async () => {
      root.render(
        createElement(PeoplePanelV3, {
          condominiumId: 'c1',
          condominiumName: 'Test',
          session: {} as never,
        }),
      );
    });
    await flush();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('settles a pointer-selected mobile profile at its top-bar offset without moving focus', async () => {
    vi.useFakeTimers();
    setViewport({ mobile: true });
    const a = directoryPersonButton('A Resident');
    a.focus();
    const profileAnchor = host.querySelector('.people-v3-profile-anchor') as HTMLDivElement;
    let profileTop = 407.64;
    vi.stubGlobal('scrollY', 1091);
    vi.spyOn(profileAnchor, 'getBoundingClientRect').mockImplementation(
      () => ({ top: profileTop }) as DOMRect,
    );
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      scrollMarginTop: '80px',
    } as CSSStyleDeclaration);
    function scrollToMock(options?: ScrollToOptions): void;
    function scrollToMock(x?: number, y?: number): void;
    function scrollToMock(options?: ScrollToOptions | number): void {
      if (typeof options !== 'number' && options?.behavior === 'auto') profileTop = 80;
    }
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(scrollToMock);

    await act(async () => {
      a.click();
      await vi.advanceTimersByTimeAsync(20);
    });

    const scrollOptions = scrollTo.mock.calls[0]?.[0] as ScrollToOptions;
    expect(scrollOptions.behavior).toBe('smooth');
    expect(scrollOptions.top).toBeCloseTo(1418.64);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: 'auto', top: expect.closeTo(1418.64) }),
    );
    expect(profileAnchor.getBoundingClientRect().top).toBe(80);
    expect(document.activeElement).toBe(a);
  });

  it('focuses a keyboard-selected mobile profile heading after its smooth reveal completes', async () => {
    setViewport({ mobile: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const b = directoryPersonButton('B Resident');
    b.focus();
    const profileAnchor = host.querySelector('.people-v3-profile-anchor') as HTMLDivElement;
    let profileTop = 616;
    vi.spyOn(profileAnchor, 'getBoundingClientRect').mockImplementation(
      () => ({ top: profileTop }) as DOMRect,
    );
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      scrollMarginTop: '88px',
    } as CSSStyleDeclaration);

    await act(async () => {
      b.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      b.click();
    });
    await flush();

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 528 });
    expect(document.activeElement).toBe(b);

    await act(async () => window.dispatchEvent(new Event('scrollend')));

    expect(document.activeElement).toBe(b);
    expect(scrollTo).toHaveBeenCalledTimes(2);

    profileTop = 88;
    await act(async () => window.dispatchEvent(new Event('scrollend')));

    expect(document.activeElement).toBe(host.querySelector('.people-v3-profile-header h2'));
  });

  it('corrects a stalled keyboard reveal before the focus fallback runs', async () => {
    vi.useFakeTimers();
    setViewport({ mobile: true });
    let profileTop = 616;
    function scrollToMock(options?: ScrollToOptions): void;
    function scrollToMock(x?: number, y?: number): void;
    function scrollToMock(options?: ScrollToOptions | number): void {
      if (typeof options !== 'number' && options?.behavior === 'auto') profileTop = 88;
    }
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(scrollToMock);
    const b = directoryPersonButton('B Resident');
    b.focus();
    const profileAnchor = host.querySelector('.people-v3-profile-anchor') as HTMLDivElement;
    vi.spyOn(profileAnchor, 'getBoundingClientRect').mockImplementation(
      () => ({ top: profileTop }) as DOMRect,
    );
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      scrollMarginTop: '88px',
    } as CSSStyleDeclaration);

    await act(async () => {
      b.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      b.click();
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(document.activeElement).toBe(b);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: 'auto', top: 528 });
    expect(profileAnchor.getBoundingClientRect().top).toBe(88);
    expect(document.activeElement).toBe(host.querySelector('.people-v3-profile-header h2'));
  });

  it('ignores a superseded mobile selection reveal', async () => {
    setViewport({ mobile: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    await act(async () => {
      directoryPersonButton('A Resident').click();
      directoryPersonButton('B Resident').click();
    });
    await flush();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.people-v3-profile-header h2')?.textContent).toBe('B Resident');
  });

  it('uses instant mobile scrolling when reduced motion is preferred', async () => {
    setViewport({ mobile: true, reducedMotion: true });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    await act(async () => directoryPersonButton('A Resident').click());
    await flush();

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('does not reveal or move focus for a desktop directory selection', async () => {
    setViewport({ mobile: false });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const a = directoryPersonButton('A Resident');
    a.focus();

    await act(async () => a.click());
    await flush();

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(a);
  });

  it('marks only the current directory person and transfers that state after click and keyboard activation', async () => {
    const a = directoryPersonButton('A Resident');
    const b = directoryPersonButton('B Resident');

    expect(a.getAttribute('aria-current')).toBeNull();
    expect(b.getAttribute('aria-current')).toBeNull();

    await act(async () => a.click());
    expect(a.getAttribute('aria-current')).toBe('true');
    expect(b.getAttribute('aria-current')).toBeNull();

    // Native buttons activate on Enter. jsdom does not perform that default action,
    // so dispatch the browser-equivalent click after the keyboard event.
    await act(async () => {
      b.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      b.click();
    });
    expect(a.getAttribute('aria-current')).toBeNull();
    expect(b.getAttribute('aria-current')).toBe('true');
  });

  it('keeps B complete when A finishes late, without A relationships, invitations, messages, or errors', async () => {
    const a = deferred<PersonRelationshipView>();
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) return a.promise;
      if (path.includes('/people/b/relationships')) return Promise.resolve(relationship('b'));
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('A Resident');
    click('B Resident');
    await flush();
    await act(async () => a.resolve(relationship('a')));
    await flush();
    expect(host.textContent).toContain('B Resident');
    expect(host.textContent).not.toContain('Unit A');
    expect(host.textContent).not.toContain('A failed');
    expect(host.textContent).not.toContain('A saved');
  });

  it('describes a genuinely empty Personas directory without a filter-reset action', async () => {
    await act(async () => root.unmount());
    root = createRoot(host);
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people') || path.endsWith('/units') || path.endsWith('/buildings')) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
    await act(async () => {
      root.render(
        createElement(PeoplePanelV3, {
          condominiumId: 'empty',
          condominiumName: 'Empty',
          session: {} as never,
        }),
      );
    });
    await flush();

    expect(host.textContent).toContain('Aún no hay personas registradas');
    expect(host.textContent).not.toContain('Restablecer filtro');
    expect(host.textContent).not.toContain('Limpiar filtros');
  });

  it('offers a reset only when a status filter removes otherwise matching people', async () => {
    changeDirectoryStatus('inactive');
    await flush();

    expect(host.textContent).toContain('Ninguna persona coincide con el filtro');
    expect(host.textContent).toContain('Restablecer filtro');
    click('Restablecer filtro');
    await flush();

    expect(host.textContent).toContain('A Resident');
    expect((document.querySelector('.people-v3-directory select') as HTMLSelectElement).value).toBe(
      '',
    );
  });

  it('describes search-only no results without offering a filter reset', async () => {
    changeDirectoryStatus('active');
    changeDirectorySearch('no existe');
    await flush();

    expect(host.textContent).toContain('No encontramos resultados para tu búsqueda');
    expect(host.textContent).not.toContain('Restablecer filtro');
  });

  it('keeps directory metrics sourced from the full directory when results are filtered', async () => {
    changeDirectorySearch('a resident');
    await flush();

    const metricValues = Array.from(
      host.querySelectorAll('.ux-metric-card strong'),
      (item) => item.textContent,
    );
    expect(metricValues).toEqual(['2', '2', '2']);
    expect(
      host.querySelector('.people-v3-directory__heading .badge')?.getAttribute('aria-label'),
    ).toBe('Personas mostradas: 1 de 2');
    expect(host.querySelector('.people-v3-directory__footer')?.textContent).toContain(
      'Mostrando 1 de 2 personas registradas',
    );
  });

  it('retries a failed directory load and recovers its results', async () => {
    await act(async () => root.unmount());
    root = createRoot(host);
    let directoryAttempts = 0;
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people')) {
        directoryAttempts += 1;
        return directoryAttempts === 1
          ? Promise.reject(new Error('Directory unavailable'))
          : Promise.resolve(people);
      }
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      return Promise.resolve({});
    });
    await act(async () => {
      root.render(
        createElement(PeoplePanelV3, {
          condominiumId: 'failed',
          condominiumName: 'Failed',
          session: {} as never,
        }),
      );
    });
    await flush();

    expect(host.textContent).toContain('No se pudo cargar el directorio');
    expect(host.textContent).toContain('Directory unavailable');
    expect(
      Array.from(host.querySelectorAll('.ux-metric-card strong'), (item) => item.textContent),
    ).toEqual(['—', '—', '—']);
    expect(host.querySelector('.people-v3-directory__heading .badge')?.textContent).toBe('—');
    expect(
      host.querySelector('.people-v3-directory__heading .badge')?.getAttribute('aria-label'),
    ).toBe('Personas mostradas: Sin datos');
    expect(host.querySelector('.people-v3-directory__footer')?.textContent).toContain(
      'Conteo no disponible',
    );
    expect(host.querySelector('.people-v3-directory__footer')?.textContent).not.toContain(
      'Mostrando 0 de 0',
    );
    click('Reintentar');
    await flush();

    expect(directoryAttempts).toBe(2);
    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).not.toContain('No se pudo cargar el directorio');
    expect(
      Array.from(host.querySelectorAll('.ux-metric-card strong'), (item) => item.textContent),
    ).toEqual(['2', '2', '2']);
    expect(
      host.querySelector('.people-v3-directory__heading .badge')?.getAttribute('aria-label'),
    ).toBe('Personas mostradas: 2 de 2');
    expect(host.querySelector('.people-v3-directory__footer')?.textContent).toContain(
      'Mostrando 2 de 2 personas registradas',
    );
  });

  it('announces a first-load directory failure and retains retry focus while another retry fails', async () => {
    await act(async () => root.unmount());
    root = createRoot(host);
    const retry = deferred<never[]>();
    let directoryAttempts = 0;
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people')) {
        directoryAttempts += 1;
        return directoryAttempts === 1
          ? Promise.reject(new Error('Directory unavailable'))
          : retry.promise;
      }
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      return Promise.resolve({});
    });
    await act(async () => {
      root.render(
        createElement(PeoplePanelV3, {
          condominiumId: 'failed-retry',
          condominiumName: 'Failed retry',
          session: {} as never,
        }),
      );
    });
    await flush();

    const alert = host.querySelector('[role="alert"]');
    const retryButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reintentar'),
    );
    expect(alert?.textContent).toContain('No se pudo cargar el directorio');
    expect(alert?.textContent).toContain('Directory unavailable');
    expect(host.querySelector('.people-v3-directory .empty-state')).toBeNull();
    expect(retryButton).toBeTruthy();

    retryButton?.focus();
    await act(async () => retryButton?.click());

    expect(directoryAttempts).toBe(2);
    expect(document.activeElement).toBe(retryButton);
    expect(host.querySelector('[role="alert"]')).toBe(alert);

    await act(async () => retry.reject(new Error('Directory still unavailable')));
    await flush();

    expect(document.activeElement).toBe(retryButton);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Directory still unavailable',
    );
  });

  it('drops stale invitation and revoke re-lists after selection changes', async () => {
    const reList = deferred<never[]>();
    createInvitation.mockResolvedValue({
      invitation: { id: 'new' },
      invitationUrl: 'https://invite',
      auditPersisted: true,
      emailDelivery: { status: 'disabled', recipient: null, provider: 'test', mode: 'test' },
    });
    listInvitations.mockReturnValueOnce([]).mockReturnValueOnce([]).mockReturnValue(reList.promise);
    click('A Resident');
    await flush();
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();
    click('B Resident');
    await flush();
    await act(async () => reList.resolve([]));
    await flush();
    expect(host.textContent).toContain('B Resident');
    expect(host.textContent).not.toContain('Enlace seguro listo');

    const invitation = {
      id: 'old',
      condominium_id: 'c1',
      person_id: 'a',
      unit_id: 'u1',
      email: 'a@example.com',
      intended_role: 'owner' as const,
      status: 'pending' as const,
      expires_at: '2027-01-01',
      accepted_at: null,
      revoked_at: null,
      created_at: '2026-01-01',
    };
    listInvitations.mockResolvedValue([invitation]);
    revokeInvitation.mockResolvedValue(invitation);
    click('A Resident');
    await flush();
    click('Acceso digital');
    await flush();
    click('Revocar');
    const revokeReList = deferred<(typeof invitation)[]>();
    listInvitations.mockImplementation((_condominiumId: string, personId?: string) =>
      personId === 'a' ? revokeReList.promise : Promise.resolve([]),
    );
    click('Revocar invitación');
    await flush();
    click('B Resident');
    await flush();
    await act(async () => revokeReList.resolve([]));
    await flush();
    expect(revokeInvitation).toHaveBeenCalledWith('old');
    expect(host.textContent).toContain('B Resident');
    expect(host.textContent).not.toContain('a@example.com');
  });

  it('drops a stale drawer callback after the selected person changes', async () => {
    click('A Resident');
    await flush();
    click('Vincular unidad');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    const staleOnChanged = drawerCallbacks.onChanged!;
    click('B Resident');
    await flush();
    await staleOnChanged('A drawer saved');
    await flush();
    expect(host.textContent).toContain('B Resident');
    expect(host.textContent).not.toContain('Unit A');
    expect(host.textContent).not.toContain('A drawer saved');
  });

  it('does not surface a same-person refresh failure after a newer load succeeds', async () => {
    const staleRefresh = deferred<PersonRelationshipView>();
    let relationshipLoads = 0;
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 2 ? staleRefresh.promise : Promise.resolve(relationship('a'));
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('A Resident');
    await flush();
    click('Vincular unidad');
    const refreshFromDrawer = drawerCallbacks.onChanged!;
    let pendingRefresh: Promise<void> | void;
    act(() => {
      pendingRefresh = refreshFromDrawer('Drawer saved');
    });
    await flush();

    click('A Resident');
    await flush();
    await act(async () => {
      staleRefresh.reject(new Error('Stale refresh failed'));
      await pendingRefresh;
    });
    await flush();

    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).not.toContain('Stale refresh failed');
    expect(host.textContent).not.toContain('Reintentar');
  });

  it('clears a failed refresh error after a successful drawer refresh', async () => {
    let relationshipLoads = 0;
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 2
          ? Promise.reject(new Error('Drawer refresh failed'))
          : Promise.resolve(relationship('a'));
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('A Resident');
    await flush();
    click('Vincular unidad');
    const refreshFromDrawer = drawerCallbacks.onChanged!;

    await act(async () => {
      await refreshFromDrawer('Drawer saved');
    });
    await flush();
    expect(host.textContent).toContain('Drawer refresh failed');
    expect(host.textContent).toContain('Reintentar');

    await act(async () => {
      await refreshFromDrawer('Drawer saved');
    });
    await flush();
    expect(host.textContent).toContain('Drawer saved');
    expect(host.textContent).not.toContain('Drawer refresh failed');
    expect(host.textContent).not.toContain('Reintentar');
  });

  it('cleans stale busy state after a selection change', async () => {
    const pending = deferred<unknown>();
    createInvitation.mockReturnValue(pending.promise);
    click('A Resident');
    await flush();
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    expect(host.textContent).toContain('Creando');
    click('B Resident');
    await flush();
    expect(host.textContent).not.toContain('Creando');
    await act(async () => pending.resolve({}));
    await flush();
    expect(host.textContent).toContain('B Resident');
  });

  it('keeps a same-person mutation error after a repeated row click', async () => {
    const pending = deferred<unknown>();
    createInvitation.mockReturnValue(pending.promise);
    click('A Resident');
    await flush();
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();

    // A repeated click starts a newer profile load, but must not make the
    // invitation operation stale: the selected person did not change.
    click('A Resident');
    await flush();
    await act(async () => pending.reject(new Error('Invitation failed')));
    await flush();

    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).toContain('Invitation failed');
  });

  it('keeps a same-person mutation success after a repeated row click', async () => {
    const pending = deferred<{
      invitation: { id: string };
      invitationUrl: string;
      auditPersisted: boolean;
      emailDelivery: { status: 'disabled'; recipient: null; provider: string; mode: string };
    }>();
    createInvitation.mockReturnValue(pending.promise);
    click('A Resident');
    await flush();
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();
    click('A Resident');
    await flush();
    await act(async () =>
      pending.resolve({
        invitation: { id: 'new' },
        invitationUrl: 'https://invite',
        auditPersisted: true,
        emailDelivery: { status: 'disabled', recipient: null, provider: 'test', mode: 'test' },
      }),
    );
    await flush();

    expect(host.textContent).toContain('Invitación creada.');
  });

  it('replaces a first failed B profile load instead of showing empty relationships or link actions', async () => {
    let bAttempts = 0;
    api.mockImplementation((path: string) => {
      if (path.includes('/people/b/relationships'))
        return ++bAttempts === 1
          ? Promise.reject(new Error('B failed'))
          : Promise.resolve(relationship('b'));
      if (path.includes('/people/a/relationships')) return Promise.resolve(relationship('a'));
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('A Resident');
    await flush();
    click('B Resident');
    await flush();
    expect(host.textContent).toContain('B failed');
    expect(host.textContent).not.toContain('Unit A');
    expect(host.textContent).not.toContain('Relaciones actuales');
    expect(host.textContent).not.toContain('Sin relaciones activas con unidades');
    expect(host.textContent).not.toContain('Vincular unidad');
    click('Reintentar');
    await flush();
    expect(bAttempts).toBe(2);
    expect(host.textContent).toContain('B Resident');
  });

  it('retries a failed profile refresh without clearing the invitation link or active tab', async () => {
    let relationshipLoads = 0;
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 2
          ? Promise.reject(new Error('Profile refresh failed'))
          : Promise.resolve(relationship('a'));
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units'))
        return Promise.resolve([{ id: 'u1', code: '101', status: 'active' }]);
      if (path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    createInvitation.mockResolvedValue({
      invitation: { id: 'new' },
      invitationUrl: 'https://invite',
      auditPersisted: true,
      emailDelivery: { status: 'disabled', recipient: null, provider: 'test', mode: 'test' },
    });

    click('A Resident');
    await flush();
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="Enlace seguro de invitación"]')?.value,
    ).toBe('https://invite');

    click('Resumen');
    await flush();
    click('Vincular unidad');
    await act(async () => {
      await drawerCallbacks.onChanged!('Relationship saved');
    });
    await flush();
    click('Acceso digital');
    await flush();
    expect(host.textContent).toContain('Profile refresh failed');
    expect(host.textContent).toContain('Reintentar');
    expect(host.textContent).toContain('Invitar a Habitta');
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="Enlace seguro de invitación"]')?.value,
    ).toBe('https://invite');

    click('Reintentar');
    await flush();
    expect(relationshipLoads).toBe(3);
    expect(host.textContent).not.toContain('Profile refresh failed');
    expect(host.textContent).not.toContain('Reintentar');
    expect(host.textContent).toContain('Invitar a Habitta');
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="Enlace seguro de invitación"]')?.value,
    ).toBe('https://invite');
  });

  it('reports a saved edit when its profile refresh fails and offers retry', async () => {
    let relationshipLoads = 0;
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 1
          ? Promise.resolve(relationship('a'))
          : Promise.reject(new Error('Profile refresh failed'));
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('A Resident');
    await flush();
    click('Editar persona');

    await act(async () => {
      await editorCallbacks.onSaved!(person('a'), 'A edit saved');
    });
    await flush();

    expect(host.textContent).toContain('Profile refresh failed');
    expect(host.textContent).toContain('A edit saved Se guardó correctamente');
    expect(host.textContent).toContain('pero no se pudo recargar el perfil');
    expect(host.textContent).toContain('Reintentar');
    expect(host.textContent).toContain('Vincular unidad');
  });

  it('keeps note-save success feedback and offers profile retry when its refresh fails', async () => {
    let relationshipLoads = 0;
    const savedNotes = {
      authorized: true,
      revisions: [
        {
          action: 'saved' as const,
          content: 'Follow up next week',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 1
          ? Promise.resolve(relationship('a'))
          : Promise.reject(new Error('Note profile refresh failed'));
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      if (path.endsWith('/admin-notes')) return Promise.resolve(savedNotes);
      return Promise.resolve({});
    });
    click('A Resident');
    await flush();
    click('Notas privadas');
    await flush();
    click('Guardar nota');
    await flush();

    expect(api).toHaveBeenCalledWith('/v1/condominiums/c1/people/a/admin-notes', {} as never, {
      method: 'POST',
      body: JSON.stringify({ content: 'Follow up next week' }),
    });
    expect(host.textContent).toContain('Note profile refresh failed');
    expect(host.textContent).toContain('Nota administrativa guardada.');
    expect(host.textContent).toContain('pero no se pudo recargar el perfil');
    expect(host.textContent).toContain('Reintentar');
  });

  it('keeps relationship-close success feedback and offers profile retry when its refresh fails', async () => {
    let relationshipLoads = 0;
    const withCommunityRole: PersonRelationshipView = {
      ...relationship('a'),
      condominiumRelationships: [
        {
          id: 'role-a',
          person_id: 'a',
          condominium_id: 'c1',
          relationship_type: 'board_member',
          title: 'Treasurer',
          starts_at: '2026-01-01',
          ends_at: null,
        },
      ],
    };
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 1
          ? Promise.resolve(withCommunityRole)
          : Promise.reject(new Error('Close profile refresh failed'));
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      if (path.endsWith('/admin-notes')) return Promise.resolve(notes);
      return Promise.resolve({});
    });
    click('A Resident');
    await flush();
    click('Roles en la comunidad');
    await flush();
    click('Cerrar');
    await flush();
    click('Cerrar relación');
    await flush();

    expect(api).toHaveBeenCalledWith(
      '/v1/condominiums/c1/people/a/condominium-relationships/role-a',
      {} as never,
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(host.textContent).toContain('Close profile refresh failed');
    expect(host.textContent).toContain('Relación cerrada.');
    expect(host.textContent).toContain('pero no se pudo recargar el perfil');
    expect(host.textContent).toContain('Reintentar');
  });

  it('keeps the same-person profile mounted during a refresh', async () => {
    const existingNote = {
      authorized: true,
      revisions: [
        {
          action: 'saved' as const,
          content: 'Existing administrative note',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    api.mockImplementation((path: string) => {
      if (path.includes('/relationships')) return Promise.resolve(relationship('a'));
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      if (path.endsWith('/admin-notes')) return Promise.resolve(existingNote);
      return Promise.resolve({});
    });
    click('A Resident');
    await flush();

    const initialLoad = deferred<PersonRelationshipView>();
    await flush();
    const refresh = deferred<PersonRelationshipView>();
    let relationshipLoads = 0;
    api.mockImplementation((path: string) => {
      if (path.includes('/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 1 ? initialLoad.promise : refresh.promise;
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      if (path.endsWith('/admin-notes')) return Promise.resolve(existingNote);
      return Promise.resolve({});
    });

    // Selecting the current person starts an ordinary profile load without clearing
    // the already mounted profile. Saving the valid note then starts refreshSelected
    // while that earlier load is still pending.
    click('A Resident');
    await flush();
    click('Notas privadas');
    await flush();
    click('Guardar nota');
    await flush();

    expect(relationshipLoads).toBe(2);
    expect(api).toHaveBeenCalledWith('/v1/condominiums/c1/people/a/admin-notes', {} as never, {
      method: 'POST',
      body: JSON.stringify({ content: 'Existing administrative note' }),
    });
    expect(host.querySelector('.people-v3-profile')?.getAttribute('aria-busy')).toBe('true');
    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).toContain('Nota administrativa');

    // The refresh wins and clears its loading state; the late initial completion
    // must not replace or unmount the profile.
    await act(async () => refresh.resolve(relationship('a')));
    await flush();
    expect(host.querySelector('.people-v3-profile')?.hasAttribute('aria-busy')).toBe(false);
    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).toContain('Nota administrativa guardada');
    await act(async () => initialLoad.resolve(relationship('a')));
    await flush();
    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).toContain('Nota administrativa');
  });

  it('does not let deferred edit or create directory reloads overwrite a newer selection', async () => {
    const editReload = deferred<Person[]>();
    const createReload = deferred<Person[]>();
    let directoryCalls = 0;
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people')) {
        directoryCalls += 1;
        return directoryCalls === 2
          ? editReload.promise
          : directoryCalls === 3
            ? createReload.promise
            : Promise.resolve(people);
      }
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('/relationships'))
        return Promise.resolve(relationship(path.includes('/people/a/') ? 'a' : 'b'));
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('A Resident');
    await flush();
    click('Editar persona');
    const editSaved = editorCallbacks.onSaved!;
    let editPromise!: Promise<void>;
    act(() => {
      editPromise = Promise.resolve(editSaved(person('a'), 'A edit saved'));
    });
    click('B Resident');
    await flush();
    await act(async () => editReload.resolve(people));
    await editPromise;
    await flush();
    expect(host.textContent).toContain('B Resident');
    expect(host.textContent).not.toContain('A edit saved');

    click('Nueva persona');
    const createSaved = editorCallbacks.onSaved!;
    let createPromise!: Promise<void>;
    act(() => {
      createPromise = Promise.resolve(createSaved(person('c'), 'C create saved'));
    });
    click('A Resident');
    await flush();
    await act(async () => createReload.resolve([...people, person('c')]));
    await createPromise;
    await flush();
    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).not.toContain('C create saved');
  });

  it('reloads the saved edit and permits later relationship drawer actions', async () => {
    click('A Resident');
    await flush();
    click('Editar persona');

    await act(async () => {
      await editorCallbacks.onSaved!(person('a'), 'A edit saved');
    });
    await flush();

    expect(host.textContent).toContain('101');
    expect(host.textContent).toContain('A edit saved');
    const successStatus = host.querySelector('[role="status"]');
    expect(successStatus).not.toBeNull();
    expect(successStatus?.getAttribute('aria-live')).toBe('polite');
    expect(successStatus?.getAttribute('aria-atomic')).toBe('true');

    click('Vincular unidad');
    await flush();
    // The status node remains mounted while adjacent UI changes, avoiding a second
    // announcement of the same completed edit.
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="status"]')).toBe(successStatus);
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    click('Request relationship close');
    await flush();
    expect(host.textContent).toContain('test ownership dejará de estar activa');
    click('Close relationship drawer');
    await flush();
    expect(host.textContent).not.toContain('Relationship drawer');
  });

  it('reloads the newly created person and shows its save message', async () => {
    const created = person('c');
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people')) return Promise.resolve([...people, created]);
      if (path.endsWith('/units'))
        return Promise.resolve([{ id: 'u1', code: '101', status: 'active' }]);
      if (path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('/communication-responsibilities')) return Promise.resolve(communication);
      if (path.endsWith('/admin-notes')) return Promise.resolve(notes);
      if (path.includes('/relationships')) return Promise.resolve(relationship('c'));
      return Promise.resolve({});
    });

    click('Nueva persona');
    await act(async () => {
      await editorCallbacks.onSaved!(created, 'C create saved');
    });
    await flush();

    expect(host.textContent).toContain('C Resident');
    expect(host.textContent).toContain('101');
    expect(host.textContent).toContain('C create saved');
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('C create saved');
  });

  it('keeps a created invitation successful when its re-list fails and retries only the list', async () => {
    createInvitation.mockResolvedValue({
      invitation: { id: 'new' },
      invitationUrl: 'https://invite',
      auditPersisted: true,
      emailDelivery: { status: 'disabled', recipient: null, provider: 'test', mode: 'test' },
    });
    click('A Resident');
    await flush();
    listInvitations.mockRejectedValueOnce(new Error('Invitation list failed'));
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();

    expect(host.textContent).toContain('La invitación ya se guardó');
    expect(host.textContent).toContain('Invitación creada.');
    expect(host.textContent).not.toContain('No se pudo crear la invitación');
    expect(host.textContent).toContain('Reintentar lista');
    expect(createInvitation).toHaveBeenCalledTimes(1);

    click('Reintentar lista');
    await flush();
    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain('Invitation list failed');
  });

  it('removes the invitation-list retry when an unrelated action error replaces its feedback', async () => {
    createInvitation
      .mockResolvedValueOnce({
        invitation: { id: 'new' },
        invitationUrl: 'https://invite',
        auditPersisted: true,
        emailDelivery: { status: 'disabled', recipient: null, provider: 'test', mode: 'test' },
      })
      .mockRejectedValueOnce(new Error('Later invitation action failed'));
    click('A Resident');
    await flush();
    listInvitations.mockRejectedValueOnce(new Error('Invitation list failed'));
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();
    expect(host.textContent).toContain('Reintentar lista');

    click('Crear invitación');
    await flush();

    expect(host.textContent).toContain('Later invitation action failed');
    expect(host.textContent).not.toContain('Invitation list failed');
    expect(host.textContent).not.toContain('Reintentar lista');
  });

  it('keeps the audit-persistence warning after a successful invitation-list retry', async () => {
    createInvitation.mockResolvedValue({
      invitation: { id: 'new' },
      invitationUrl: 'https://invite',
      auditPersisted: false,
      emailDelivery: { status: 'disabled', recipient: null, provider: 'test', mode: 'test' },
    });
    click('A Resident');
    await flush();
    listInvitations.mockRejectedValueOnce(new Error('Invitation list failed'));
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();

    expect(host.textContent).toContain('Invitation list failed');
    expect(host.textContent).toContain('Reintentar lista');
    expect(host.textContent).toContain('no pudo guardarse en la auditoría');

    click('Reintentar lista');
    await flush();

    expect(host.textContent).not.toContain('Invitation list failed');
    expect(host.textContent).not.toContain('Reintentar lista');
    expect(host.textContent).toContain('no pudo guardarse en la auditoría');
  });

  it('keeps a revoked invitation successful when its re-list fails and retries only the list', async () => {
    const invitation = {
      id: 'old',
      condominium_id: 'c1',
      person_id: 'a',
      unit_id: 'u1',
      email: 'a@example.com',
      intended_role: 'owner' as const,
      status: 'pending' as const,
      expires_at: '2027-01-01',
      accepted_at: null,
      revoked_at: null,
      created_at: '2026-01-01',
    };
    listInvitations.mockResolvedValueOnce([invitation]);
    revokeInvitation.mockResolvedValue(invitation);
    click('A Resident');
    await flush();
    listInvitations.mockRejectedValueOnce(new Error('Revoked list failed'));
    click('Acceso digital');
    await flush();
    click('Revocar');
    click('Revocar invitación');
    await flush();

    expect(host.textContent).toContain('La invitación ya se guardó');
    expect(host.textContent).toContain('Invitación revocada.');
    expect(host.textContent).not.toContain('No se pudo revocar la invitación');
    click('Reintentar lista');
    await flush();
    expect(revokeInvitation).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain('Revoked list failed');
  });

  it('preserves a failed edit directory reload without resetting the selected profile', async () => {
    let directoryLoads = 1;
    let relationshipLoads = 0;
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people'))
        return ++directoryLoads === 1
          ? Promise.resolve(people)
          : Promise.reject(new Error('Edit directory failed'));
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 1
          ? Promise.resolve(relationship('a'))
          : Promise.reject(new Error('Edit profile failed'));
      }
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('A Resident');
    await flush();
    click('Editar persona');
    await act(async () => editorCallbacks.onSaved!(person('a'), 'A edit saved'));
    await flush();

    expect(host.textContent).toContain('Edit directory failed');
    expect(host.textContent).toContain('No se pudo actualizar el directorio');
    expect(host.textContent).toContain('Edit profile failed');
    expect(host.textContent).toContain('Reintentar');
    expect(host.textContent).toContain('A edit saved');
    expect(host.textContent).toContain('A Resident');
    expect(host.textContent).toContain('Vincular unidad');
  });

  it('preserves a failed create directory reload while loading the saved person', async () => {
    const created = person('c');
    api.mockImplementation((path: string) => {
      if (path.endsWith('/people')) return Promise.reject(new Error('Create directory failed'));
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('/relationships')) return Promise.resolve(relationship('c'));
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    click('Nueva persona');
    await act(async () => editorCallbacks.onSaved!(created, 'C create saved'));
    await flush();

    expect(host.textContent).toContain('Create directory failed');
    expect(host.textContent).toContain('No se pudo actualizar el directorio');
    expect(host.textContent).toContain('Reintentar');
    expect(host.textContent).toContain('C create saved');
    expect(host.textContent).toContain('C Resident');
  });

  it('drops a late directory response after the condominium scope changes', async () => {
    const firstDirectory = deferred<Person[]>();
    api.mockImplementation((path: string) => {
      if (path === '/v1/condominiums/c1/people') return firstDirectory.promise;
      if (path === '/v1/condominiums/c1/units' || path === '/v1/condominiums/c1/buildings') {
        return firstDirectory.promise.then(() => []);
      }
      if (path === '/v1/condominiums/c2/people') return Promise.resolve([person('c')]);
      if (path === '/v1/condominiums/c2/units' || path === '/v1/condominiums/c2/buildings') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      root.render(
        createElement(PeoplePanelV3, {
          condominiumId: 'c0',
          condominiumName: 'Previous condominium',
          session: {} as never,
        }),
      );
    });
    await flush();
    await act(async () => {
      root.render(
        createElement(PeoplePanelV3, {
          condominiumId: 'c1',
          condominiumName: 'First condominium',
          session: {} as never,
        }),
      );
    });
    await flush();
    await act(async () => {
      root.render(
        createElement(PeoplePanelV3, {
          condominiumId: 'c2',
          condominiumName: 'Second condominium',
          session: {} as never,
        }),
      );
    });
    await flush();
    await act(async () => firstDirectory.resolve(people));
    await flush();

    expect(host.textContent).toContain('C Resident');
    expect(host.textContent).not.toContain('A Resident');
    expect(host.textContent).not.toContain('B Resident');
  });

  it('replaces a profile retry with a later invitation mutation failure', async () => {
    let relationshipLoads = 0;
    api.mockImplementation((path: string) => {
      if (path.includes('/people/a/relationships')) {
        relationshipLoads += 1;
        return relationshipLoads === 1
          ? Promise.resolve(relationship('a'))
          : Promise.reject(new Error('Profile refresh failed'));
      }
      if (path.endsWith('/people')) return Promise.resolve(people);
      if (path.endsWith('/units') || path.endsWith('/buildings')) return Promise.resolve([]);
      if (path.includes('communication-responsibilities')) return Promise.resolve(communication);
      return Promise.resolve(notes);
    });
    createInvitation.mockRejectedValue(new Error('Invitation mutation failed'));
    click('A Resident');
    await flush();
    click('Vincular unidad');
    await act(async () => drawerCallbacks.onChanged!('Relationship saved'));
    await flush();
    expect(host.textContent).toContain('Reintentar');
    click('Acceso digital');
    await flush();
    const select = host.querySelector('select')!;
    act(() => {
      select.value = 'u1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click('Crear invitación');
    await flush();

    expect(host.textContent).toContain('Invitation mutation failed');
    expect(host.textContent).not.toContain('Profile refresh failed');
    expect(host.textContent).not.toContain('Reintentar');
  });
});
