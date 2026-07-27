export type Payment = {
  id: string;
  status: string;
  original_amount: string;
  original_currency_code: string;
  payment_date: string;
  payer_name: string;
  unit_id: string;
  correction_reason?: string;
  rejection_reason?: string;
  reversal_reason?: string;
};
export type PaymentMethod = {
  id: string;
  display_name: string;
  currency_code: string;
  instructions?: string;
  requires_proof: boolean;
};
