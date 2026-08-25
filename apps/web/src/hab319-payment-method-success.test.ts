import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const drawersUrl = new URL('./pages/PaymentsDrawers.tsx', import.meta.url);

async function source() {
  return readFile(drawersUrl, 'utf8');
}

describe('HAB-319 payment-method creation success lifecycle', () => {
  it('captures the form before awaiting the API and resets the captured element', async () => {
    const drawers = await source();

    expect(drawers).toContain('const form = event.currentTarget;');
    expect(drawers).toContain('new FormData(form)');
    expect(drawers).toContain('form.reset();');
    expect(drawers).not.toContain('event.currentTarget.reset();');
  });

  it('refreshes the live payment methods after the successful write', async () => {
    const drawers = await source();

    expect(drawers).toContain('/payment-methods`, session');
    expect(drawers).toContain("await onChanged('Método de pago creado.');");
    expect(drawers).toContain("drawer.type === 'methods'");
    expect(drawers).toContain('<PaymentMethodsView');
  });
});
