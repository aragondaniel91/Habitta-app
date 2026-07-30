export type PasswordAssessment = {
  minimumLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  score: number;
  valid: boolean;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function assessPassword(password: string): PasswordAssessment {
  const assessment = {
    minimumLength: password.length >= 10,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
  };
  const score = Object.values(assessment).filter(Boolean).length;

  return {
    ...assessment,
    score,
    valid: score === 4,
  };
}

export function translateAuthError(error: unknown) {
  const fallback = 'No pudimos completar la solicitud. Intenta nuevamente.';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = message.toLowerCase();

  if (!normalized) return fallback;
  if (normalized.includes('invalid login credentials'))
    return 'El correo o la contraseña no son correctos.';
  if (normalized.includes('email not confirmed'))
    return 'Confirma tu correo antes de iniciar sesión.';
  if (normalized.includes('user already registered'))
    return 'Ya existe una cuenta con este correo.';
  if (normalized.includes('password should be at least'))
    return 'La contraseña no cumple con la longitud mínima requerida.';
  if (normalized.includes('same password'))
    return 'La nueva contraseña debe ser diferente a la anterior.';
  if (normalized.includes('rate limit') || normalized.includes('too many requests'))
    return 'Se realizaron demasiados intentos. Espera unos minutos y vuelve a intentarlo.';
  if (normalized.includes('network') || normalized.includes('fetch'))
    return 'No pudimos conectarnos con el servicio de acceso. Revisa tu conexión.';
  if (normalized.includes('expired') || normalized.includes('invalid token'))
    return 'El enlace ya no es válido. Solicita uno nuevo.';

  return fallback;
}
