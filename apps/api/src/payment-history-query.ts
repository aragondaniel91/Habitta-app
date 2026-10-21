import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';

// Never interpolate arbitrary column names, ordering or PostgREST expressions.
// All URL values are constrained before construction; RLS is enforced upstream
// using the authenticated caller's JWT, not the Supabase service role.
const statuses = [
  'draft',
  'submitted',
  'under_review',
  'correction_requested',
  'approved',
  'rejected',
  'reversed',
] as const;
const schema = z.object({
  unitId: uuidSchema.optional(),
  methodId: uuidSchema.optional(),
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  status: z.enum(statuses).optional(),
  statusGroup: z.enum(['pending', 'attention', 'approved', 'reversed']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  // Restrict PostgREST reserved syntax and wildcard operators, while keeping
  // names, spaces, accents, dotted/slash-separated references and hyphens searchable.
  search: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[\p{L}\p{N} _.'/-]+$/u)
    .optional(),
  sortBy: z.enum(['date', 'unit', 'payer', 'method', 'status', 'amount']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type HistoryQuery = z.infer<typeof schema>;

const groupStatuses: Record<NonNullable<HistoryQuery['statusGroup']>, string> = {
  pending: 'in.(submitted,under_review)',
  attention: 'in.(draft,correction_requested)',
  approved: 'eq.approved',
  reversed: 'eq.reversed',
};

const nativeColumns = {
  date: 'payment_date',
  payer: 'payer_name',
  status: 'status',
  amount: 'original_amount',
} as const;

export function buildPaymentHistoryFilters(
  input: Record<string, string | undefined>,
): { ok: true; filter: string; order: string; select: string } | { ok: false; error: string } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid payment history filter' };
  const p = parsed.data;
  if (p.dateFrom && p.dateTo && p.dateFrom > p.dateTo)
    return { ok: false, error: 'dateFrom must be on or before dateTo' };
  if (p.status && p.statusGroup) return { ok: false, error: 'Choose either status or statusGroup' };
  if (p.sortDir && !p.sortBy) return { ok: false, error: 'sortDir requires sortBy' };

  const f: string[] = [];
  if (p.unitId) f.push('unit_id=eq.' + p.unitId);
  if (p.methodId) f.push('payment_method_id=eq.' + p.methodId);
  if (p.currencyCode) f.push('original_currency_code=eq.' + p.currencyCode);
  if (p.status) f.push('status=eq.' + p.status);
  if (p.statusGroup) f.push('status=' + groupStatuses[p.statusGroup]);
  if (p.dateFrom) f.push('payment_date=gte.' + p.dateFrom);
  if (p.dateTo) f.push('payment_date=lte.' + p.dateTo);
  if (p.search) {
    // Parentheses and commas cannot enter the PostgREST OR grammar.
    // Quoted fragments containing punctuation are deliberately not accepted.
    const term = encodeURIComponent(p.search).replace(/'/g, '%27');
    f.push(`or=(payer_name.ilike.*${term}*,reference.ilike.*${term}*)`);
  }

  const direction = p.sortDir ?? 'desc';
  let order = 'created_at.desc,id.desc';
  let select = '*';
  if (p.sortBy === 'unit') {
    select = '*,units(code)';
    order = `units(code).${direction},id.${direction}`;
  } else if (p.sortBy === 'method') {
    select = '*,condominium_payment_methods(display_name)';
    order = `condominium_payment_methods(display_name).${direction},id.${direction}`;
  } else if (p.sortBy) {
    order = `${nativeColumns[p.sortBy]}.${direction},id.${direction}`;
  }
  return { ok: true, filter: f.length ? '&' + f.join('&') : '', order, select };
}
