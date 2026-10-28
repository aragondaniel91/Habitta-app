const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mirrors the review-queue statuses the API will actually accept (payment-review-query.ts). */
export const PAYMENTS_DEEP_LINK_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'correction_requested',
] as const;
export type PaymentsDeepLinkStatus = (typeof PAYMENTS_DEEP_LINK_STATUSES)[number];

export const RECEIVABLES_DEEP_LINK_DUE = ['overdue', 'upcoming', 'without_due_date'] as const;
export type ReceivablesDeepLinkDue = (typeof RECEIVABLES_DEEP_LINK_DUE)[number];

export const RECEIVABLES_DEEP_LINK_STATUSES = [
  'open',
  'partially_paid',
  'settled',
  'reversed',
] as const;
export type ReceivablesDeepLinkStatus = (typeof RECEIVABLES_DEEP_LINK_STATUSES)[number];

export type PaymentsDeepLinkFilter = {
  status?: PaymentsDeepLinkStatus | undefined;
  currencyCode?: string | undefined;
};

export type ReceivablesDeepLinkFilter = {
  status?: ReceivablesDeepLinkStatus | undefined;
  currencyCode?: string | undefined;
  due?: ReceivablesDeepLinkDue | undefined;
  unitId?: string | undefined;
};

const CURRENCY = /^[A-Z]{3}$/;

/**
 * Deep links are navigation hints, not access tokens: the destination page always re-applies
 * these as client-side filters over data the server has already scoped to the caller's role.
 */
export function paymentsDeepLinkSearch(filter: PaymentsDeepLinkFilter): string {
  const params = new URLSearchParams();
  if (filter.status && PAYMENTS_DEEP_LINK_STATUSES.includes(filter.status)) {
    params.set('status', filter.status);
  }
  if (filter.currencyCode && CURRENCY.test(filter.currencyCode)) {
    params.set('currency', filter.currencyCode);
  }
  return params.toString();
}

export function receivablesDeepLinkSearch(filter: ReceivablesDeepLinkFilter): string {
  const params = new URLSearchParams();
  if (filter.status && RECEIVABLES_DEEP_LINK_STATUSES.includes(filter.status)) {
    params.set('status', filter.status);
  }
  if (filter.currencyCode && CURRENCY.test(filter.currencyCode)) {
    params.set('currency', filter.currencyCode);
  }
  if (filter.due && RECEIVABLES_DEEP_LINK_DUE.includes(filter.due)) {
    params.set('due', filter.due);
  }
  if (filter.unitId && UUID.test(filter.unitId)) {
    params.set('unit', filter.unitId);
  }
  return params.toString();
}

export function readPaymentsDeepLink(search: string): PaymentsDeepLinkFilter {
  const params = new URLSearchParams(search);
  const statusValues = params.getAll('status');
  const currencyValues = params.getAll('currency');
  const status =
    statusValues.length === 1 &&
    PAYMENTS_DEEP_LINK_STATUSES.includes(statusValues[0] as PaymentsDeepLinkStatus)
      ? (statusValues[0] as PaymentsDeepLinkStatus)
      : undefined;
  const currencyCode =
    currencyValues.length === 1 && CURRENCY.test(currencyValues[0] ?? '')
      ? currencyValues[0]
      : undefined;
  return { status, currencyCode };
}

export function readReceivablesDeepLink(search: string): ReceivablesDeepLinkFilter {
  const params = new URLSearchParams(search);
  const statusValues = params.getAll('status');
  const currencyValues = params.getAll('currency');
  const dueValues = params.getAll('due');
  const unitValues = params.getAll('unit');
  const status =
    statusValues.length === 1 &&
    RECEIVABLES_DEEP_LINK_STATUSES.includes(statusValues[0] as ReceivablesDeepLinkStatus)
      ? (statusValues[0] as ReceivablesDeepLinkStatus)
      : undefined;
  const currencyCode =
    currencyValues.length === 1 && CURRENCY.test(currencyValues[0] ?? '')
      ? currencyValues[0]
      : undefined;
  const due =
    dueValues.length === 1 &&
    RECEIVABLES_DEEP_LINK_DUE.includes(dueValues[0] as ReceivablesDeepLinkDue)
      ? (dueValues[0] as ReceivablesDeepLinkDue)
      : undefined;
  const unitId =
    unitValues.length === 1 && UUID.test(unitValues[0] ?? '') ? unitValues[0] : undefined;
  return { status, currencyCode, due, unitId };
}

/**
 * A dashboard deep link is an entry action, not a permanent filter preference. Strip the
 * consumed keys once applied so closing/clearing the filter in the destination page and
 * refreshing cannot resurrect a stale dashboard selection, mirroring consumeDirectoryDetailHint.
 */
export function consumeDeepLinkParams(keys: readonly string[]): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
