// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RolesProvider } from './lib/roles';
import { AdministrativeDashboard } from './pages/AdministrativeDashboard';
import { ResidentDashboard } from './pages/ResidentDashboard';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = { access_token: 'token', user: { id: 'resident-1' } } as never;

const payment = (overrides: Record<string, unknown> = {}) => ({
  id: 'payment-1',
  unit_id: 'unit-1',
  payer_name: 'Ana Propietaria',
  submitted_by_user_id: 'resident-1',
  status: 'submitted',
  original_amount: '18.50',
  original_currency_code: 'USD',
  payment_date: '2026-10-20',
  ...overrides,
});

function responseFor(path: string) {
  if (path.endsWith('/units')) return [{ id: 'unit-1', code: 'A-101', status: 'active' }];
  if (path.endsWith('/resident-financial-units')) return [];
  if (path.endsWith('/payments/review-queue')) {
    return [
      payment({ charge_concept_name: 'Cuota octubre' }),
      payment({
        id: 'payment-2',
        status: 'under_review',
        payer_name: 'Bruno Residente',
        charge_concept_name: undefined,
      }),
    ];
  }
  if (path.endsWith('/payments')) {
    return [
      payment({ id: 'own-draft', status: 'draft', charge_concept_name: undefined }),
      payment({ id: 'own-review', status: 'under_review', charge_concept_name: 'Cuota octubre' }),
      payment({
        id: 'other-draft',
        status: 'draft',
        submitted_by_user_id: 'other-tenant',
        charge_concept_name: 'BORRADOR PRIVADO',
      }),
    ];
  }
  return [];
}

function installFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      calls.push(path);
      return new Response(JSON.stringify(responseFor(path)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

function mount() {
  const element = document.createElement('div');
  document.body.append(element);
  return { element, root: createRoot(element) };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('dashboard payment action clarity', () => {
  it('shows an authorized resident their own action separately from administrative validation', async () => {
    installFetch();
    const { element, root } = mount();

    await act(async () => {
      root.render(
        <RolesProvider value={['owner']}>
          <ResidentDashboard
            condominiumId="condo-1"
            condominiumName="Condominio Uno"
            onNavigate={() => {}}
            session={session}
          />
        </RolesProvider>,
      );
    });
    await settle();

    expect(element.textContent).toContain('Requiere tu acción');
    expect(element.textContent).toContain('Validación administrativa pendiente');
    expect(element.textContent).toContain('USD 18,50');
    expect(element.textContent).toContain('Unidad: A-101 · Tu pago');
    expect(element.textContent).toContain('Concepto aplicado: Cuota octubre');
    expect(element.textContent).not.toContain('BORRADOR PRIVADO');
    await act(async () => root.unmount());
  });

  it('does not request or render financial actions for a tenant-only role', async () => {
    const calls = installFetch();
    const { element, root } = mount();

    await act(async () => {
      root.render(
        <RolesProvider value={['tenant']}>
          <ResidentDashboard
            condominiumId="condo-1"
            condominiumName="Condominio Uno"
            onNavigate={() => {}}
            session={session}
          />
        </RolesProvider>,
      );
    });
    await settle();

    expect(calls.some((path) => path.endsWith('/payments'))).toBe(false);
    expect(element.textContent).not.toContain('Requiere tu acción');
    expect(element.textContent).not.toContain('Validación administrativa pendiente');
    await act(async () => root.unmount());
  });

  it('gives an authorized reviewer amount, unit, person, concept, and real review state', async () => {
    installFetch();
    const { element, root } = mount();

    await act(async () => {
      root.render(
        <AdministrativeDashboard
          condominiumId="condo-1"
          condominiumName="Condominio Uno"
          onNavigate={() => {}}
          onNavigateFiltered={() => {}}
          session={session}
        />,
      );
    });
    await settle();

    expect(element.textContent).toContain('Acción requerida');
    expect(element.textContent).toContain('En revisión administrativa');
    expect(element.textContent).toContain('Unidad: A-101 · Presentado por: Ana Propietaria');
    expect(element.textContent).toContain('Estado: Enviado · Concepto aplicado: Cuota octubre');
    expect(element.textContent).toContain('Estado: En revisión · Concepto: aún no aplicado.');
    await act(async () => root.unmount());
  });
});
