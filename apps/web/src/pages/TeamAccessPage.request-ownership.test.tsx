// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadTeamAccess, revokeAdminInvitation } = vi.hoisted(() => ({
  loadTeamAccess: vi.fn(),
  revokeAdminInvitation: vi.fn(),
}));

vi.mock('../lib/teamAccess', () => ({
  ADMINISTRATIVE_ROLE_OPTIONS: [
    {
      value: 'assistant',
      label: 'Asistente administrativo',
      description: 'GestiÃ³n operativa de residentes, unidades y comunicaciones.',
    },
  ],
  administrativeRoleLabel: (role: string) => role,
  createAdminInvitation: vi.fn(),
  loadTeamAccess,
  manageTeamMember: vi.fn(),
  revokeAdminInvitation,
}));

import { TeamAccessPage } from './TeamAccessPage';

const session = { user: { id: 'current-user' } } as never;

function team(memberName: string, invitationEmail: string) {
  return {
    members: [
      {
        user_id: `${memberName}-id`,
        email: `${memberName.toLowerCase()}@example.com`,
        full_name: memberName,
        role: 'assistant' as const,
        status: 'active' as const,
        joined_at: '2026-01-01T00:00:00Z',
        changed_at: '2026-01-01T00:00:00Z',
      },
    ],
    invitations: [
      {
        id: `${invitationEmail}-id`,
        condominium_id: 'ignored',
        email: invitationEmail,
        intended_role: 'assistant' as const,
        status: 'pending' as const,
        expires_at: '2026-12-01T00:00:00Z',
        accepted_at: null,
        revoked_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('TeamAccessPage request ownership', () => {
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
        createElement(TeamAccessPage, {
          condominiumId,
          condominiumName: condominiumId,
          session,
        }),
      );
    });

  it('clears the old condominium while its replacement is pending and renders only the replacement', async () => {
    const c2 = deferred<ReturnType<typeof team>>();
    loadTeamAccess.mockImplementation((condominiumId: string) => {
      if (condominiumId === 'c1') return Promise.resolve(team('Ana C1', 'ana-c1@example.com'));
      if (condominiumId === 'c2') return c2.promise;
      return Promise.resolve({ members: [], invitations: [] });
    });

    await render('c1');
    await flush();
    expect(host.textContent).toContain('Ana C1');
    expect(host.textContent).toContain('ana-c1@example.com');

    await render('c2');
    await flush();

    expect(host.querySelector('[aria-label="Cargando equipo y accesos"]')).toBeTruthy();
    expect(host.textContent).not.toContain('Ana C1');
    expect(host.textContent).not.toContain('ana-c1@example.com');

    await act(async () => c2.resolve(team('Beto C2', 'beto-c2@example.com')));
    await flush();

    expect(host.textContent).toContain('Beto C2');
    expect(host.textContent).toContain('beto-c2@example.com');
    expect(host.textContent).not.toContain('Ana C1');
  });

  it('ignores a stale failure after a later condominium request succeeds', async () => {
    const c1 = deferred<ReturnType<typeof team>>();
    loadTeamAccess.mockImplementation((condominiumId: string) => {
      if (condominiumId === 'c1') return c1.promise;
      if (condominiumId === 'c2') return Promise.resolve(team('Beto C2', 'beto-c2@example.com'));
      return Promise.resolve({ members: [], invitations: [] });
    });

    await render('c1');
    await flush();
    await render('c2');
    await flush();
    expect(host.textContent).toContain('Beto C2');

    await act(async () => c1.reject(new Error('Error obsoleto de C1')));
    await flush();

    expect(host.textContent).toContain('Beto C2');
    expect(host.textContent).not.toContain('Error obsoleto de C1');
    expect(host.querySelector('[aria-label="Cargando equipo y accesos"]')).toBeFalsy();
  });

  it('does not let a stale invitation mutation invalidate the replacement load', async () => {
    const revoke = deferred<void>();
    const c2 = deferred<ReturnType<typeof team>>();
    revokeAdminInvitation.mockReturnValue(revoke.promise);
    loadTeamAccess.mockImplementation((condominiumId: string) => {
      if (condominiumId === 'c1') return Promise.resolve(team('Ana C1', 'ana-c1@example.com'));
      if (condominiumId === 'c2') return c2.promise;
      return Promise.resolve({ members: [], invitations: [] });
    });

    await render('c1');
    await flush();
    const revokeButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Revocar',
    );
    expect(revokeButton).toBeTruthy();
    await act(async () => revokeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await render('c2');
    await flush();
    expect(host.querySelector('[aria-label="Cargando equipo y accesos"]')).toBeTruthy();

    await act(async () => revoke.resolve());
    await flush();
    await act(async () => c2.resolve(team('Beto C2', 'beto-c2@example.com')));
    await flush();

    expect(host.textContent).toContain('Beto C2');
    expect(host.textContent).not.toContain('Invitación revocada correctamente.');
    expect(host.querySelector('[aria-label="Cargando equipo y accesos"]')).toBeFalsy();
  });
});
