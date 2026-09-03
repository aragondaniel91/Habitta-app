import type { Session } from '@supabase/supabase-js';
import { apiRequest } from './api';

export type BillingSetupResult = {
  attemptId?: string;
  status: 'provider_created' | 'ready';
  provider?: string;
  action?: { kind: 'redirect'; url: string };
  expiresAt?: string;
  billingMethodReady: boolean;
  autoBillEnabled: boolean;
};

const storageKey = (condominiumId: string) => `habitta.billing-setup.${condominiumId}`;

const canUseSessionStorage = () => typeof window !== 'undefined' && Boolean(window.sessionStorage);

const getOrCreateBillingSetupKey = (condominiumId: string) => {
  const key = storageKey(condominiumId);
  if (canUseSessionStorage()) {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
  }
  const created = crypto.randomUUID();
  if (canUseSessionStorage()) window.sessionStorage.setItem(key, created);
  return created;
};

export const clearBillingSetupIntent = (condominiumId: string) => {
  if (canUseSessionStorage()) window.sessionStorage.removeItem(storageKey(condominiumId));
};

export async function startBillingSetup(condominiumId: string, session: Session) {
  const idempotencyKey = getOrCreateBillingSetupKey(condominiumId);
  const result = await apiRequest<BillingSetupResult>(
    `/v1/condominiums/${condominiumId}/billing/setup`,
    session,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  if (result.billingMethodReady || result.status === 'ready') clearBillingSetupIntent(condominiumId);
  return result;
}

export function safeBillingRedirectUrl(value: string) {
  const url = new URL(value, window.location.origin);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Habitta recibió una dirección de pago no válida.');
  }
  return url.toString();
}
