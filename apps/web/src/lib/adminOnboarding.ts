import { supabase } from '../supabase';

export type OrganizationType = 'independent' | 'management_company';

export type AdminOnboardingInput = {
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  condominiumName: string;
  countryCode: string;
  city: string;
  timezone: string;
  primaryCurrencyCode: string;
  secondaryCurrencyCode: string;
  approximateUnits: string;
  firstBuildingName: string;
};

export type AdminOnboardingErrors = Partial<Record<keyof AdminOnboardingInput, string>>;

export const COUNTRY_OPTIONS = [
  { code: 'VE', label: 'Venezuela' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'CO', label: 'Colombia' },
  { code: 'CL', label: 'Chile' },
  { code: 'PA', label: 'Panamá' },
  { code: 'MX', label: 'México' },
  { code: 'PE', label: 'Perú' },
  { code: 'EC', label: 'Ecuador' },
  { code: 'AR', label: 'Argentina' },
  { code: 'DO', label: 'República Dominicana' },
  { code: 'CR', label: 'Costa Rica' },
  { code: 'ES', label: 'España' },
] as const;

export const TIMEZONE_OPTIONS = [
  { value: 'America/Caracas', label: 'Caracas (GMT-4)' },
  { value: 'America/Bogota', label: 'Bogotá, Lima, Quito (GMT-5)' },
  { value: 'America/Panama', label: 'Panamá (GMT-5)' },
  { value: 'America/Santo_Domingo', label: 'Santo Domingo (GMT-4)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México' },
  { value: 'America/Chicago', label: 'Centro de EE. UU.' },
  { value: 'America/New_York', label: 'Este de EE. UU.' },
  { value: 'America/Denver', label: 'Montaña de EE. UU.' },
  { value: 'America/Los_Angeles', label: 'Pacífico de EE. UU.' },
  { value: 'America/Santiago', label: 'Santiago de Chile' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'Europe/Madrid', label: 'Madrid' },
] as const;

export const CURRENCY_OPTIONS = [
  { code: 'VES', label: 'VES — Bolívar venezolano' },
  { code: 'USD', label: 'USD — Dólar estadounidense' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'COP', label: 'COP — Peso colombiano' },
  { code: 'CLP', label: 'CLP — Peso chileno' },
  { code: 'MXN', label: 'MXN — Peso mexicano' },
  { code: 'PEN', label: 'PEN — Sol peruano' },
  { code: 'ARS', label: 'ARS — Peso argentino' },
  { code: 'DOP', label: 'DOP — Peso dominicano' },
  { code: 'CRC', label: 'CRC — Colón costarricense' },
] as const;

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  VE: 'VES',
  US: 'USD',
  CO: 'COP',
  CL: 'CLP',
  PA: 'USD',
  MX: 'MXN',
  PE: 'PEN',
  EC: 'USD',
  AR: 'ARS',
  DO: 'DOP',
  CR: 'CRC',
  ES: 'EUR',
};

const TIMEZONE_BY_COUNTRY: Record<string, string> = {
  VE: 'America/Caracas',
  US: 'America/Chicago',
  CO: 'America/Bogota',
  CL: 'America/Santiago',
  PA: 'America/Panama',
  MX: 'America/Mexico_City',
  PE: 'America/Bogota',
  EC: 'America/Bogota',
  AR: 'America/Argentina/Buenos_Aires',
  DO: 'America/Santo_Domingo',
  CR: 'America/Panama',
  ES: 'Europe/Madrid',
};

export function suggestedCurrency(countryCode: string) {
  return CURRENCY_BY_COUNTRY[countryCode] ?? 'USD';
}

export function suggestedTimezone(countryCode: string) {
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONE_BY_COUNTRY[countryCode] ?? browserTimezone ?? 'America/Caracas';
}

