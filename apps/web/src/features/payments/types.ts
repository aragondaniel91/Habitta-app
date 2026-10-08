export type Payment = {
  id: string;
  status: string;
  original_amount: string;
  original_currency_code: string;
  payment_date: string;
  payer_name: string;
  unit_id: string;
  treasury_account_id?: string | null;
  correction_reason?: string;
  rejection_reason?: string;
  reversal_reason?: string;
  reference?: string;
  notes?: string;
  payment_method_id: string;
  submitted_for_person_id?: string;
  submitted_by_user_id?: string;
  reviewed_by?: string | null;
  approved_by?: string | null;
  rejected_by?: string | null;
  reversed_by?: string | null;
  actor_names?: Record<string, string>;
  can_approve?: boolean;
};

/** Payments persist actor ids; names are resolved from the payment-authorized API surface. */
export const paymentActorLabel = (
  actorUserId: string | null | undefined,
  payment?: Pick<Payment, 'actor_names'>,
  currentUser?: { id?: string; user_metadata?: { full_name?: unknown } },
) => {
  if (!actorUserId) return null;
  const currentName =
    actorUserId === currentUser?.id && typeof currentUser.user_metadata?.full_name === 'string'
      ? currentUser.user_metadata.full_name.trim()
      : '';
  return currentName || payment?.actor_names?.[actorUserId] || 'Nombre no disponible';
};
export type PaymentMethod = {
  id: string;
  display_name: string;
  currency_code: string;
  instructions?: string;
  requires_proof: boolean;
  requires_reference: boolean;
  method_type: string;
  is_active: boolean;
  account_holder?: string | null;
  bank_name?: string | null;
  account_identifier_masked?: string | null;
  phone_masked?: string | null;
  email_masked?: string | null;
};
export type Receivable = {
  id: string;
  unit_id: string;
  description: string;
  currency_code: string;
  outstanding_amount?: string;
};
export type AllocationInput = {
  receivableItemId: string;
  paymentAmount: string;
  receivableAmount: string;
  paymentCurrencyCode: string;
  receivableCurrencyCode: string;
  receivablePerPaymentRate?: string;
};
export type AllocationPreview = {
  total_used: string;
  remaining: string;
  errors: string[];
  warnings: string[];
  recognized_by_currency: Record<string, string>;
  allocations: unknown[];
};
export type PaymentReceipt = {
  receipt_number: string;
  issued_at: string;
  snapshot: {
    condominium: { id: string; name: string };
    unit: { id: string; code: string };
    method: { display_name: string; currency_code: string };
    payment: { payer: string; amount: string; currency_code: string; date: string };
    approval: { allocations: unknown[]; unapplied_credit: string };
  };
};
