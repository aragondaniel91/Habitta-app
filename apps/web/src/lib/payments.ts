import type { Payment, PaymentMethod } from '../features/payments/types';

export type PaymentFilters = {
  query: string;
  status: string;
  currencyCode: string;
  methodId: string;
};

export const paymentStatusLabels: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Enviado',
  under_review: 'En revisión',
  correction_requested: 'Corrección solicitada',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  reversed: 'Reversado',
};

export const paymentStatusTone = (status: string) => {
  if (status === 'approved') return 'success' as const;
  if (['submitted', 'under_review'].includes(status)) return 'info' as const;
  if (status === 'correction_requested') return 'warning' as const;
  return 'neutral' as const;
};

export const getPaymentCurrencies = (payments: Payment[], methods: PaymentMethod[]) =>
  [...new Set([...payments.map((payment) => payment.original_currency_code), ...methods.map((method) => method.currency_code)])]
    .filter(Boolean)
    .sort();

export const getPaymentSummary = (payments: Payment[], currencyCode: string) => {
  const rows = payments.filter((payment) => !currencyCode || payment.original_currency_code === currencyCode);
  const amountFor = (statuses: string[]) =>
    rows
      .filter((payment) => statuses.includes(payment.status))
      .reduce((total, payment) => total + Number(payment.original_amount || 0), 0);

  return {
    approvedAmount: amountFor(['approved']),
    pendingReview: rows.filter((payment) => ['submitted', 'under_review'].includes(payment.status)).length,
    drafts: rows.filter((payment) => ['draft', 'correction_requested'].includes(payment.status)).length,
    reversedAmount: amountFor(['reversed']),
  };
};

export const filterPayments = (
  payments: Payment[],
  methods: PaymentMethod[],
  unitCodes: Map<string, string>,
  filters: PaymentFilters,
) => {
  const queryTokens = filters.query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const methodNames = new Map(methods.map((method) => [method.id, method.display_name]));

  return payments.filter((payment) => {
    if (filters.status && payment.status !== filters.status) return false;
    if (filters.currencyCode && payment.original_currency_code !== filters.currencyCode) return false;
    if (filters.methodId && payment.payment_method_id !== filters.methodId) return false;
    if (!queryTokens.length) return true;

    const haystack = [
      payment.payer_name,
      payment.reference,
      payment.notes,
      paymentStatusLabels[payment.status] ?? payment.status,
      unitCodes.get(payment.unit_id),
      methodNames.get(payment.payment_method_id),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();

    return queryTokens.every((token) => haystack.includes(token));
  });
};

export const sortPayments = (payments: Payment[]) =>
  [...payments].sort((left, right) => {
    const dateOrder = right.payment_date.localeCompare(left.payment_date);
    return dateOrder || right.id.localeCompare(left.id);
  });
