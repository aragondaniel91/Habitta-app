import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './index';

describe('API contracts', () => {
  it('validates the health response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', service: 'habitta-api' })).toEqual({
      status: 'ok',
      service: 'habitta-api',
    });
  });
});
