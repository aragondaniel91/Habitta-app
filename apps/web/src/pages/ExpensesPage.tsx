import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Dialog, DialogBody, DialogFooter } from '../components/Dialog';
import { CheckCircleIcon, ExpensesIcon, FeesIcon, PaymentsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { Drawer } from '../components/Drawer';
import { PageHeader } from '../components/PageHeader';
import { ExpenseCaptureDrawer } from '../features/expenses/ExpenseCaptureDrawer';
import { ExpenseCategoryManager } from '../features/expenses/ExpenseCategoryManager';
import { VendorDirectoryDrawer } from '../features/expenses/VendorDirectoryDrawer';
import { PrivateDocumentUploader } from '../features/documents/PrivateDocumentUploader';
import { downloadPrivateDocument } from '../features/documents/api';
import { apiRequest } from '../lib/api';
import {
  expenseEventLabels,
  expenseStatusLabels,
  filterExpenses,
  formatExpenseDate,
  formatMoney,
  getExpenseStatusCounts,
  nextExpenseActions,
} from '../lib/expenses';
import type {
  ExpenseAttachment,
  ExpenseCategory,
  ExpenseEvent,
  ExpenseRecord,
  ExpenseStatus,
  ExpenseSummary,
  ExpenseVendor,
} from '../lib/expenses';
import '../expenses.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type WorkspaceData = {
  expenses: ExpenseRecord[];
  categories: ExpenseCategory[];
  vendors: ExpenseVendor[];
  summary: ExpenseSummary;
};

type TreasuryAccount = {
  id: string;
  name: string;
  currency_code: string;
  is_active: boolean;
};

type Drawer = 'create' | 'edit' | 'detail' | 'catalogs' | 'vendors' | null;

const emptySummary: ExpenseSummary = {
  totals_by_currency: [],
  pending_approval_count: 0,
  active_vendor_count: 0,
};

const statusTone = (status: ExpenseStatus) => {
  if (status === 'paid') return 'success' as const;
  if (status === 'pending_approval') return 'warning' as const;
  if (status === 'void') return 'neutral' as const;
  return 'info' as const;
};

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
  onClick,
  selected = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
  onClick?: () => void;
  selected?: boolean;
}) {
  const content = (
    <>
      <div className="expenses-metric__top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        aria-pressed={selected}
        className="expenses-metric expenses-metric--interactive surface"
        data-tone={tone}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <Surface className="expenses-metric" data-tone={tone}>
      {content}
    </Surface>
  );
}

const lifecycleRows: Array<{
  status: Exclude<ExpenseStatus, 'void'>;
  label: string;
  amountKey: 'draft_amount' | 'pending_amount' | 'approved_amount' | 'paid_amount';
  detail: string;
  icon: ReactNode;
  tone: 'blue' | 'green' | 'navy' | 'red';
}> = [
  {
    status: 'draft',
    label: 'Borradores',
    amountKey: 'draft_amount',
    detail: 'En preparación. No son obligaciones.',
    icon: <FeesIcon size={20} />,
    tone: 'blue',
  },
  {
    status: 'pending_approval',
    label: 'Pendientes de aprobación',
    amountKey: 'pending_amount',
    detail: 'Esperan revisión de un administrador autorizado.',
    icon: <CheckCircleIcon size={20} />,
    tone: 'red',
  },
  {
    status: 'approved',
    label: 'Aprobados pendientes de pago',
    amountKey: 'approved_amount',
    detail: 'Obligaciones aprobadas; aún no se marcan como pagadas.',
    icon: <ExpensesIcon size={20} />,
    tone: 'navy',
  },
  {
    status: 'paid',
    label: 'Pagados',
    amountKey: 'paid_amount',
    detail: 'Marcados como pagados. No sustituyen la evidencia de tesorería.',
    icon: <PaymentsIcon size={20} />,
    tone: 'green',
  },
];

