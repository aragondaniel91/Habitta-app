import { describe, expect, it } from 'vitest';
import { signInSchema, tenantContextSchema } from './index';

describe('validation schemas', () => {
  it('rejects an invalid sign-in email', () => {
    expect(signInSchema.safeParse({ email: 'invalid', password: 'password123' }).success).toBe(
      false,
    );
  });

  it('accepts a tenant context with UUIDs', () => {
    expect(
      tenantContextSchema.safeParse({
        organizationId: '67ec9ac3-2b55-4b3e-a7fc-b4d660e9aeeb',
        condominiumId: 'b8ad2370-738e-474f-94be-98e7a43fdf12',
      }).success,
    ).toBe(true);
  });
});
