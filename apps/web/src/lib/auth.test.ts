import { describe, expect, it } from 'vitest';
import { assessPassword, normalizeEmail, translateAuthError } from './auth';

describe('auth helpers', () => {
  it('normalizes email addresses', () => {
    expect(normalizeEmail('  Admin@Habitta.COM ')).toBe('admin@habitta.com');
  });

  it('requires ten characters, uppercase, lowercase and a number', () => {
    expect(assessPassword('Habitta2026')).toMatchObject({
      minimumLength: true,
      uppercase: true,
      lowercase: true,
      number: true,
      score: 4,
      valid: true,
    });
    expect(assessPassword('habitta')).toMatchObject({ score: 1, valid: false });
  });

  it('translates common Supabase authentication errors', () => {
    expect(translateAuthError(new Error('Invalid login credentials'))).toBe(
      'El correo o la contraseña no son correctos.',
    );
    expect(translateAuthError(new Error('Email not confirmed'))).toBe(
      'Confirma tu correo antes de iniciar sesión.',
    );
  });
});
