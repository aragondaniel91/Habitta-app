// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentProof } from '../api';
import { PaymentProofPreview } from './PaymentProofPreview';

vi.mock('../api', () => ({ paymentProof: vi.fn() }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const session = { access_token: 'authorized-reviewer' } as never;
const load = vi.mocked(paymentProof);

function createHost() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = async () =>
    act(async () =>
      root.render(
        <PaymentProofPreview compact condominiumId="condo" paymentId="payment" session={session} />,
      ),
    );
  return { host, root, render };
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:habitta-private-payment-proof'),
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('authenticated payment evidence preview in reviewer modal', () => {
  it('renders a compact image and lets the reviewer open the full private file', async () => {
    load.mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }));
    const { host, root, render } = createHost();
    await render();

    expect(host.querySelector('.payments-proof-preview--compact')).not.toBeNull();
    expect(host.querySelector('img[alt="Comprobante del pago"]')).not.toBeNull();
    const open = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Abrir comprobante completo'),
    );
    expect(open).toBeDefined();
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await act(async () => open!.click());
    expect(spy).toHaveBeenCalledWith(
      'blob:habitta-private-payment-proof',
      '_blank',
      'noopener,noreferrer',
    );
    await act(async () => root.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:habitta-private-payment-proof');
  });

  it('renders PDF preview with the open-full-file action', async () => {
    load.mockResolvedValueOnce(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    const { host, root, render } = createHost();
    await render();
    expect(host.querySelector('object[type="application/pdf"]')).not.toBeNull();
    expect(host.textContent).toContain('Abrir comprobante completo');
    await act(async () => root.unmount());
  });

  it('clearly indicates that a payment has no attachment, not a network error', async () => {
    load.mockResolvedValueOnce(null);
    const { host, root, render } = createHost();
    await render();
    expect(host.textContent).toContain('no tiene comprobante adjunto');
    expect(host.textContent).not.toContain('Reintentar comprobante');
    await act(async () => root.unmount());
  });

  it('reports real loading errors and lets the reviewer retry without approval side effects', async () => {
    load.mockRejectedValueOnce(new Error('No tienes permiso para ver este comprobante.'));
    load.mockResolvedValueOnce(new Blob(['proof'], { type: 'image/png' }));
    const { host, root, render } = createHost();
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No tienes permiso');
    const retry = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Reintentar comprobante'),
    );
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.querySelector('img[alt="Comprobante del pago"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
