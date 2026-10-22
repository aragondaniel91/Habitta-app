// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { ModuleRecoveryBoundary } from './ModuleRecoveryBoundary';

const originalConsoleError = console.error;
afterEach(() => {
  console.error = originalConsoleError;
  document.body.replaceChildren();
});

describe('ModuleRecoveryBoundary', () => {
  it('shows a recoverable message rather than a blank workspace when a module crashes', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    console.error = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onBack = vi.fn();

    class CrashedPage extends Component {
      render(): ReactNode {
        throw new Error('Failed to fetch dynamically imported module');
      }
    }
    await act(async () => {
      root.render(
        <ModuleRecoveryBoundary onBack={onBack}>
          <CrashedPage />
        </ModuleRecoveryBoundary>,
      );
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo abrir este módulo',
    );
    expect(host.textContent).toContain('Tu información no se ha modificado');
    const back = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Volver a Unidades'),
    );
    expect(back).toBeTruthy();
    act(() => back!.click());
    expect(onBack).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('catches an asynchronous failure of a lazy-loaded module', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    console.error = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const LazyFailedPage = lazy(async () => {
      throw new Error('ERR_CONNECTION_REFUSED');
    });
    await act(async () => {
      root.render(
        <ModuleRecoveryBoundary onBack={() => {}}>
          <Suspense fallback={<span>Cargando</span>}>
            <LazyFailedPage />
          </Suspense>
        </ModuleRecoveryBoundary>,
      );
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo abrir este módulo',
    );
    await act(async () => root.unmount());
  });
});
