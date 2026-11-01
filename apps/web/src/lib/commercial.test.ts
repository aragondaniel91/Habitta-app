import { describe, expect, it } from 'vitest';
import { commercialStatusLabel } from './commercial';

describe('commercialStatusLabel', () => {
  it('returns the customer-facing label for an active subscription', () => {
    expect(commercialStatusLabel('active')).toBe('Activa');
  });

  it('returns the fallback label when the subscription status is absent', () => {
    expect(commercialStatusLabel(undefined)).toBe('Sin suscripción');
  });
});
