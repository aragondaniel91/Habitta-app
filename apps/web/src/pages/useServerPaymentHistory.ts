import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Payment } from '../features/payments/types';
import { apiRequest } from '../lib/api';
import type { PaginatedResponse } from '../lib/pagination';

export type MovementQuery = {
  condominiumId: string;
  currency: string;
  page: number;
  unitId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  statusGroup: string;
  methodId: string;
  search: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
};

export function paymentMovementPagePath(query: MovementQuery): string {
  const p = new URLSearchParams({
    page: String(query.page),
    pageSize: '10',
  });
  const params = {
    currencyCode: query.currency,
    unitId: query.unitId,
    methodId: query.methodId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    status: query.status,
    statusGroup: query.statusGroup,
    search: query.search.trim(),
    sortBy: query.sortField,
    sortDir: query.sortDirection,
  };
  for (const [name, value] of Object.entries(params)) if (value) p.set(name, value);
  return `/v1/condominiums/${query.condominiumId}/payments?${p.toString()}`;
}

export function useServerPaymentHistory({
  query,
  session,
  enabled,
  revision,
}: {
  query: MovementQuery;
  session: Session;
  enabled: boolean;
  revision: number;
}) {
  const path = useMemo(
    () => paymentMovementPagePath(query),
    [
      query.condominiumId,
      query.currency,
      query.page,
      query.unitId,
      query.dateFrom,
      query.dateTo,
      query.status,
      query.statusGroup,
      query.methodId,
      query.search,
      query.sortField,
      query.sortDirection,
    ],
  );
  const key = path + '#' + revision;
  const [state, setState] = useState<{
    key: string;
    page: PaginatedResponse<Payment> | null;
    error: string;
  }>({ key: '', page: null, error: '' });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState({ key, page: null, error: '' });
    const timer = setTimeout(
      () => {
        void apiRequest<PaginatedResponse<Payment>>(path, session)
          .then((page) => {
            if (active) setState({ key, page, error: '' });
          })
          .catch((cause: unknown) => {
            if (active)
              setState({
                key,
                page: null,
                error:
                  cause instanceof Error ? cause.message : 'No se pudo consultar el historial.',
              });
          });
      },
      query.search.trim() ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, key, path, query.search, session]);

  const current = state.key === key ? state : null;
  return {
    data: current?.page ?? null,
    error: current?.error ?? '',
    loading: enabled && (!current || (!current.page && !current.error)),
  };
}