export function ExpenseFinancialSummary({
  expenses,
  summary,
  activeStatus,
  onStatusSelect,
}: {
  expenses: ExpenseRecord[];
  summary: ExpenseSummary;
  activeStatus: string;
  onStatusSelect: (status: ExpenseStatus) => void;
}) {
  const counts = getExpenseStatusCounts(expenses);

  return (
    <section
      aria-labelledby="expenses-financial-summary-title"
      className="expenses-financial-summary"
    >
      <div className="expenses-financial-summary__heading">
        <div>
          <h2 id="expenses-financial-summary-title">Estado financiero de gastos</h2>
          <p>
            Los importes se presentan por moneda y etapa; no se convierten ni se suman entre
            monedas.
          </p>
        </div>
        <span>{expenses.length} registros en el condominio</span>
      </div>
      <div className="expenses-metrics-grid">
        {lifecycleRows.map((row) => (
          <MetricCard
            detail={row.detail}
            icon={row.icon}
            key={row.status}
            label={row.label}
            onClick={() => onStatusSelect(row.status)}
            selected={activeStatus === row.status}
            tone={row.tone}
            value={String(counts[row.status])}
          />
        ))}
      </div>
      <Surface className="expenses-lifecycle-summary">
        <div className="expenses-lifecycle-summary__intro">
          <strong>Importes por estado y moneda</strong>
          <span>
            Estos importes corresponden a todos los gastos a los que tienes acceso, incluso si
            filtras la lista.
          </span>
        </div>
        {summary.totals_by_currency.length ? (
          <div className="expenses-lifecycle-summary__table-wrap">
            <table>
              <caption className="sr-only">Importes de gastos por estado y moneda</caption>
              <thead>
                <tr>
                  <th scope="col">Moneda</th>
                  {lifecycleRows.map((row) => (
                    <th key={row.status} scope="col">
                      {row.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.totals_by_currency.map((currency) => (
                  <tr key={currency.currency_code}>
                    <th scope="row">{currency.currency_code}</th>
                    {lifecycleRows.map((row) => (
                      <td key={row.status}>
                        {formatMoney(currency[row.amountKey], currency.currency_code)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="expenses-lifecycle-summary__empty">
            No hay importes registrados para resumir todavía.
          </p>
        )}
      </Surface>
    </section>
  );
}

function DrawerShell({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Drawer eyebrow={eyebrow} onClose={onClose} prefix="expenses" title={title} wide={wide}>
      {children}
    </Drawer>
  );
}

function ExpensesLoading() {
  return (
    <div aria-label="Cargando gastos" className="expenses-page">
      <PageHeader eyebrow="Operación financiera" title="Gastos" />
      <div className="expenses-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="expenses-table-skeleton" />
    </div>
  );
}

function CatalogsPanel({
  condominiumId,
  session,
  categories,
  expenses,
  onChanged,
  onOpenDirectory,
}: {
  condominiumId: string;
  session: Session;
  categories: ExpenseCategory[];
  expenses: ExpenseRecord[];
  onChanged: () => void;
  onOpenDirectory: () => void;
}) {
  return (
    <div className="expenses-catalogs">
      <ExpenseCategoryManager
        categories={categories}
        condominiumId={condominiumId}
        expenseCounts={expenses.reduce<Record<string, number>>(
          (counts, expense) => ({
            ...counts,
            [expense.category_id]: (counts[expense.category_id] ?? 0) + 1,
          }),
          {},
        )}
        onChanged={onChanged}
        onOpenDirectory={onOpenDirectory}
        session={session}
      />
    </div>
  );
}

export function ExpensesPage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [events, setEvents] = useState<ExpenseEvent[]>([]);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccount[]>([]);
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [filters, setFilters] = useState({ query: '', status: '', currency: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [expenses, categories, vendors, summary] = await Promise.all([
        apiRequest<ExpenseRecord[]>(`/v1/condominiums/${condominiumId}/expenses`, session),
        apiRequest<ExpenseCategory[]>(
          `/v1/condominiums/${condominiumId}/expense-categories`,
          session,
        ),
        apiRequest<ExpenseVendor[]>(`/v1/condominiums/${condominiumId}/vendors`, session),
        apiRequest<ExpenseSummary>(
          `/v1/condominiums/${condominiumId}/expenses/summary`,
          session,
        ).catch(() => emptySummary),
      ]);
      setData({ expenses, categories, vendors, summary });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudieron cargar los gastos.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDrawer(null);
    setSelectedExpenseId('');
    setAttachments([]);
    setTreasuryAccounts([]);
    setTreasuryAccountId('');
    setVoidDialogOpen(false);
    setVoidReason('');
    setFilters({ query: '', status: '', currency: '' });
  }, [condominiumId]);

  const selectedExpense = data?.expenses.find((expense) => expense.id === selectedExpenseId);
  const filteredExpenses = useMemo(
    () => filterExpenses(data?.expenses ?? [], filters),
    [data?.expenses, filters],
  );
  const currencies = useMemo(
    () => [...new Set((data?.expenses ?? []).map((expense) => expense.currency_code))].sort(),
    [data?.expenses],
  );

  const latestAttachmentsRequest = useRef(0);

  const loadExpenseDocuments = useCallback(
    async (expenseId: string) => {
      const requestId = ++latestAttachmentsRequest.current;
      try {
        const attachmentRows = await apiRequest<ExpenseAttachment[]>(
          `/v1/condominiums/${condominiumId}/expenses/${expenseId}/attachments`,
          session,
        );
        if (requestId !== latestAttachmentsRequest.current) return;
        setAttachments(attachmentRows);
      } catch {
        if (requestId !== latestAttachmentsRequest.current) return;
        setAttachments([]);
      }
    },
    [condominiumId, session],
  );

  const latestDetailRequest = useRef(0);

  const openDetail = async (expense: ExpenseRecord) => {
    const requestId = ++latestDetailRequest.current;
    setSelectedExpenseId(expense.id);
    setDrawer('detail');
    // Clear the previous expense's events/attachments immediately so its detail panel never
    // shows another expense's history while the new one is loading.
    setEvents([]);
    setAttachments([]);
    setTreasuryAccounts([]);
    setTreasuryAccountId(expense.treasury_account_id ?? '');
    const [eventsResult, , treasuryAccountsResult] = await Promise.allSettled([
      apiRequest<ExpenseEvent[]>(
        `/v1/condominiums/${condominiumId}/expenses/${expense.id}/events`,
        session,
      ),
      loadExpenseDocuments(expense.id),
      expense.status === 'approved'
        ? apiRequest<TreasuryAccount[]>(
            `/v1/condominiums/${condominiumId}/treasury/accounts`,
            session,
          )
        : Promise.resolve([]),
    ]);
    // A newer openDetail call may have started (and even finished) while this one was pending --
    // e.g. the user clicked a second expense before the first request settled. Discard this
    // response so it cannot clobber the newer selection with stale events.
    if (requestId !== latestDetailRequest.current) return;
    setEvents(eventsResult.status === 'fulfilled' ? eventsResult.value : []);
    setTreasuryAccounts(
      treasuryAccountsResult.status === 'fulfilled'
        ? treasuryAccountsResult.value.filter(
            (account) => account.is_active && account.currency_code === expense.currency_code,
          )
        : [],
    );
  };

  const selectTreasuryAccount = async () => {
    if (!selectedExpense || !treasuryAccountId) return;
    setTransitioning(true);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/treasury/expenses/${selectedExpense.id}/account`,
        session,
        { method: 'POST', body: JSON.stringify({ accountId: treasuryAccountId }) },
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo seleccionar la cuenta de tesorería.',
      );
    } finally {
      setTransitioning(false);
    }
  };

  const transition = async (action: string, reason?: string) => {
    if (!selectedExpense) return;
    setTransitioning(true);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/expenses/${selectedExpense.id}/${action}`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ expectedVersion: selectedExpense.version, reason }),
        },
      );
      await load();
      setVoidDialogOpen(false);
      setVoidReason('');
      setDrawer(null);
      setSelectedExpenseId('');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cambiar el estado.',
      );
    } finally {
      setTransitioning(false);
    }
  };

  if (loading && !data) return <ExpensesLoading />;

  if (!data) {
    return (
      <Surface>
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir el módulo de gastos.'}
          icon={<ExpensesIcon size={28} />}
          onAction={() => void load()}
          title="Gastos no disponibles"
        />
      </Surface>
    );
  }

  return (
    <>
      <div className="expenses-page">
        <PageHeader
          actions={
            <>
              <Button onClick={() => setDrawer('catalogs')} size="sm" variant="secondary">
                Categorías
              </Button>
              <Button onClick={() => setDrawer('vendors')} size="sm" variant="secondary">
                Directorio de proveedores
              </Button>
              <Button onClick={() => setDrawer('create')} size="sm">
                Registrar gasto
              </Button>
            </>
          }
          description={`${condominiumName} · egresos, proveedores, soportes y aprobaciones con trazabilidad.`}
          eyebrow="Operación financiera"
          title="Gastos"
        />

        {error ? <div className="expenses-inline-alert">{error}</div> : null}

        <ExpenseFinancialSummary
          activeStatus={filters.status}
          expenses={data.expenses}
          onStatusSelect={(status) =>
            setFilters((current) => ({
              ...current,
              status: current.status === status ? '' : status,
            }))
          }
          summary={data.summary}
        />

        <Surface className="expenses-workspace">
          <div className="expenses-toolbar">
            <input
              aria-label="Buscar gastos"
              className="input expenses-search"
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Buscar descripción, factura o referencia…"
              value={filters.query}
            />
            <Select
              aria-label="Filtrar por estado"
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
              value={filters.status}
            >
              <option value="">Todos los estados</option>
              {Object.entries(expenseStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por moneda"
              onChange={(event) =>
                setFilters((current) => ({ ...current, currency: event.target.value }))
              }
              value={filters.currency}
            >
              <option value="">Todas las monedas</option>
              {currencies.map((currencyCode) => (
                <option key={currencyCode} value={currencyCode}>
                  {currencyCode}
                </option>
              ))}
            </Select>
          </div>

          {filteredExpenses.length ? (
            <div className="expenses-table-wrap">
              <table className="expenses-table">
                <thead>
                  <tr>
                    <th>Gasto</th>
                    <th>Categoría</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => {
                    const category = data.categories.find(
                      (item) => item.id === expense.category_id,
                    );
                    const vendor = data.vendors.find((item) => item.id === expense.vendor_id);
                    return (
                      <tr key={expense.id} onClick={() => void openDetail(expense)}>
                        <td>
                          <strong>{expense.description}</strong>
                          <span>{vendor?.name ?? expense.invoice_number ?? 'Sin proveedor'}</span>
                        </td>
                        <td>{category?.name ?? 'Sin categoría'}</td>
                        <td>{formatExpenseDate(expense.expense_date)}</td>
                        <td>
                          <Badge tone={statusTone(expense.status)}>
                            {expenseStatusLabels[expense.status]}
                          </Badge>
                        </td>
                        <td>
                          <strong>{formatMoney(expense.amount, expense.currency_code)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              actionLabel="Registrar gasto"
              description="Crea el primer egreso o ajusta los filtros actuales."
              icon={<FeesIcon size={27} />}
              onAction={() => setDrawer('create')}
              title="No hay gastos para mostrar"
            />
          )}
        </Surface>

        {drawer === 'create' ? (
          <ExpenseCaptureDrawer
            categories={data.categories}
            condominiumId={condominiumId}
            onClose={() => setDrawer(null)}
            onComplete={async () => {
              await load();
              setDrawer(null);
            }}
            onDraftCreated={load}
            session={session}
            vendors={data.vendors}
          />
        ) : null}

        {drawer === 'edit' && selectedExpense?.status === 'draft' ? (
          <ExpenseCaptureDrawer
            categories={data.categories}
            condominiumId={condominiumId}
            expense={selectedExpense}
            onClose={() => setDrawer(null)}
            onComplete={async () => {
              await load();
              setDrawer(null);
              setSelectedExpenseId('');
            }}
            onDraftCreated={load}
            session={session}
            vendors={data.vendors}
          />
        ) : null}

        {drawer === 'catalogs' ? (
          <DrawerShell
            eyebrow="Configuración operativa"
            onClose={() => setDrawer(null)}
            title="Categorías de gastos"
          >
            <CatalogsPanel
              categories={data.categories}
              condominiumId={condominiumId}
              expenses={data.expenses}
              onChanged={() => void load()}
              onOpenDirectory={() => setDrawer('vendors')}
              session={session}
            />
          </DrawerShell>
        ) : null}

        {drawer === 'vendors' ? (
          <VendorDirectoryDrawer
            condominiumId={condominiumId}
            onChanged={load}
            onClose={() => setDrawer(null)}
            session={session}
            vendors={data.vendors}
          />
        ) : null}

        {drawer === 'detail' && selectedExpense ? (
          <DrawerShell
            eyebrow="Trazabilidad del egreso"
            onClose={() => setDrawer(null)}
            title={selectedExpense.description}
            wide
          >
            <div className="expenses-detail">
              <div className="expenses-detail__amount">
                <div className="expenses-detail__amount-copy">
                  <small>Monto registrado</small>
                  <strong>
                    {formatMoney(selectedExpense.amount, selectedExpense.currency_code)}
                  </strong>
                </div>
                <Badge tone={statusTone(selectedExpense.status)}>
                  {expenseStatusLabels[selectedExpense.status]}
                </Badge>
              </div>
              <dl className="expenses-detail-list">
                <div>
                  <dt>Fecha</dt>
                  <dd>{formatExpenseDate(selectedExpense.expense_date)}</dd>
                </div>
                <div>
                  <dt>Vencimiento</dt>
                  <dd>{formatExpenseDate(selectedExpense.due_date)}</dd>
                </div>
                <div>
                  <dt>Categoría</dt>
                  <dd>
                    {data.categories.find((item) => item.id === selectedExpense.category_id)
                      ?.name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt>Proveedor</dt>
                  <dd>
                    {data.vendors.find((item) => item.id === selectedExpense.vendor_id)?.name ??
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt>Factura</dt>
                  <dd>{selectedExpense.invoice_number ?? '—'}</dd>
                </div>
                <div>
                  <dt>Referencia</dt>
                  <dd>{selectedExpense.payment_reference ?? '—'}</dd>
                </div>
              </dl>
              {selectedExpense.notes ? (
                <p className="expenses-detail__notes">{selectedExpense.notes}</p>
              ) : null}
              {selectedExpense.status === 'approved' && treasuryAccounts.length ? (
                <section className="expenses-treasury-selection">
                  <h3>Cuenta de tesorería</h3>
                  <p>
                    Selecciona la cuenta que registrará la salida al marcar este gasto como pagado.
                  </p>
                  <div>
                    <Select
                      aria-label="Cuenta de tesorería para el gasto"
                      onChange={(event) => setTreasuryAccountId(event.target.value)}
                      value={treasuryAccountId}
                    >
                      <option value="">Selecciona una cuenta</option>
                      {treasuryAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} · {account.currency_code}
                        </option>
                      ))}
                    </Select>
                    <Button
                      disabled={
                        transitioning ||
                        !treasuryAccountId ||
                        treasuryAccountId === selectedExpense.treasury_account_id
                      }
                      onClick={() => void selectTreasuryAccount()}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Guardar cuenta
                    </Button>
                  </div>
                </section>
              ) : null}
              <section className="expenses-documents">
                <h3>Documentos privados</h3>
                {attachments.length ? (
                  <div className="expenses-documents__list">
                    {attachments.map((attachment) => (
                      <div className="private-document-row" key={attachment.id}>
                        <div>
                          <ExpensesIcon size={17} />
                          <span>
                            <strong title={attachment.original_filename}>
                              {attachment.original_filename}
                            </strong>
                            <small>
                              {Math.max(1, Math.ceil(attachment.size_bytes / 1024))} KB ·{' '}
                              {attachment.document_type}
                            </small>
                          </span>
                        </div>
                        <Button
                          onClick={() =>
                            void downloadPrivateDocument(
                              `/v1/condominiums/${condominiumId}/expenses/${selectedExpense.id}/attachments/${attachment.id}/file`,
                              session,
                              attachment.original_filename,
                            ).catch((downloadError: Error) => setError(downloadError.message))
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Descargar
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No hay documentos adjuntos.</p>
                )}
                {selectedExpense.support_url ? (
                  <a
                    className="expenses-support-link"
                    href={selectedExpense.support_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Abrir soporte externo anterior
                  </a>
                ) : null}
                <PrivateDocumentUploader
                  defaultDocumentType="invoice"
                  documentTypes={[
                    { value: 'invoice', label: 'Factura' },
                    { value: 'receipt', label: 'Recibo' },
                    { value: 'quote', label: 'Cotización' },
                    { value: 'support', label: 'Soporte' },
                    { value: 'other', label: 'Otro' },
                  ]}
                  onUploaded={() => loadExpenseDocuments(selectedExpense.id)}
                  path={`/v1/condominiums/${condominiumId}/expenses/${selectedExpense.id}/attachments`}
                  session={session}
                  title="Adjuntar factura o soporte"
                />
              </section>
              <div className="expenses-detail__actions">
                {selectedExpense.status === 'draft' ? (
                  <Button onClick={() => setDrawer('edit')} size="sm" variant="secondary">
                    Editar borrador
                  </Button>
                ) : null}
                {nextExpenseActions(selectedExpense.status).map((action) => (
                  <Button
                    disabled={transitioning}
                    key={action}
                    onClick={() => {
                      if (action === 'void') {
                        setVoidReason('');
                        setVoidDialogOpen(true);
                        return;
                      }
                      void transition(action);
                    }}
                    size="sm"
                    variant={
                      action === 'void' ? 'danger' : action === 'submit' ? 'secondary' : 'primary'
                    }
                  >
                    {action === 'submit'
                      ? 'Enviar a aprobación'
                      : action === 'approve'
                        ? 'Aprobar gasto'
                        : action === 'mark-paid'
                          ? 'Marcar pagado'
                          : 'Anular'}
                  </Button>
                ))}
              </div>
              <section className="expenses-timeline">
                <h3>Historial</h3>
                {events.length ? (
                  events.map((event) => (
                    <article key={event.id}>
                      <span />
                      <div>
                        <strong>{expenseEventLabels[event.event_type]}</strong>
                        <small>{formatExpenseDate(event.occurred_at)}</small>
                      </div>
                    </article>
                  ))
                ) : (
                  <p>No hay eventos adicionales disponibles.</p>
                )}
              </section>
            </div>
          </DrawerShell>
        ) : null}
      </div>

      {voidDialogOpen && selectedExpense ? (
        <Dialog
          closeDisabled={transitioning}
          description={`Vas a anular “${selectedExpense.description}”. El gasto no se eliminará: Habitta conservará su historial y registrará el motivo de la anulación.`}
          eyebrow="Acción financiera sensible"
          onClose={() => {
            if (!transitioning) {
              setVoidDialogOpen(false);
              setVoidReason('');
            }
          }}
          size="sm"
          title="Anular gasto"
        >
          <DialogBody>
            <Field
              hint="El motivo quedará guardado en la trazabilidad financiera."
              label="Motivo de la anulación"
            >
              <textarea
                autoFocus
                maxLength={500}
                onChange={(event) => setVoidReason(event.target.value)}
                required
                rows={4}
                value={voidReason}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={transitioning}
              onClick={() => {
                setVoidDialogOpen(false);
                setVoidReason('');
              }}
              type="button"
              variant="secondary"
            >
              Conservar gasto
            </Button>
            <Button
              disabled={transitioning || !voidReason.trim()}
              onClick={() => void transition('void', voidReason.trim())}
              type="button"
              variant="danger"
            >
              {transitioning ? 'Anulando…' : 'Anular gasto'}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  );
}
