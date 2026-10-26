// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardGroupsPreviewPage, parseRegisteredBuildings } from './BoardGroupsPreviewPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

async function renderDemo() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<BoardGroupsPreviewPage />));
  return host;
}

async function click(label: string) {
  const control = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(label),
  );
  expect(control).toBeDefined();
  await act(async () => control?.click());
}

describe('board groups demo safety and behavior', () => {
  it('paginates 10 sample boards and opens the selected building only', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const wrapper = await renderDemo();
    expect(wrapper.textContent).toContain('10 resultados');
    expect(wrapper.querySelectorAll('tbody tr')).toHaveLength(5);
    await click('Siguiente');
    expect(wrapper.textContent).toContain('Página 2 de 2');
    await click('Ver ejemplo');
    expect(document.body.textContent).toContain('Grupo de ejemplo del Edificio 6');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('filters boards, allows demo-only mode changes, and resets without API writes', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const wrapper = await renderDemo();
    const search = wrapper.querySelector<HTMLInputElement>(
      'input[placeholder="Edificio, junta o estado"]',
    );
    expect(search).not.toBeNull();
    await act(async () => {
      if (!search) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(search, 'Edificio 10');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(wrapper.querySelectorAll('tbody tr')).toHaveLength(1);
    await click('Ver ejemplo');
    const dialogSelect = document.querySelector<HTMLSelectElement>('[role="dialog"] select');
    expect(dialogSelect).not.toBeNull();
    await act(async () => {
      if (!dialogSelect) return;
      dialogSelect.value = 'hibrido';
      dialogSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Cerrar detalle');
    await click('Restablecer demo');
    expect(wrapper.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(wrapper.textContent).toContain('10 resultados');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('labels seeded records and the role selector as demonstration-only', async () => {
    const wrapper = await renderDemo();
    expect(wrapper.textContent).toContain('DATOS DE DEMOSTRACIÓN');
    expect(wrapper.textContent).toContain('Vista de rol — SOLO DEMOSTRACIÓN');
  });

  it('accepts only an array response for the registered-building directory', () => {
    expect(parseRegisteredBuildings({ data: [] })).toBeNull();
    expect(parseRegisteredBuildings(null)).toBeNull();
    expect(parseRegisteredBuildings([{ id: 'a', name: 'Torre Norte' }, { id: 2 }])).toEqual([
      { id: 'a', name: 'Torre Norte' },
    ]);
  });
});
