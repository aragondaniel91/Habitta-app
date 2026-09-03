import {
  browserSelfServiceStorage,
  clearSelfServiceIdempotencyKey,
  getOrCreateSelfServiceIdempotencyKey,
  type SelfServiceTrialIntent,
} from './selfServiceOnboarding';
import { supabase } from '../supabase';

export type OrganizationType = 'independent' | 'management_company';
export type PropertyTopology =
  'house_community' | 'single_building' | 'multi_building_complex' | 'mixed';

export type AdminOnboardingInput = {
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  condominiumName: string;
  legalName: string;
  legalIdType: string;
  legalIdNumber: string;
  countryCode: string;
  addressLine1: string;
  addressLine2: string;
  stateRegion: string;
  municipality: string;
  parish: string;
  city: string;
  postalCode: string;
  timezone: string;
  primaryCurrencyCode: string;
  secondaryCurrencyCode: string;
  propertyTopology: PropertyTopology | '';
  declaredUnitCount: string;
  declaredBuildingCount: string;
  firstBuildingName: string;
};

export type AdminOnboardingErrors = Partial<Record<keyof AdminOnboardingInput, string | undefined>>;

export type AdminOnboardingResult = {
  organization?: { id: string; name: string } | null;
  condominium?: {
    id: string;
    name: string;
    organization_id: string;
    property_topology?: string;
  } | null;
  building?: { id: string; name: string } | null;
  trial?: {
    subscription_id: string;
    status: string;
    commercial_status: string;
    plan_code: string;
    billing_period: string;
    contracted_period_amount: number;
    trial_starts_at: string;
    trial_ends_at: string;
    auto_bill_enabled: boolean;
  } | null;
};

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

export const PROPERTY_TOPOLOGY_OPTIONS: Array<{
  value: PropertyTopology;
  title: string;
  description: string;
}> = [
  {
    value: 'house_community',
    title: 'Conjunto de casas',
    description: 'Casas independientes administradas bajo un mismo condominio.',
  },
  {
    value: 'single_building',
    title: 'Edificio residencial',
    description: 'Un solo edificio con apartamentos, locales u otras unidades.',
  },
  {
    value: 'multi_building_complex',
    title: 'Conjunto residencial',
    description: 'Un condominio general con dos o más edificios o torres.',
  },
  {
    value: 'mixed',
    title: 'Estructura mixta',
    description: 'Combina casas, edificios, locales u otras estructuras.',
  },
];

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

export function suggestedLegalIdType(countryCode: string) {
  return countryCode === 'VE' ? 'RIF' : '';
}

export function topologyLabel(topology: AdminOnboardingInput['propertyTopology']) {
  return PROPERTY_TOPOLOGY_OPTIONS.find((item) => item.value === topology)?.title ?? 'No definida';
}

export function createEmptyAdminOnboardingInput(organizationId = ''): AdminOnboardingInput {
  return {
    organizationId,
    organizationName: '',
    organizationType: 'independent',
    condominiumName: '',
    legalName: '',
    legalIdType: 'RIF',
    legalIdNumber: '',
    countryCode: 'VE',
    addressLine1: '',
    addressLine2: '',
    stateRegion: '',
    municipality: '',
    parish: '',
    city: '',
    postalCode: '',
    timezone: suggestedTimezone('VE'),
    primaryCurrencyCode: suggestedCurrency('VE'),
    secondaryCurrencyCode: 'USD',
    propertyTopology: '',
    declaredUnitCount: '',
    declaredBuildingCount: '',
    firstBuildingName: '',
  };
}

