// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from '../lib/roles';

const { getNotificationSettings, getPreferences, saveNotificationSettings, savePreference } =
  vi.hoisted(() => ({
    getNotificationSettings: vi.fn(),
    getPreferences: vi.fn(),
    saveNotificationSettings: vi.fn(),
    savePreference: vi.fn(),
  }));

vi.mock('../features/notifications/api', () => ({
  getNotificationSettings,
  getPreferences,
  saveNotificationSettings,
  savePreference,
}));
vi.mock('../features/settings/CondominiumBillingPanel', () => ({
  CondominiumBillingPanel: () => null,
}));
vi.mock('../features/settings/CondominiumDangerZone', () => ({
  CondominiumDangerZone: () => null,
}));
vi.mock('../features/settings/CondominiumIdentityPanel', () => ({
  CondominiumIdentityPanel: () => null,
}));

import { SettingsPage } from './SettingsPage';

const session = {
  access_token: 'test-token',
  user: { id: 'user-id', email: 'ana@example.com', user_metadata: { full_name: 'Ana' } },
} as never;

const settings = (condominium_id: string) => ({
  condominium_id,
  email_enabled: true,
  due_soon_enabled: true,
  due_soon_days: 5,
  overdue_enabled: true,
  timezone: 'America/Caracas',
});

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

describe('SettingsPage functional behavior', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    getPreferences.mockResolvedValue([]);
    getNotificationSettings.mockImplementation((_session: unknown, condominiumId: string) =>
      Promise.resolve(settings(condominiumId)),
    );
    saveNotificationSettings.mockResolvedValue(undefined);
    savePreference.mockResolvedValue(undefined);
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
        createElement(
          RolesProvider,
          { value: ['condominium_admin'] },
          createElement(SettingsPage, {
            condominiumId,
            condominiumName: condominiumId,
            session,
          }),
        ),
      );
    });

  const saveButton = () =>
    Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Guardar cambios'),
    )!;

  it('enables Save only for actual global or personal-preference changes', async () => {
    await render('c1');
    await flush();
    expect(saveButton().disabled).toBe(true);

    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Canal de correo del condominio"]')!
        .click(),
    );
    expect(saveButton().disabled).toBe(false);

    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Canal de correo del condominio"]')!
        .click(),
    );
    expect(saveButton().disabled).toBe(true);

    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Nueva cuota o cargo dentro de Habitta"]')!
        .click(),
    );
    expect(saveButton().disabled).toBe(false);
  });

  it('keeps only unsaved changes dirty and does not report a full save after a partial failure', async () => {
    saveNotificationSettings.mockRejectedValueOnce(new Error('global settings failed'));
    await render('c1');
    await flush();

    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Canal de correo del condominio"]')!
        .click(),
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Nueva cuota o cargo dentro de Habitta"]')!
        .click(),
    );
    act(() => saveButton().click());
    await flush();

    expect(host.textContent).toContain('Se guardaron algunos cambios');
    expect(host.textContent).not.toContain('Configuración guardada correctamente');
    expect(savePreference).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(false);
  });

  it('clears old scoped data while loading and ignores a stale condominium response', async () => {
    const c1Preferences = deferred<never[]>();
    const c2Preferences = deferred<never[]>();
    getPreferences.mockImplementation((_session: unknown, condominiumId: string) =>
      condominiumId === 'c1' ? c1Preferences.promise : c2Preferences.promise,
    );

    await render('c1');
    await render('c2');
    await flush();

    expect(host.querySelector('[aria-label="Cargando configuración"]')).toBeTruthy();
    expect(host.textContent).not.toContain('c1');

    await act(async () => c2Preferences.resolve([]));
    await flush();
    expect(host.textContent).toContain('c2');

    await act(async () => c1Preferences.resolve([]));
    await flush();
    expect(host.textContent).toContain('c2');
    expect(host.textContent).not.toContain('c1');
  });

  it('does not expose developer or authentication implementation copy', () => {
    const page = readFileSync('src/pages/SettingsPage.tsx', 'utf8');
    expect(page).not.toContain('Supabase Auth');
    expect(page).not.toContain('En development el correo');
    expect(page).not.toContain('session.user.id.slice');
  });
});
