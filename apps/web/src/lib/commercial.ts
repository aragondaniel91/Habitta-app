import { supabase } from '../supabase';

export type CommercialSummary = {
  found: boolean;
  has_term?: boolean;
  condominium_id: string;
  status?: 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  commercial_status?: 'not_yet_confirmed' | 'confirmed';
  plan_code?: string;
  plan_name?: string;
  billing_period?: 'monthly' | 'annual';
  currency?: string;
  catalog_reference_amount?: number;
  contracted_period_amount?: number;
  current_effective_period_amount?: number;
  next_period_amount?: number;
  trial_starts_at?: string | null;
  trial_ends_at?: string | null;
  next_billing_date?: string | null;
  adjustment_source?: 'coupon' | 'gift' | null;
  adjustment_kind?: 'percentage' | 'fixed' | 'free' | null;
  adjustment_ends_at?: string | null;
  auto_bill_enabled?: boolean;
  billing_consent_recorded?: boolean;
  billing_method_ready?: boolean;
};

export type CommercialCheckoutPromotion = {
  code: string;
  kind: 'percentage' | 'fixed';
  percentage_off: number | null;
  fixed_amount: number | null;
  currency: string | null;
  duration_months: number;
  starts_on: string;
  ends_on: string;
  effective_period_amount: number;
};

export type CommercialCheckoutPreview = {
  condominium_id: string;
  subscription_id: string;
  status: 'trialing';
  commercial_status: 'not_yet_confirmed' | 'confirmed';
  plan_code: string;
  plan_name: string;
  billing_period: 'monthly' | 'annual';
  currency: string;
  catalog_period_amount: number;
  contracted_period_amount: number;
  amount_due_today: number;
  trial_ends_at: string;
  first_billing_at: string;
  first_billing_date: string;
  first_period_amount: number;
  post_promotion_period_amount: number;
  promotion: CommercialCheckoutPromotion | null;
  billing_consent_recorded: boolean;
  billing_method_ready: boolean;
  auto_bill_enabled: boolean;
  terms_fingerprint: string;
  billing_consent_at?: string;
  idempotent_replay?: boolean;
};

export async function loadCommercialSummary(condominiumId: string) {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');
  const result = await supabase.rpc('my_commercial_summary', {
    p_condominium_id: condominiumId,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as CommercialSummary;
}

export async function loadCommercialCheckoutPreview(
  condominiumId: string,
  offerCode?: string | null,
) {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');
  const result = await supabase.rpc('get_customer_commercial_checkout_preview_v1', {
    p_condominium_id: condominiumId,
    p_offer_code: offerCode?.trim() || null,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as CommercialCheckoutPreview;
}

export async function recordCommercialConsent(
  condominiumId: string,
  offerCode: string | null,
  termsFingerprint: string,
) {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');
  const result = await supabase.rpc('record_customer_commercial_consent_v1', {
    p_condominium_id: condominiumId,
    p_offer_code: offerCode?.trim() || null,
    p_terms_fingerprint: termsFingerprint,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as CommercialCheckoutPreview;
}

export function commercialStatusLabel(status: CommercialSummary['status']) {
  if (!status) return 'Sin suscripción';
  return {
    trialing: 'Prueba gratuita',
    active: 'Activa',
    past_due: 'Pago vencido',
    suspended: 'Suspendida',
    cancelled: 'Cancelada',
  }[status];
}

export function commercialBenefitLabel(summary: CommercialSummary) {
  if (summary.status === 'trialing') return '30 días gratis';
  if (summary.adjustment_source === 'gift') return 'Acceso regalado';
  if (summary.adjustment_source === 'coupon') return 'Descuento promocional';
  return 'Precio contratado';
}
