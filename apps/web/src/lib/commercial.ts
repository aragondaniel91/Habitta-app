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

export async function loadCommercialSummary(condominiumId: string) {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');
  const result = await supabase.rpc('my_commercial_summary', {
    p_condominium_id: condominiumId,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as CommercialSummary;
}

export function commercialStatusLabel(status: CommercialSummary['status']) {
  return (
    {
      trialing: 'Prueba gratuita',
      active: 'Activa',
      past_due: 'Pago vencido',
      suspended: 'Suspendida',
      cancelled: 'Cancelada',
    }[status ?? ''] ?? 'Sin suscripción'
  );
}

export function commercialBenefitLabel(summary: CommercialSummary) {
  if (summary.status === 'trialing') return '30 días gratis';
  if (summary.adjustment_source === 'gift') return 'Acceso regalado';
  if (summary.adjustment_source === 'coupon') return 'Descuento promocional';
  return 'Precio contratado';
}