function validCount(value: string, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum;
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
  if (input.addressLine1.trim().length < 3) {
    errors.addressLine1 = 'Escribe la dirección principal del condominio.';
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
  if (input.secondaryCurrencyCode && input.secondaryCurrencyCode === input.primaryCurrencyCode) {
    errors.secondaryCurrencyCode = 'La moneda secundaria debe ser diferente.';
  }

  const hasLegalType = Boolean(input.legalIdType.trim());
  const hasLegalNumber = Boolean(input.legalIdNumber.trim());
  if (hasLegalNumber && !hasLegalType) {
    errors.legalIdType = 'Indica el tipo de identificación legal.';
  }

  if (!input.propertyTopology) {
    errors.propertyTopology = 'Selecciona cómo está estructurado este condominio.';
  } else if (input.propertyTopology === 'house_community') {
    if (!validCount(input.declaredUnitCount, 100000)) {
      errors.declaredUnitCount = 'Indica cuántas casas administra el condominio.';
    }
  } else if (input.propertyTopology === 'single_building') {
    if (!validCount(input.declaredUnitCount, 100000)) {
      errors.declaredUnitCount = 'Indica cuántos apartamentos o unidades administra el edificio.';
    }
  } else if (input.propertyTopology === 'multi_building_complex') {
    if (
      !validCount(input.declaredBuildingCount, 10000) ||
      Number(input.declaredBuildingCount) < 2
    ) {
      errors.declaredBuildingCount = 'Indica al menos 2 edificios o torres.';
    }
  } else if (input.propertyTopology === 'mixed') {
    if (input.declaredUnitCount && !validCount(input.declaredUnitCount, 100000)) {
      errors.declaredUnitCount = 'Introduce un número de unidades válido.';
    }
    if (input.declaredBuildingCount && !validCount(input.declaredBuildingCount, 10000)) {
      errors.declaredBuildingCount = 'Introduce un número de edificios válido.';
    }
  }

  return errors;
}

function countOrNull(value: string) {
  return value ? Number(value) : null;
}

function rpcPayload(input: AdminOnboardingInput) {
  if (!input.propertyTopology) throw new Error('Selecciona el tipo de condominio.');

  return {
    condominium_name: input.condominiumName.trim(),
    country_code: input.countryCode,
    address_line1: input.addressLine1.trim(),
    city: input.city.trim(),
    timezone: input.timezone,
    primary_currency_code: input.primaryCurrencyCode,
    property_topology: input.propertyTopology,
    secondary_currency_code: input.secondaryCurrencyCode || null,
    legal_name: input.legalName.trim() || null,
    legal_id_type: input.legalIdNumber.trim() ? input.legalIdType.trim() || null : null,
    legal_id_number: input.legalIdNumber.trim() || null,
    address_line2: input.addressLine2.trim() || null,
    state_region: input.stateRegion.trim() || null,
    municipality: input.municipality.trim() || null,
    parish: input.parish.trim() || null,
    postal_code: input.postalCode.trim() || null,
    declared_unit_count: countOrNull(input.declaredUnitCount),
    declared_building_count:
      input.propertyTopology === 'single_building' ? 1 : countOrNull(input.declaredBuildingCount),
    first_building_name:
      input.propertyTopology === 'single_building' ? input.firstBuildingName.trim() || null : null,
  };
}

async function submitSelfServiceTrial(input: AdminOnboardingInput, intent: SelfServiceTrialIntent) {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');

  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) {
    throw new Error('Tu sesión debe estar activa para comenzar la prueba gratis.');
  }

  const userId = userResult.data.user.id;
  const storage = browserSelfServiceStorage();
  const idempotencyKey = getOrCreateSelfServiceIdempotencyKey(storage, userId, intent);
  const profile = rpcPayload(input);
  const result = await supabase.rpc('create_self_service_trial_workspace_v1', {
    p_organization_name: input.organizationName.trim(),
    p_organization_type: input.organizationType,
    p_condominium_name: profile.condominium_name,
    p_country_code: profile.country_code,
    p_address_line1: profile.address_line1,
    p_city: profile.city,
    p_timezone: profile.timezone,
    p_primary_currency_code: profile.primary_currency_code,
    p_property_topology: profile.property_topology,
    p_plan_code: intent.planCode,
    p_billing_period: intent.billingPeriod,
    p_idempotency_key: idempotencyKey,
    p_secondary_currency_code: profile.secondary_currency_code,
    p_legal_name: profile.legal_name,
    p_legal_id_type: profile.legal_id_type,
    p_legal_id_number: profile.legal_id_number,
    p_address_line2: profile.address_line2,
    p_state_region: profile.state_region,
    p_municipality: profile.municipality,
    p_parish: profile.parish,
    p_postal_code: profile.postal_code,
    p_declared_unit_count: profile.declared_unit_count,
    p_declared_building_count: profile.declared_building_count,
    p_first_building_name: profile.first_building_name,
  });

  if (!result.error) clearSelfServiceIdempotencyKey(storage, userId);
  return result;
}

export async function submitAdminOnboarding(
  input: AdminOnboardingInput,
  hasOrganization: boolean,
  selfServiceIntent: SelfServiceTrialIntent | null = null,
): Promise<AdminOnboardingResult | null> {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');

  const result = hasOrganization
    ? await supabase.rpc('create_condominium_with_profile_v2', {
        target_organization_id: input.organizationId,
        ...rpcPayload(input),
      })
    : selfServiceIntent
      ? await submitSelfServiceTrial(input, selfServiceIntent)
      : await supabase.rpc('create_admin_workspace_v2', {
          organization_name: input.organizationName.trim(),
          organization_type: input.organizationType,
          ...rpcPayload(input),
        });

  if (result.error) {
    const message = result.error.message.toLowerCase();
    if (message.includes('selected plan requires guided onboarding')) {
      throw new Error('Este plan requiere acompañamiento de Habitta para completar la activación.');
    }
    if (message.includes('selected plan unit limit exceeded')) {
      throw new Error(
        'La cantidad de unidades supera el límite del plan seleccionado. Elige un plan superior para continuar.',
      );
    }
    if (message.includes('idempotency key reused')) {
      throw new Error(
        'La selección de la prueba cambió durante el registro. Vuelve a iniciar el proceso desde Planes.',
      );
    }
    if (message.includes('self-service onboarding is only available for the first workspace')) {
      throw new Error('Tu espacio ya existe. Recarga Habitta para continuar con tu condominio.');
    }
    if (message.includes('already belongs')) {
      throw new Error(
        'Esta cuenta ya pertenece a una organización. Recarga la página e inténtalo nuevamente.',
      );
    }
    if (message.includes('organization owner required')) {
      throw new Error('No tienes permisos para agregar condominios a esta organización.');
    }
    if (message.includes('duplicate key')) {
      throw new Error('Ya existe un condominio o un edificio con ese nombre.');
    }
    if (message.includes('legal id')) {
      throw new Error('Revisa el tipo y número de identificación legal del condominio.');
    }
    if (
      message.includes('topology') ||
      message.includes('building') ||
      message.includes('unit count')
    ) {
      throw new Error('Revisa el tipo de propiedad y las cantidades declaradas.');
    }
    throw new Error(
      'No pudimos crear el condominio. Revisa la información e inténtalo nuevamente.',
    );
  }

  return result.data as AdminOnboardingResult | null;
}

export const PROGRESSIVE_SETUP_ITEMS = [
  'Completar unidades, edificios y alícuotas',
  'Agregar métodos de pago',
  'Configurar conceptos y cuotas',
  'Invitar administradores',
  'Importar propietarios, residentes y contactos',
  'Configurar notificaciones',
] as const;
