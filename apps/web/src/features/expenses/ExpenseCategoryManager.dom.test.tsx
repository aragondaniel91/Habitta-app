// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpenseCategoryManager } from './ExpenseCategoryManager';
import { apiRequest } from '../../lib/api';
import type { ExpenseCategory } from '../../lib/expenses';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const request = vi.mocked(apiRequest);
const session = { access_token: 'test-token' } as Session;
const category: ExpenseCategory = {
  id: 'category-1',
  condominium_id: 'condominium-1',
  code: 'maintenance',
  name: 'Mantenimiento',
  description: 'Reparaciones y servicios',
  is_active: true,
};

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ExpenseCategoryManager interactions', () => {
  it('creates and edits categories with compact, labelled forms', async () => {
    request.mockResolvedValue({} as never);
    const changed = vi.fn(async () => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    await act(async () => {
      root.render(
        <ExpenseCategoryManager
          categories={[category]}
          condominiumId="condominium-1"
          expenseCounts={{ [category.id]: 2 }}
          onChanged={changed}
          onOpenDirectory={() => undefined}
          session={session}
        />,
      );
    });

    expect(host.textContent).toContain('2 gastos vinculados');
    expect(host.querySelector('.expenses-category-editor__fields')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    const inputs = host.querySelectorAll<HTMLInputElement>('input');
    await act(async () => setValue(inputs[0]!, 'Limpieza'));
    await act(async () =>
      host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(request).toHaveBeenLastCalledWith(
      '/v1/condominiums/condominium-1/expense-categories',
      session,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"code":"limpieza"'),
      }),
    );

    const edit = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Editar',
    )!;
    await act(async () => edit.click());
    await act(async () =>
      setValue(host.querySelector<HTMLInputElement>('input')!, 'Mantenimiento común'),
    );
    await act(async () =>
      host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(request).toHaveBeenLastCalledWith(
      '/v1/condominiums/condominium-1/expense-categories/category-1',
      session,
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('Mantenimiento común'),
      }),
    );
    expect(changed).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it('requires confirmation before archive and routes suppliers to the canonical directory', async () => {
    request.mockResolvedValue({} as never);
    const openVendors = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);
    await act(async () => {
      root.render(
        <ExpenseCategoryManager
          categories={[category]}
          condominiumId="condominium-1"
          onChanged={() => undefined}
          onOpenDirectory={openVendors}
          session={session}
        />,
      );
    });

    const directory = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Directorio de proveedores'),
    )!;
    await act(async () => directory.click());
    expect(openVendors).toHaveBeenCalledOnce();

    const archive = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Archivar',
    )!;
    await act(async () => archive.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('¿Archivar categoría?');
    expect(request).not.toHaveBeenCalled();
    const confirm = host.querySelector<HTMLButtonElement>(
      '[data-confirm-dialog-action="confirm"]',
    )!;
    await act(async () => confirm.click());
    expect(request).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/expense-categories/category-1',
      session,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) }),
    );
    await act(async () => root.unmount());
  });
});
