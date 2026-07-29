import { describe, expect, it } from 'vitest';
import {
  serviceRequestCreateSchema,
  serviceRequestUpdateSchema,
  announcementCreateSchema,
  announcementUpdateSchema,
  announcementScheduleSchema,
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

  it('validates announcement audiences, updates and schedules', () => {
    expect(
      announcementCreateSchema.parse({
        title: 'Mantenimiento de ascensores',
        summary: 'El ascensor norte estará fuera de servicio.',
        body: 'El proveedor realizará mantenimiento preventivo durante la mañana.',
      }),
    ).toMatchObject({ priority: 'normal', audience: 'everyone' });
    expect(
      announcementCreateSchema.safeParse({
        title: 'Aviso de torre',
        summary: 'Información para una torre.',
        body: 'Contenido del aviso.',
        audience: 'building',
      }).success,
    ).toBe(false);
    expect(announcementUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      announcementUpdateSchema.safeParse({
        expiresAt: '2026-08-01T12:00:00Z',
        clearExpires: true,
      }).success,
    ).toBe(false);
    expect(
      announcementScheduleSchema.safeParse({ publishAt: '2026-08-01T12:00:00Z' }).success,
    ).toBe(true);
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
