import { supabase } from '../supabase';
import type { SelfServiceBillingPeriod, SelfServiceTrialIntent } from './selfServiceOnboarding';

export type CustomerInvitationStatus = 'pending' | 'accepted';

export type CustomerInvitationPreview = {
  found: boolean;
  status?: CustomerInvitationStatus;
  id?: string;
  email?: string;
  plan_code?: string;
  billing_period?: SelfServiceBillingPeriod;
  expires_at?: string;
  onboarding_completed?: boolean;
};

export type CustomerOnboardingInvitation = {
  found: boolean;
  id?: string;
  email?: string;
  plan_code?: string;
  billing_period?: SelfServiceBillingPeriod;
  accepted_at?: string;
};

export type AcceptedCustomerInvitation = {
  id: string;
  email: string;
  planCode: string;
  billingPeriod: SelfServiceBillingPeriod;
  onboardingCompleted: boolean;
};

const requireSupabase = () => {
  if (!supabase) throw new Error('La configuración de acceso no está disponible.');
  return supabase;
};

export async function getCustomerInvitationPreview(rawToken: string) {
  const client = requireSupabase();
  const result = await client.rpc('get_customer_invitation_preview_v2', { raw_token: rawToken });
  if (result.error) throw new Error('No se pudo validar la invitación de cliente.');
  return result.data as CustomerInvitationPreview;
}

export async function acceptCustomerInvitation(
  rawToken: string,
): Promise<AcceptedCustomerInvitation> {
  const client = requireSupabase();
  const result = await client.rpc('accept_customer_invitation_v2', { raw_token: rawToken });
  if (result.error) {
    const message = result.error.message.toLowerCase();
    if (message.includes('another email')) {
      throw new Error('Esta invitación pertenece a otro correo electrónico.');
    }
    if (message.includes('invalid invitation')) {
      throw new Error('Esta invitación venció, fue revocada o ya no está disponible.');
    }
    throw new Error('No se pudo aceptar la invitación de cliente.');
  }

  const data = result.data as {
    id?: string;
    email?: string;
    plan_code?: string;
    billing_period?: SelfServiceBillingPeriod;
    onboarding_completed?: boolean;
  };
  if (!data.id || !data.email || !data.plan_code || !data.billing_period) {
    throw new Error('La invitación no contiene el contexto comercial requerido.');
  }
  return {
    id: data.id,
    email: data.email,
    planCode: data.plan_code,
    billingPeriod: data.billing_period,
    onboardingCompleted: Boolean(data.onboarding_completed),
  };
}

export async function getMyCustomerOnboardingInvitation(): Promise<CustomerOnboardingInvitation | null> {
  const client = requireSupabase();
  const result = await client.rpc('get_my_customer_onboarding_invitation');
  if (result.error) throw new Error('No se pudo recuperar la invitación de onboarding.');
  const data = result.data as CustomerOnboardingInvitation;
  return data?.found ? data : null;
}

export function invitationTrialIntent(
  invitation: Pick<CustomerOnboardingInvitation, 'plan_code' | 'billing_period'> | null,
): SelfServiceTrialIntent | null {
  if (!invitation?.billing_period) return null;
  if (invitation.plan_code !== 'esencial' && invitation.plan_code !== 'comunidad') return null;
  return { planCode: invitation.plan_code, billingPeriod: invitation.billing_period };
}

export function customerPlanLabel(planCode?: string | null) {
  if (planCode === 'esencial') return 'Habitta Esencial';
  if (planCode === 'comunidad') return 'Habitta Comunidad';
  if (planCode === 'pro') return 'Habitta Pro';
  return planCode ? `Habitta ${planCode}` : 'Plan Habitta';
}

export function customerBillingPeriodLabel(period?: string | null) {
  return period === 'annual' ? 'anual' : 'mensual';
}
