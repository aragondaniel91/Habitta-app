export type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'void';

export type ExpenseCategory = {
  id: string;
  condominium_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type ExpenseVendor = {
  id: string;
  condominium_id: string;
  name: string;
  tax_identifier: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

export type ExpenseRecord = {
  id: string;
  condominium_id: string;
  category_id: string;
  vendor_id: string | null;
  description: string;
  invoice_number: string | null;
  expense_date: string;
  due_date: string | null;
  amount: string;
  currency_code: string;
  status: ExpenseStatus;
  payment_method: string | null;
  payment_reference: string | null;
  treasury_account_id: string | null;
  support_url: string | null;
  notes: string | null;
  approved_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ExpenseAttachment = {
  id: string;
  expense_id: string;
  condominium_id: string;
  document_type: 'invoice' | 'receipt' | 'quote' | 'support' | 'other';
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export type ExpenseEvent = {
  id: string;
  expense_id: string;
  event_type: 'created' | 'updated' | 'submitted' | 'approved' | 'paid' | 'voided';
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export type ExpenseCurrencySummary = {
  currency_code: string;
  total_amount: number | string;
  draft_amount: number | string;
  pending_amount: number | string;
  approved_amount: number | string;
  paid_amount: number | string;
  void_amount: number | string;
  expense_count: number;
};

export type ExpenseSummary = {
  totals_by_currency: ExpenseCurrencySummary[];
  pending_approval_count: number;
  active_vendor_count: number;
};

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  draft: 'Borrador',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobado',
  paid: 'Pagado',
  void: 'Anulado',
};

export const expenseEventLabels: Record<ExpenseEvent['event_type'], string> = {
  created: 'Gasto creado',
  updated: 'Información actualizada',
  submitted: 'Enviado para aprobación',
  approved: 'Gasto aprobado',
  paid: 'Marcado como pagado',
  voided: 'Gasto anulado',
};

export function formatMoney(value: string | number, currencyCode: string) {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatExpenseDate(value: string | null) {
  if (!value) return 'Sin fecha';
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(normalized));
}

export function filterExpenses(
  expenses: ExpenseRecord[],
  filters: { query: string; status: string; currency: string },
) {
  const query = filters.query.trim().toLocaleLowerCase('es');
  return expenses.filter((expense) => {
    if (filters.status && expense.status !== filters.status) return false;
    if (filters.currency && expense.currency_code !== filters.currency) return false;
    if (!query) return true;
    return [expense.description, expense.invoice_number, expense.payment_reference]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase('es').includes(query));
  });
}

export function getExpenseStatusCounts(expenses: ExpenseRecord[]) {
  return expenses.reduce<Record<ExpenseStatus, number>>(
    (counts, expense) => ({ ...counts, [expense.status]: counts[expense.status] + 1 }),
    { draft: 0, pending_approval: 0, approved: 0, paid: 0, void: 0 },
  );
}

export function nextExpenseActions(status: ExpenseStatus) {
  if (status === 'draft') return ['submit', 'void'] as const;
  if (status === 'pending_approval') return ['approve', 'void'] as const;
  if (status === 'approved') return ['mark-paid', 'void'] as const;
  return [] as const;
}