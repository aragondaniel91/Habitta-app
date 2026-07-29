import { describe, expect, it } from 'vitest';
import { APP_ROUTES, DEFAULT_ROUTE, getRouteFromPath } from './navigation';

describe('application navigation', () => {
  it('uses unique keys and paths for every module', () => {
    expect(new Set(APP_ROUTES.map((route) => route.key)).size).toBe(APP_ROUTES.length);
    expect(new Set(APP_ROUTES.map((route) => route.path)).size).toBe(APP_ROUTES.length);
  });

  it('resolves the dashboard for root and unknown paths', () => {
    expect(getRouteFromPath('/')).toBe(DEFAULT_ROUTE);
    expect(getRouteFromPath('/app')).toBe(DEFAULT_ROUTE);
    expect(getRouteFromPath('/not-a-real-page')).toBe(DEFAULT_ROUTE);
  });

  it('accepts a trailing slash on known routes', () => {
    expect(getRouteFromPath('/app/payments/').key).toBe('payments');
  });
});
