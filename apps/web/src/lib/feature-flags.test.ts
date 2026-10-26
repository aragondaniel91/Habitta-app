import { describe, expect, it } from 'vitest';
import { isExplicitlyEnabled } from './feature-flags';

describe('experimental feature flags', () => {
  it('enables an experimental surface only for an explicit true value', () => {
    expect(isExplicitlyEnabled(undefined)).toBe(false);
    expect(isExplicitlyEnabled('')).toBe(false);
    expect(isExplicitlyEnabled('false')).toBe(false);
    expect(isExplicitlyEnabled('TRUE')).toBe(false);
    expect(isExplicitlyEnabled('true')).toBe(true);
  });
});
