import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, Surface } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { collectAllPages, financialPagePath } from '../../lib/pagination';
import type { PaginatedResponse } from '../../lib/pagination';
import './payment-agreements.css';

type Receivable = {
  id: string;
  unit_id: string;
  currency_code: string;
  outstanding_amount?: string;
  description?: string;
};
type Row = { dueDate: string; amount: string };
type Agreement = {
  id: string;
  unit_id: string;
  legal_obligor_person_id: string;
  currency_code: string;
  status: string;
  initiated_by: 'resident' | 'administrator';
  proposing_actor_kind: 'resident' | 'administrator';
  version: number;
  schedule: { due_date: string; amount: string }[];
  updated_at: string;
  progress: { posted_amount: string; current_source_outstanding: string } | null;
  events: { event_type: string; created_at: string }[];
};
type AgreementFilters = {
  unitId: string;
  personId: string;
  status: string;
  minAmount: string;
  maxAmount: string;
  periodFrom: string;
  periodTo: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
};
type AgreementPage = PaginatedResponse<Agreement>;
const agreementFilterKeys = [
  'unitId',
  'personId',
  'status',
  'minAmount',
  'maxAmount',
  'periodFrom',
  'periodTo',
  'dateFrom',
  'dateTo',
  'sort',
] as const;
const defaultFilters: AgreementFilters = {
  unitId: '',
  personId: '',
  status: '',
  minAmount: '',
  maxAmount: '',
  periodFrom: '',
  periodTo: '',
  dateFrom: '',
  dateTo: '',
  sort: 'updatedAtDesc',
};
const filterUrl = (filters: AgreementFilters, page: number) => {
  const params = new URLSearchParams();
  for (const key of agreementFilterKeys)
    if (filters[key] && filters[key] !== defaultFilters[key]) params.set(key, filters[key]);
  if (page > 1) params.set('agreementPage', String(page));
  return params;
};
const readFilters = (): { filters: AgreementFilters; page: number } => {
  const params = new URLSearchParams(window.location.search);
  const filters = { ...defaultFilters };
  for (const key of agreementFilterKeys) filters[key] = params.get(key) ?? defaultFilters[key];
  const requestedPage = Number(params.get('agreementPage'));
  return {
    filters,
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
};
const agreementPath = (condominiumId: string, filters: AgreementFilters, page: number) => {
  const params = filterUrl(filters, page);
  params.set('page', String(page));
  params.set('pageSize', '25');
  return `/v1/condominiums/${condominiumId}/payment-agreements?${params.toString()}`;
};
const labels: Record<string, string> = {
  pending: 'Pendiente de respuesta',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  proposed: 'Propuesto',
  counterproposed: 'Contraoferta',
};
const iso = (date: Date) => date.toISOString().slice(0, 10);
const cents = (amount: string) => Math.round(Number(amount) * 100);
const money = (value: number) => (value / 100).toFixed(2);
const plus = (date: string, amount: number, unit: 'days' | 'months') => {
  const value = new Date(`${date}T12:00:00`);
  if (unit === 'days') value.setDate(value.getDate() + amount);
  else value.setMonth(value.getMonth() + amount);
  return iso(value);
};

function equalRows(total: string, count: number, first: string, cadence: string): Row[] {
  const whole = cents(total),
    base = Math.floor(whole / count),
    residual = whole - base * count;
  return Array.from({ length: count }, (_, index) => ({
    amount: money(base + (index === count - 1 ? residual : 0)),
    dueDate:
      cadence === 'weekly'
        ? plus(first, index * 7, 'days')
        : cadence === 'biweekly'
          ? plus(first, index * 14, 'days')
          : plus(first, index, 'months'),
  }));
}

function ScheduleBuilder({
  total,
  currency,
  rows,
  setRows,
}: {
  total: string;
  currency: string;
  rows: Row[];
  setRows: (rows: Row[]) => void;
}) {
  const [quantity, setQuantity] = useState(String(Math.max(1, rows.length)));
  const [cadence, setCadence] = useState('monthly');
  const [first, setFirst] = useState(rows[0]?.dueDate ?? iso(new Date()));
  const target = cents(total),
    allocated = rows.reduce((sum, row) => sum + cents(row.amount), 0);
  const update = (index: number, field: keyof Row, value: string) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  return (
    <div className="payment-agreements-builder">
      <div className="payment-agreements-builder__controls">
        <label>
          Cuotas
          <input
            max="60"
            min="1"
            onChange={(e) => setQuantity(e.target.value)}
            type="number"
            value={quantity}
          />
        </label>
        <label>
          Frecuencia
          <select onChange={(e) => setCadence(e.target.value)} value={cadence}>
            <option value="monthly">Mensual</option>
            <option value="biweekly">Quincenal</option>
            <option value="weekly">Semanal</option>
            <option value="custom">Fechas personalizadas</option>
          </select>
        </label>
        <label>
          Primera fecha
          <input onChange={(e) => setFirst(e.target.value)} type="date" value={first} />
        </label>
        <Button
          onClick={() =>
            setRows(
              equalRows(total, Math.max(1, Math.min(60, Number(quantity) || 1)), first, cadence),
            )
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          Distribuir en partes iguales
        </Button>
      </div>
      <div className="payment-agreements-builder__summary">
        <span>
          {rows.length} cuota{rows.length === 1 ? '' : 's'}
        </span>
        <strong data-invalid={allocated !== target || undefined}>
          Programado: {currency} {money(allocated)} / {money(target)}
        </strong>
      </div>
      <div className="payment-agreements-builder__rows">
        {rows.map((row, index) => (
          <div key={`${index}-${row.dueDate}`}>
            <span>{index + 1}</span>
            <input
              aria-label={`Monto cuota ${index + 1}`}
              inputMode="decimal"
              onChange={(e) => update(index, 'amount', e.target.value)}
              value={row.amount}
            />
            <input
              aria-label={`Fecha cuota ${index + 1}`}
              onChange={(e) => update(index, 'dueDate', e.target.value)}
              type="date"
              value={row.dueDate}
            />
            <button
              aria-label={`Eliminar cuota ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <Button
        disabled={rows.length >= 60}
        onClick={() =>
          setRows([...rows, { amount: '0.00', dueDate: plus(first, rows.length, 'months') }])
        }
        size="sm"
        type="button"
        variant="ghost"
      >
        Agregar cuota personalizada
      </Button>
    </div>
  );
}

export function PaymentAgreementsPanel({
  condominiumId,
  session,
  canManage,
  unitLabel,
}: {
  condominiumId: string;
  session: Session;
  canManage: boolean;
  unitLabel?: (unitId: string) => string;
}) {
  const initial = readFilters();
  const [items, setItems] = useState<Agreement[]>([]),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(''),
    [rows, setRows] = useState<Row[]>([{ amount: '', dueDate: iso(new Date()) }]),
    [draftFilters, setDraftFilters] = useState<AgreementFilters>(initial.filters),
    [filters, setFilters] = useState<AgreementFilters>(initial.filters),
    [page, setPage] = useState(initial.page),
    [pageInfo, setPageInfo] = useState<AgreementPage>({
      items: [],
      page: initial.page,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: initial.page > 1,
    }),
    [loading, setLoading] = useState(true),
    [detail, setDetail] = useState<Agreement | null>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loadingReceivables, setLoadingReceivables] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<AgreementPage | Agreement[]>(
        agreementPath(condominiumId, filters, page),
        session,
      );
      const normalized = Array.isArray(result)
        ? {
            items: result,
            page: 1,
            pageSize: result.length || 25,
            total: result.length,
            totalPages: result.length ? 1 : 0,
            hasNextPage: false,
            hasPreviousPage: false,
          }
        : result;
      setItems(normalized.items);
      setPageInfo(normalized);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los acuerdos.');
    } finally {
      setLoading(false);
    }
  }, [condominiumId, filters, page, session]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const next = filterUrl(filters, page);
    for (const key of agreementFilterKeys) url.searchParams.delete(key);
    url.searchParams.delete('agreementPage');
    next.forEach((value, key) => url.searchParams.set(key, value));
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [filters, page]);
  useEffect(() => {
    let active = true;
    void collectAllPages((page) =>
      apiRequest<PaginatedResponse<Receivable>>(
        financialPagePath(`/v1/condominiums/${condominiumId}/receivables`, page, 100),
        session,
      ),
    )
      .then((allReceivables) => {
        if (active) setReceivables(allReceivables);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los cargos elegibles.');
      })
      .finally(() => {
        if (active) setLoadingReceivables(false);
      });
    return () => {
      active = false;
    };
  }, [condominiumId, session]);
  const candidates = useMemo(
    () => receivables.filter((item) => Number(item.outstanding_amount ?? 0) > 0),
    [receivables],
  );
  const debt = candidates.find((item) => item.id === selected);
  const target = debt?.outstanding_amount ?? '';
  const valid = (total: string) =>
    rows.length > 0 &&
    rows.every((row) => row.amount && row.dueDate) &&
    rows.every((row, index) => index === 0 || row.dueDate > (rows[index - 1]?.dueDate ?? '')) &&
    rows.reduce((sum, row) => sum + cents(row.amount), 0) === cents(total);
  const updateFilter = (key: keyof AgreementFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };
  const applyFilters = () => {
    setFilters(draftFilters);
    setPage(1);
  };
  const resetFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setPage(1);
  };
  const propose = async () => {
    if (!debt || !valid(target)) return;
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/payment-agreements`, session, {
        method: 'POST',
        body: JSON.stringify({
          unitId: debt.unit_id,
          currencyCode: debt.currency_code,
          receivableItemIds: [debt.id],
          installments: rows.map((row) => ({ ...row, currencyCode: debt.currency_code })),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setSelected('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo proponer el plan.');
    }
  };
  const transition = async (
    agreement: Agreement,
    action: 'accept' | 'reject' | 'cancel' | 'counter',
  ) => {
    const outstanding = agreement.progress?.current_source_outstanding ?? '';
    if (action === 'counter' && !valid(outstanding)) {
      setError('Las cuotas deben sumar exactamente el saldo vigente y tener fechas ordenadas.');
      return;
    }
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/payment-agreements/${agreement.id}/transition`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            ...(action === 'counter'
              ? {
                  installments: rows.map((row) => ({
                    ...row,
                    currencyCode: agreement.currency_code,
                  })),
                }
              : {}),
            expectedVersion: agreement.version,
          }),
        },
      );
      setDetail(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el acuerdo.');
    }
  };
  return (
    <section
      aria-label="Espacio de trabajo de acuerdos de pago"
      className="payment-agreements-panel"
      id="payment-agreements-workspace"
    >
      <div className="payment-agreements-panel__heading">
        <div>
          <span>COBRANZA Y SEGUIMIENTO</span>
          <h2>Acuerdos de pago</h2>
          <p>
            Calendarios propuestos para cargos originales. No crean pagos, no modifican la deuda ni
            cambian al obligado legal.
          </p>
        </div>
        <Badge tone="info">
          {items.filter((item) => item.status === 'pending').length} pendientes
        </Badge>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div className="payment-agreements-kpis">
        <Surface>
          <small>Activos</small>
          <strong>
            {items.filter((item) => ['pending', 'accepted'].includes(item.status)).length}
          </strong>
        </Surface>
        <Surface>
          <small>Por responder</small>
          <strong>{items.filter((item) => item.status === 'pending').length}</strong>
        </Surface>
        <Surface>
          <small>Pagos registrados aquí</small>
          <strong>0</strong>
        </Surface>
      </div>
      <Surface className="payment-agreements-create">
        <div>
          <h3>Nuevo convenio</h3>
          <p>
            Selecciona un cargo original elegible y define una propuesta exacta sobre su saldo
            vigente.
          </p>
        </div>
        <label>
          Cargo original
          <select
            disabled={loadingReceivables}
            onChange={(e) => {
              const next = candidates.find((item) => item.id === e.target.value);
              setSelected(e.target.value);
              if (next)
                setRows(equalRows(next.outstanding_amount ?? '0', 1, iso(new Date()), 'monthly'));
            }}
            value={selected}
          >
            <option value="">
              {loadingReceivables ? 'Cargando cargos elegibles…' : 'Selecciona una deuda'}
            </option>
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {unitLabel?.(item.unit_id) ?? item.unit_id} · {item.description ?? 'Cargo'} ·{' '}
                {item.currency_code} {item.outstanding_amount ?? ''}
              </option>
            ))}
          </select>
        </label>
        {debt ? (
          <ScheduleBuilder
            currency={debt.currency_code}
            rows={rows}
            setRows={setRows}
            total={target}
          />
        ) : null}
        <Button disabled={!debt || !valid(target)} onClick={() => void propose()}>
          Enviar propuesta
        </Button>
      </Surface>
      <Surface className="payment-agreements-filters">
        <div>
          <h3>Filtrar convenios</h3>
          <p id="agreement-filter-help">
            Los filtros se aplican a los convenios que ya puede consultar.
          </p>
        </div>
        <div className="payment-agreements-filters__grid" aria-describedby="agreement-filter-help">
          <label>
            Unidad (ID)
            <input
              aria-label="Unidad"
              onChange={(event) => updateFilter('unitId', event.target.value)}
              placeholder="UUID de unidad"
              value={draftFilters.unitId}
            />
          </label>
          <label>
            Persona responsable (ID)
            <input
              aria-label="Persona responsable"
              onChange={(event) => updateFilter('personId', event.target.value)}
              placeholder="UUID de persona"
              value={draftFilters.personId}
            />
          </label>
          <label>
            Estado
            <select
              aria-label="Estado"
              onChange={(event) => updateFilter('status', event.target.value)}
              value={draftFilters.status}
            >
              <option value="">Todos</option>
              {Object.entries(labels)
                .filter(([value]) =>
                  ['pending', 'accepted', 'rejected', 'cancelled'].includes(value),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Importe mínimo
            <input
              aria-label="Importe mínimo"
              min="0"
              onChange={(event) => updateFilter('minAmount', event.target.value)}
              step="0.01"
              type="number"
              value={draftFilters.minAmount}
            />
          </label>
          <label>
            Importe máximo
            <input
              aria-label="Importe máximo"
              min="0"
              onChange={(event) => updateFilter('maxAmount', event.target.value)}
              step="0.01"
              type="number"
              value={draftFilters.maxAmount}
            />
          </label>
          <label>
            Período desde
            <input
              aria-label="Período desde"
              onChange={(event) => updateFilter('periodFrom', event.target.value)}
              type="date"
              value={draftFilters.periodFrom}
            />
          </label>
          <label>
            Período hasta
            <input
              aria-label="Período hasta"
              onChange={(event) => updateFilter('periodTo', event.target.value)}
              type="date"
              value={draftFilters.periodTo}
            />
          </label>
          <label>
            Actualizado desde
            <input
              aria-label="Actualizado desde"
              onChange={(event) => updateFilter('dateFrom', event.target.value)}
              type="date"
              value={draftFilters.dateFrom}
            />
          </label>
          <label>
            Actualizado hasta
            <input
              aria-label="Actualizado hasta"
              onChange={(event) => updateFilter('dateTo', event.target.value)}
              type="date"
              value={draftFilters.dateTo}
            />
          </label>
          <label>
            Ordenar por
            <select
              aria-label="Ordenar acuerdos"
              onChange={(event) => updateFilter('sort', event.target.value)}
              value={draftFilters.sort}
            >
              <option value="updatedAtDesc">Actualización: reciente primero</option>
              <option value="updatedAtAsc">Actualización: antigua primero</option>
              <option value="amountDesc">Importe: mayor primero</option>
              <option value="amountAsc">Importe: menor primero</option>
              <option value="periodAsc">Primer vencimiento: próximo primero</option>
              <option value="periodDesc">Primer vencimiento: lejano primero</option>
            </select>
          </label>
        </div>
        <div className="payment-agreements-filters__actions">
          <Button onClick={applyFilters} size="sm" type="button">
            Aplicar filtros
          </Button>
          <Button onClick={resetFilters} size="sm" type="button" variant="secondary">
            Restablecer filtros
          </Button>
        </div>
      </Surface>
      <Surface className="payment-agreements-list">
        <div className="payment-agreements-list__header">
          <span>Unidad</span>
          <span>Calendario</span>
          <span>Saldo real</span>
          <span>Estado</span>
          <span />
        </div>
        {items.map((agreement) => (
          <article key={agreement.id}>
            <strong>{unitLabel?.(agreement.unit_id) ?? agreement.unit_id}</strong>
            <span>
              {agreement.schedule.length} cuota{agreement.schedule.length === 1 ? '' : 's'} ·{' '}
              {agreement.currency_code}
            </span>
            <span>
              Pagado aplicado: {agreement.progress?.posted_amount ?? '0'} · Pendiente:{' '}
              {agreement.progress?.current_source_outstanding ?? '0'}
            </span>
            <Badge tone={agreement.status === 'accepted' ? 'success' : 'info'}>
              {labels[agreement.status] ?? agreement.status}
            </Badge>
            <Button
              onClick={() => {
                setDetail(agreement);
                setRows(
                  agreement.schedule.map((row) => ({ dueDate: row.due_date, amount: row.amount })),
                );
              }}
              size="sm"
              variant="ghost"
            >
              Ver detalle
            </Button>
          </article>
        ))}
        {loading ? (
          <p aria-live="polite" role="status">
            Cargando convenios…
          </p>
        ) : null}
        {!loading && !items.length ? (
          <p role="status">
            No hay convenios que coincidan con los filtros. Ajusta los filtros o restablécelos.
          </p>
        ) : null}
      </Surface>
      <nav aria-label="Paginación de convenios" className="payment-agreements-pagination">
        <span aria-live="polite">
          {pageInfo.total
            ? `Mostrando ${(pageInfo.page - 1) * pageInfo.pageSize + 1}–${Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total)} de ${pageInfo.total}`
            : '0 convenios'}
        </span>
        <Button
          disabled={!pageInfo.hasPreviousPage || loading}
          onClick={() => setPage((current) => current - 1)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Anterior
        </Button>
        <Button
          disabled={!pageInfo.hasNextPage || loading}
          onClick={() => setPage((current) => current + 1)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Siguiente
        </Button>
      </nav>
      {detail ? (
        <Surface className="payment-agreements-detail" role="dialog">
          <div>
            <h3>Convenio · {unitLabel?.(detail.unit_id) ?? detail.unit_id}</h3>
            <Button onClick={() => setDetail(null)} size="sm" variant="ghost">
              Cerrar
            </Button>
          </div>
          <p>
            Obligación original en {detail.currency_code}; responsable legal: propietario
            registrado. Pagado real: {detail.progress?.posted_amount ?? '0'} · Saldo real:{' '}
            {detail.progress?.current_source_outstanding ?? '0'}.
          </p>
          <ol>
            {detail.schedule.map((row) => (
              <li key={`${row.due_date}-${row.amount}`}>
                {row.due_date}: {detail.currency_code} {row.amount}
              </li>
            ))}
          </ol>
          <p>
            Actividad:{' '}
            {detail.events
              .map((event) => labels[event.event_type] ?? event.event_type)
              .join(' · ') || 'Sin movimientos adicionales'}
            .
          </p>
          {detail.status === 'pending' ? (
            <div className="payment-agreements-detail__actions">
              {detail.proposing_actor_kind === (canManage ? 'administrator' : 'resident') ? (
                <Button
                  onClick={() => void transition(detail, 'cancel')}
                  size="sm"
                  variant="secondary"
                >
                  Cancelar propuesta
                </Button>
              ) : (
                <>
                  <Button onClick={() => void transition(detail, 'accept')} size="sm">
                    Aceptar
                  </Button>
                  <Button
                    onClick={() => void transition(detail, 'counter')}
                    size="sm"
                    variant="secondary"
                  >
                    Enviar contraoferta
                  </Button>
                  <Button
                    onClick={() => void transition(detail, 'reject')}
                    size="sm"
                    variant="secondary"
                  >
                    Rechazar
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </Surface>
      ) : null}
    </section>
  );
}
