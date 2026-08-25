import type { Session } from '@supabase/supabase-js';
import { apiRequest } from '../../lib/api';

export type LateFeeSettings = {
  condominium_id: string;
  enabled: boolean;
  rate_percent: number;
  grace_period_days: number;
  cap_percent: number | null;
  local_currency_code: string;
  applies_to_foreign_currency: boolean;
};

export type LateFeeSettingsInput = {
  enabled: boolean;
  ratePercent: number;
  gracePeriodDays: number;
  capPercent: number | null;
  localCurrencyCode: string;
  appliesToForeignCurrency: boolean;
};

export type LateFeePreview = {
  period: string;
  count: number;
  totals: { currencyCode: string; amount: string }[];
};

export const getLateFeeSettings = (condominiumId: string, session: Session) =>
  apiRequest<LateFeeSettings>(`/v1/condominiums/${condominiumId}/late-fee-settings`, session);

export const updateLateFeeSettings = (
  condominiumId: string,
  session: Session,
  input: LateFeeSettingsInput,
) =>
  apiRequest<LateFeeSettings>(`/v1/condominiums/${condominiumId}/late-fee-settings`, session, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const previewLateFees = (condominiumId: string, session: Session) =>
  apiRequest<LateFeePreview>(`/v1/condominiums/${condominiumId}/late-fees/preview`, session, {
    method: 'POST',
  });

export const applyLateFees = (condominiumId: string, session: Session) =>
  apiRequest<number>(`/v1/condominiums/${condominiumId}/late-fees/apply`, session, {
    method: 'POST',
  });
