// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../lib/roles';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../lib/api', () => ({ apiRequest }));

import { AnnouncementsPage } from './AnnouncementsPage';

const session = (token: string) => ({ access_token: token }) as never;
const announcement = (id: string, title: string, condominiumId = 'c1') => ({
  id, condominium_id: condominiumId, title, summary: title, body: title, priority: 'normal',
  status: 'draft', audience: 'everyone', building_id: null, unit_id: null,
  requires_acknowledgement: false, publish_at: null, published_at: null, expires_at: null,
  archived_at: null, created_by: 'u1', updated_by: 'u1', version: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function findButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}; visible: ${document.body.textContent}`);
  return button;
}
function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('AnnouncementsPage request ownership', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  const render = (condominiumId: string, token = 'token-1') => act(async () => {
    root.render(createElement(RolesProvider, { value: ['condominium_admin'] }, createElement(AnnouncementsPage, {
      condominiumId, condominiumName: condominiumId, session: session(token),
    })));
  });

  it('drops a stale condominium response', async () => {
    const first = deferred<ReturnType<typeof announcement>[]>();
    apiRequest.mockImplementation((path: string) => {
      if (path.includes('/c1/announcements')) return first.promise;
      if (path.includes('/announcements')) return Promise.resolve([announcement('c2-a', 'Anuncio C2', 'c2')]);
      return Promise.resolve([]);
    });
    await render('c1'); await render('c2'); await flush();
    expect(host.textContent).toContain('Anuncio C2');
    await act(async () => first.resolve([announcement('c1-a', 'Anuncio C1')])); await flush();
    expect(host.textContent).not.toContain('Anuncio C1');
  });

  it('preserves filters through a same-condominium token refresh', async () => {
    apiRequest.mockImplementation((path: string) =>
      path.includes('/announcements') ? Promise.resolve([announcement('a1', 'Aviso de agua')]) : Promise.resolve([]),
    );
    await render('c1', 'token-1'); await flush();
    const input = host.querySelector<HTMLInputElement>('[aria-label="Buscar anuncios"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'agua');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await render('c1', 'token-2'); await flush();
    expect(host.querySelector<HTMLInputElement>('[aria-label="Buscar anuncios"]')?.value).toBe('agua');
    expect(host.textContent).toContain('Aviso de agua');
  });

  it('does not merge a stale draft creation into another condominium after it switches mid-flight', async () => {
    const createPost = deferred<ReturnType<typeof announcement>>();
    apiRequest.mockImplementation((path: string, _session: unknown, init?: RequestInit) => {
      if (path === '/v1/condominiums/c1/announcements' && init?.method === 'POST')
        return createPost.promise;
      if (path.includes('/c1/announcements')) return Promise.resolve([]);
      if (path.includes('/c2/announcements'))
        return Promise.resolve([announcement('c2-a', 'Anuncio C2', 'c2')]);
      if (path.includes('/announcements')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await render('c1'); await flush();
    act(() => findButton('Nuevo anuncio').click());
    await flush();

    setFieldValue(
      host.querySelector<HTMLInputElement>('input[placeholder="Ej. Mantenimiento de ascensores"]')!,
      'Corte de agua programado',
    );
    setFieldValue(
      host.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder="Explica lo esencial en una o dos líneas."]',
      )!,
      'Se suspenderá el servicio de agua.',
    );
    setFieldValue(
      host.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder="Incluye fechas, horarios, instrucciones y contactos relevantes."]',
      )!,
      'El corte ocurrirá el próximo lunes de 9am a 1pm.',
    );
    act(() => findButton('Guardar borrador').click());
    await flush();

    await render('c2'); await flush();
    expect(host.textContent).toContain('Anuncio C2');

    await act(async () =>
      createPost.resolve(announcement('c1-new', 'Corte de agua programado')),
    );
    await flush();

    expect(host.textContent).toContain('Anuncio C2');
    expect(host.textContent).not.toContain('Corte de agua programado');
  });
});