export function createEmptyAdminOnboardingInput(organizationId = ''): AdminOnboardingInput {
  return {
    organizationId,
    organizationName: '',
    organizationType: 'independent',
    condominiumName: '',
    countryCode: 'VE',
    city: '',
    timezone: suggestedTimezone('VE'),
    primaryCurrencyCode: suggestedCurrency('VE'),
    secondaryCurrencyCode: 'USD',
    approximateUnits: '',
    firstBuildingName: '',
  };
}

export function validateAdminOnboarding(
  input: AdminOnboardingInput,
  hasOrganization: boolean,
): AdminOnboardingErrors {
  const errors: AdminOnboardingErrors = {};

  if (hasOrganization && !input.organizationId) {
    errors.organizationId = 'Selecciona la organización que administrará este condominio.';
  }
  if (!hasOrganization && input.organizationName.trim().length < 2) {
    errors.organizationName = 'Escribe un nombre de al menos 2 caracteres.';
  }
  if (input.condominiumName.trim().length < 2) {
    errors.condominiumName = 'Escribe el nombre del condominio.';
  }
  if (!/^[A-Z]{2}$/.test(input.countryCode)) {
    errors.countryCode = 'Selecciona un país válido.';
  }
  if (input.city.trim().length < 2) {
    errors.city = 'Escribe la ciudad donde está ubicado.';
  }
  if (!input.timezone) {
    errors.timezone = 'Selecciona la zona horaria.';
  }
  if (!/^[A-Z]{3}$/.test(input.primaryCurrencyCode)) {
    errors.primaryCurrencyCode = 'Selecciona la moneda principal.';
  }
  if (
    input.secondaryCurrencyCode &&
    input.secondaryCurrencyCode === input.primaryCurrencyCode
  ) {
    errors.secondaryCurrencyCode = 'La moneda secundaria debe ser diferente.';
  }
  if (input.approximateUnits) {
    const unitCount = Number(input.approximateUnits);
    if (!Number.isInteger(unitCount) || unitCount < 1 || unitCount > 100000) {
      errors.approximateUnits = 'Introduce un número entre 1 y 100.000.';
    }
  }

  return errors;
}

function rpcPayload(input: AdminOnboardingInput) {
  return {
    condominium_name: input.condominiumName.trim(),
    country_code: input.countryCode,
    city: input.city.trim(),
    timezone: input.timezone,
    primary_currency_code: input.primaryCurrencyCode,
    secondary_currency_code: input.secondaryCurrencyCode || null,
    approximate_units: input.approximateUnits ? Number(input.approximateUnits) : null,
    first_building_name: input.firstBuildingName.trim() || null,
  };
}

export async function submitAdminOnboarding(
  input: AdminOnboardingInput,
  hasOrganization: boolean,
) {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');

  const result = hasOrganization
    ? await supabase.rpc('create_condominium_with_profile', {
        target_organization_id: input.organizationId,
        ...rpcPayload(input),
      })
    : await supabase.rpc('create_admin_workspace', {
        organization_name: input.organizationName.trim(),
        organization_type: input.organizationType,
        ...rpcPayload(input),
      });

  if (result.error) {
    const message = result.error.message.toLowerCase();
    if (message.includes('already belongs')) {
      throw new Error('Esta cuenta ya pertenece a una organización. Recarga la página e inténtalo nuevamente.');
    }
    if (message.includes('organization owner required')) {
      throw new Error('No tienes permisos para agregar condominios a esta organización.');
    }
    if (message.includes('duplicate key')) {
      throw new Error('Ya existe un condominio o una torre con ese nombre.');
    }
    throw new Error('No pudimos crear el condominio. Revisa la información e inténtalo nuevamente.');
  }

  return result.data;
}

export const PROGRESSIVE_SETUP_ITEMS = [
  'Crear torres y unidades',
  'Agregar métodos de pago',
  'Configurar cuotas',
  'Invitar administradores',
  'Importar propietarios y residentes',
  'Configurar notificaciones',
] as const;
