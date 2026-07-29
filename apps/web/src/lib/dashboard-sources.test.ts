import { describe, expect, it } from 'vitest';
import { buildDashboardSourceWarning, settleDashboardSource } from './dashboard-sources';

describe('dashboard source resilience', () => {
  it('returns successful values without warnings', async () => {
    await expect(settleDashboardSource('unidades', Promise.resolve([1, 2]), [])).resolves.toEqual({
      value: [1, 2],
    });
  });

  it('uses the fallback and identifies the failed block', async () => {
    const result = await settleDashboardSource(
      'resumen de cartera',
      Promise.reject(new Error('No se pudo completar la solicitud. [400 /summary]')),
      [],
    );
    expect(result).toEqual({
      value: [],
      warning: 'resumen de cartera: No se pudo completar la solicitud. [400 /summary]',
    });
    expect(buildDashboardSourceWarning([result])).toContain('resumen de cartera');
  });

  it('combines only failed sources into one warning', () => {
    expect(
      buildDashboardSourceWarning([
        { value: [] },
        { value: [], warning: 'pagos: 400' },
        { value: [], warning: 'antigüedad: 403' },
      ]),
    ).toBe('Algunos bloques no pudieron actualizarse. pagos: 400 · antigüedad: 403');
  });
});
