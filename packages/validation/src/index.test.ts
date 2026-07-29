import { describe, expect, it } from 'vitest';
import {
  serviceRequestCreateSchema,
  serviceRequestUpdateSchema,
  signInSchema,
  tenantContextSchema,
} from './index';

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

  it('validates request creation and defaults priority', () => {
    const result = serviceRequestCreateSchema.parse({
      categoryId: '67ec9ac3-2b55-4b3e-a7fc-b4d660e9aeeb',
      title: 'Fuga en el pasillo',
      description: 'Hay agua frente al ascensor.',
    });
    expect(result.priority).toBe('normal');
  });

  it('rejects contradictory or empty request updates', () => {
    expect(serviceRequestUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      serviceRequestUpdateSchema.safeParse({
        assignedToUserId: '67ec9ac3-2b55-4b3e-a7fc-b4d660e9aeeb',
        clearAssignee: true,
      }).success,
    ).toBe(false);
    expect(serviceRequestUpdateSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
  });
});
