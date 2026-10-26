// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api', () => ({ apiRequest }));
import { BoardGroupsPreviewPage } from './BoardGroupsPreviewPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const session = { access_token: 'test-token' } as never;
let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function render(condominiumId: string) {
  if (!host) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root?.render(<BoardGroupsPreviewPage condominiumId={condominiumId} session={session} />),
  );
  return host;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  apiRequest.mockReset();
});

describe('authenticated building directory (read-only)', () => {
  it('lists only buildings returned for the selected condominium', async () => {
    apiRequest.mockResolvedValue([{ id: 'a', name: 'Torre Norte' }]);
    const view = await render('condo-a');
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiRequest).toHaveBeenCalledWith('/v1/condominiums/condo-a/buildings', session);
    expect(view.textContent).toContain('Torre Norte');
    expect(view.textContent).toContain('Las juntas y modalidades de abajo son ilustrativas.');
  });

  it('shows empty and error states distinctly', async () => {
    apiRequest.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('private detail'));
    const view = await render('condo-a');
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.textContent).toContain('No hay edificios registrados');
    await render('condo-b');
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    expect(view.textContent).not.toContain('private detail');
  });

  it('ignores a stale response after changing condominium', async () => {
    let resolveOld!: (v: unknown) => void;
    apiRequest
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce([{ id: 'b', name: 'Torre Nueva' }]);
    const view = await render('condo-a');
    await render('condo-b');
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.textContent).toContain('Torre Nueva');
    await act(async () => {
      resolveOld([{ id: 'a', name: 'Torre Antigua' }]);
      await Promise.resolve();
    });
    expect(view.textContent).not.toContain('Torre Antigua');
    expect(view.textContent).toContain('Torre Nueva');
  });
});

describe('loss of selected condominium', () => {
  it('clears the previous building list when the session context disappears', async () => {
    apiRequest.mockResolvedValue([{ id: 'old', name: 'Torre Privada' }]);
    const view = await render('condo-a');
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.textContent).toContain('Torre Privada');
    await act(async () => {
      root?.render(<BoardGroupsPreviewPage condominiumId={null} session={null} />);
    });
    expect(view.textContent).not.toContain('Torre Privada');
    await render('condo-b');
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiRequest).toHaveBeenCalledWith('/v1/condominiums/condo-b/buildings', session);
  });
});

describe('registered directory usability', () => {
  it('searches real building names and sorts them numerically', async () => {
    apiRequest.mockResolvedValue([
      { id: '10', name: 'Edificio 10' },
      { id: '2', name: 'Edificio 2' },
      { id: '1', name: 'Edificio 1' },
    ]);
    const view = await render('condo-a');
    await act(async () => {
      await Promise.resolve();
    });
    const list = view.querySelector('[aria-label="Edificios registrados"] ul');
    expect(Array.from(list?.querySelectorAll('li') ?? []).map((item) => item.textContent)).toEqual([
      'Edificio 1',
      'Edificio 2',
      'Edificio 10',
    ]);
    const search = view.querySelector<HTMLInputElement>(
      'input[placeholder="Nombre del edificio registrado"]',
    );
    expect(search).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'Edificio 10');
      search?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(Array.from(list?.querySelectorAll('li') ?? []).map((item) => item.textContent)).toEqual([
      'Edificio 10',
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
