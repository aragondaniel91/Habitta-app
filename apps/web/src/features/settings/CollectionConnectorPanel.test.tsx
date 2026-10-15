// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../../lib/roles';
import { apiRequest } from '../../lib/api';
import { CollectionConnectorPanel } from './CollectionConnectorPanel';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = { access_token: 'test-token' } as Session;
const request = vi.mocked(apiRequest);
const catalog = [
  {
    provider_key: 'mercado_pago',
    country_code: 'MX',
    display_name: 'Mercado Pago',
    capabilities: ['card', 'wallet', 'bank_transfer'],
    lifecycle_status: 'pending' as const,
  },
];
const pendingConnection = {
  id: 'connection-1',
  provider_key: 'mercado_pago',
  display_label: 'Cobranza administración',
  environment: 'sandbox' as const,
  connection_status: 'pending' as const,
  connector_country_code: 'MX',
};

function installApi(connections = [pendingConnection]) {
  request.mockImplementation((path: string, _session, options) => {
    if (options?.method === 'POST') return Promise.resolve({} as never);
    if (path.endsWith('/catalog')) return Promise.resolve(catalog as never);
    return Promise.resolve(
      connections.map((connection) => ({
        condominium_collection_provider_connections: connection,
      })) as never,
    );
  });
}

function mount(roles: Parameters<typeof RolesProvider>[0]['value']) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  return {
    host,
    root,
    render: () =>
      root.render(
        <RolesProvider value={roles}>
          <CollectionConnectorPanel condominiumId="condominium-1" session={session} />
        </RolesProvider>,
      ),
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('CollectionConnectorPanel', () => {
  it.each([['owner'], ['tenant'], ['payment_reviewer'], ['board_member']] as const)(
    'does not expose controls to %s',
    async (role) => {
      const view = mount([role]);
      await act(async () => view.render());
      expect(view.host.textContent).toBe('');
      expect(request).not.toHaveBeenCalled();
      await act(async () => view.root.unmount());
    },
  );

  it('offers keyboard-selectable planned capabilities and keeps roadmap providers unavailable', async () => {
    installApi([]);
    const view = mount(['condominium_admin']);
    await act(async () => view.render());
    await settle();
    const provider = view.host.querySelector<HTMLButtonElement>('.settings-provider-card')!;
    expect(provider.getAttribute('aria-pressed')).toBe('false');
    expect(provider.textContent).toContain('Tarjetas');
    expect(provider.textContent).toContain('Billetera');
    await act(async () =>
      provider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    await act(async () => provider.click());
    expect(provider.getAttribute('aria-pressed')).toBe('true');
    expect(view.host.querySelector<HTMLInputElement>('input[value="sandbox"]')?.checked).toBe(true);
    expect(view.host.textContent).toContain('Venezuela · ROADMAP');
    expect(view.host.querySelectorAll('[aria-disabled="true"]')).toHaveLength(3);
    await act(async () => view.root.unmount());
  });

  it('creates a pending sandbox preparation and can disable it', async () => {
    installApi();
    const view = mount(['accountant']);
    await act(async () => view.render());
    await settle();
    const provider = view.host.querySelector<HTMLButtonElement>('.settings-provider-card')!;
    await act(async () => provider.click());
    const label = view.host.querySelector<HTMLInputElement>(
      'input[placeholder="Ej. Cobranza administración"]',
    )!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      label,
      'Cobranza MX',
    );
    await act(async () => label.dispatchEvent(new Event('input', { bubbles: true })));
    await act(async () =>
      view.host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(request).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/collection-connectors',
      session,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"environment":"sandbox"'),
      }),
    );
    const disable = [...view.host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Deshabilitar',
    )!;
    await act(async () => disable.click());
    expect(request).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/collection-connectors/connection-1/disable',
      session,
      expect.objectContaining({ method: 'POST' }),
    );
    await act(async () => view.root.unmount());
  });
});
