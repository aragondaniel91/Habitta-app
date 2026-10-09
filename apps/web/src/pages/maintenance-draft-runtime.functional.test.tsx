// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../lib/api', () => ({ apiRequest }));
import { WorkOrderDetail } from './MaintenancePageBase';
import { RequestDetailDrawer } from './RequestsPage';

const order = {
  id: '10000000-0000-0000-0000-000000000001', work_order_number: 'WO-2026-000005', condominium_id: '20000000-0000-0000-0000-000000000001', asset_id: null, plan_id: null, plan_due_on: null, request_id: null, vendor_id: null, assigned_to_user_id: null,
  kind: 'corrective' as const, priority: 'high' as const, status: 'draft' as const, title: 'Reparar bomba', description: 'La bomba requiere una reparación documentada.', scheduled_for: null, due_on: null, started_at: null, completed_at: null, cancelled_at: null, completion_summary: null, version: 1, updated_at: '2026-10-09T12:00:00.000Z',
};
const session = { access_token: 'token', user: { id: '30000000-0000-0000-0000-000000000001' } } as never;

describe('draft work order runtime lifecycle', () => {
  let host: HTMLDivElement;
  beforeEach(() => { vi.clearAllMocks(); (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; apiRequest.mockResolvedValue([]); host = document.createElement('div'); document.body.append(host); });
  afterEach(() => host.remove());
  const change = (control: HTMLInputElement | HTMLTextAreaElement, value: string) => act(() => { const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value); control.dispatchEvent(new Event('input', { bubbles: true })); control.dispatchEvent(new Event('change', { bubbles: true })); });
  const field = (label: string) => { const element = Array.from(host.querySelectorAll('label')).find((item) => item.textContent?.trim().startsWith(label)); return (element?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${element?.htmlFor}`))!; };
  it('edits, saves and reopens a draft with local scheduling and optimistic version', async () => {
    const changed = vi.fn(); const root = createRoot(host);
    await act(async () => root.render(createElement(WorkOrderDetail, { condominiumId: order.condominium_id, session, workOrder: order, asset: undefined, vendor: undefined, assets: [], vendors: [], onChanged: changed })));
    await act(async () => { await Promise.resolve(); });
    act(() => Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Editar orden'))!.click());
    const inputs = host.querySelectorAll<HTMLInputElement>('input');
    const title = Array.from(inputs).find((input) => input.value === order.title)!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'Reparar bomba urgente'); title.dispatchEvent(new Event('input', { bubbles: true })); title.dispatchEvent(new Event('change', { bubbles: true })); });
    const datetime = host.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(datetime, '2026-10-20T11:30'); datetime.dispatchEvent(new Event('input', { bubbles: true })); datetime.dispatchEvent(new Event('change', { bubbles: true })); });
    apiRequest.mockResolvedValueOnce({ ...order, title: 'Reparar bomba urgente', scheduled_for: '2026-10-20T11:30:00.000Z', version: 2 });
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await act(async () => { await Promise.resolve(); });
    const put = apiRequest.mock.calls.find((call) => call[2]?.method === 'PUT');
    expect(JSON.parse(put![2].body)).toMatchObject({ title: 'Reparar bomba urgente', expectedVersion: 1, scheduledFor: new Date('2026-10-20T11:30').toISOString() });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
    act(() => root.unmount());
  });

  it('keeps a draft open on an optimistic-version conflict and blocks duplicate saves', async () => {
    const root = createRoot(host); let rejectSave: (reason: Error) => void = () => undefined;
    apiRequest.mockImplementation((_path: string, _session: unknown, init?: RequestInit) => init?.method === 'PUT' ? new Promise<never>((_, reject) => { rejectSave = reject; }) : Promise.resolve([]));
    await act(async () => root.render(createElement(WorkOrderDetail, { condominiumId: order.condominium_id, session, workOrder: order, asset: undefined, vendor: undefined, assets: [], vendors: [], onChanged: vi.fn() })));
    act(() => Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Editar orden'))!.click());
    const title = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find((input) => input.value === order.title)!;
    change(title, 'Bomba con versiÃ³n protegida');
    const form = host.querySelector('form')!;
    act(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(apiRequest.mock.calls.filter((call) => call[2]?.method === 'PUT')).toHaveLength(1);
    await act(async () => rejectSave(new Error('La versiÃ³n de la orden cambiÃ³.')));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('La versiÃ³n de la orden cambiÃ³.');
    expect(title.value).toBe('Bomba con versiÃ³n protegida'); act(() => root.unmount());
  });

  it('requires a valid reason and an explicit confirmation before cancelling a draft', async () => {
    const root = createRoot(host); const changed = vi.fn();
    await act(async () => root.render(createElement(WorkOrderDetail, { condominiumId: order.condominium_id, session, workOrder: order, asset: undefined, vendor: undefined, assets: [], vendors: [], onChanged: changed })));
    const cancel = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Cancelar orden')!;
    const note = host.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(cancel.disabled).toBe(true); change(note, 'ok'); expect(cancel.disabled).toBe(true);
    change(note, 'Duplicada'); act(() => cancel.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Cancelar orden de trabajo');
    apiRequest.mockResolvedValueOnce({ ...order, status: 'cancelled', version: 2 }); act(() => host.querySelector<HTMLButtonElement>('[data-confirm-dialog-action="confirm"]')!.click());
    await act(async () => { await Promise.resolve(); });
    const call = apiRequest.mock.calls.find((item) => item[0].endsWith('/transition'))!;
    expect(JSON.parse(call[2].body)).toEqual({ status: 'cancelled', note: 'Duplicada', expectedVersion: 1 }); expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' })); act(() => root.unmount());
  });

  it('uses one idempotency key for rapid request creation while loading', async () => {
    const root = createRoot(host); const request = { id: 'request-1', request_number: 'SR-1', condominium_id: order.condominium_id, category_id: 'category-1', unit_id: null, requester_person_id: null, submitted_by_user_id: 'person-1', assigned_to_user_id: null, title: 'Fuga de bomba', description: 'La bomba necesita una reparaciÃ³n vÃ¡lida.', priority: 'high', status: 'submitted', due_at: null, resolution_summary: null, version: 1, created_at: order.updated_at, updated_at: order.updated_at } as const;
    apiRequest.mockImplementation((_path: string, _session: unknown, init?: RequestInit) => init?.method === 'POST' ? new Promise<never>(() => undefined) : Promise.resolve([])); vi.stubGlobal('crypto', { randomUUID: () => 'intent-1' });
    await act(async () => root.render(createElement(RequestDetailDrawer, { request, condominiumId: order.condominium_id, session, categories: [{ id: 'category-1', condominium_id: order.condominium_id, name: 'Mantenimiento', code: 'maintenance', description: 'CategorÃ­a de mantenimiento', sort_order: 1, is_active: true }], units: [], people: [], onClose: () => undefined, onChanged: async () => undefined, canManageMaintenance: true })));
    await act(async () => { await Promise.resolve(); });
    const create = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Crear orden de trabajo'))!; act(() => { create.click(); create.click(); });
    expect(apiRequest.mock.calls.filter((call) => call[2]?.method === 'POST')).toHaveLength(1);
    expect(JSON.parse(apiRequest.mock.calls.find((call) => call[2]?.method === 'POST')![2].body)).toMatchObject({ requestId: 'request-1', idempotencyKey: 'intent-1' }); expect(create.disabled).toBe(true); act(() => root.unmount()); vi.unstubAllGlobals();
  });
});
