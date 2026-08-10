import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CheckCircleIcon,
  ExpensesIcon,
  FeesIcon,
  PaymentsIcon,
  PeopleIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { PrivateDocumentUploader } from '../features/documents/PrivateDocumentUploader';
import { downloadPrivateDocument } from '../features/documents/api';
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

type Drawer = 'create' | 'detail' | 'catalogs' | null;

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
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
}) {
  return (
    <Surface className="expenses-metric" data-tone={tone}>
      <div className="expenses-metric__top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
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
    <div className="expenses-drawer-layer" role="presentation">
      <button
        aria-label="Cerrar panel"
        className="expenses-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside aria-label={title} className="expenses-drawer" data-wide={wide || undefined}>
        <header className="expenses-drawer__header">
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <Button aria-label="Cerrar" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </header>
        <div className="expenses-drawer__body">{children}</div>
      </aside>
    </div>
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

function CreateExpenseForm({
  condominiumId,
  session,
  categories,
  vendors,
  onCreated,
}: {
  condominiumId: string;
  session: Session;
  categories: ExpenseCategory[];
  vendors: ExpenseVendor[];
  onCreated: (expense: ExpenseRecord) => void;
}) {
  const [categoryId, setCategoryId] = useState(categories.find((item) => item.is_active)?.id ?? '');
  const [vendorId, setVendorId] = useState('');
  const [description, setDescription] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const expense = await apiRequest<ExpenseRecord>(
        `/v1/condominiums/${condominiumId}/expenses`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            categoryId,
            vendorId: vendorId || undefined,
            description,
            invoiceNumber: invoiceNumber || undefined,
            expenseDate,
            dueDate: dueDate || undefined,
            amount,
            currencyCode,
            paymentMethod: paymentMethod || undefined,
            paymentReference: paymentReference || undefined,
            notes: notes || undefined,
          }),
        },
      );
      onCreated(expense);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo registrar el gasto.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="expenses-form" onSubmit={(event) => void submit(event)}>
      {error ? <div className="expenses-inline-alert">{error}</div> : null}
      <Field label="Descripción">
        <input
          className="input"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Ej. Reparación de bomba de agua"
          required
          value={description}
        />
      </Field>
      <div className="expenses-form-grid">
        <Field label="Categoría">
          <Select
            onChange={(event) => setCategoryId(event.target.value)}
            required
            value={categoryId}
          >
            <option value="">Selecciona una categoría</option>
            {categories
              .filter((item) => item.is_active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Proveedor" hint="Opcional">
          <Select onChange={(event) => setVendorId(event.target.value)} value={vendorId}>
            <option value="">Sin proveedor</option>
            {vendors
              .filter((item) => item.is_active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <div className="expenses-form-grid expenses-form-grid--three">
        <Field label="Fecha del gasto">
          <input
            className="input"
            onChange={(event) => setExpenseDate(event.target.value)}
            required
            type="date"
            value={expenseDate}
          />
        </Field>
        <Field label="Fecha de vencimiento" hint="Opcional">
          <input
            className="input"
            min={expenseDate}
            onChange={(event) => setDueDate(event.target.value)}
            type="date"
            value={dueDate}
          />
        </Field>
        <Field label="N.º de factura" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setInvoiceNumber(event.target.value)}
            value={invoiceNumber}
          />
        </Field>
      </div>
      <div className="expenses-form-grid">
        <Field label="Monto">
          <input
            className="input"
            inputMode="decimal"
            min="0.01"
            onChange={(event) => setAmount(event.target.value)}
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </Field>
        <Field label="Moneda">
          <Select onChange={(event) => setCurrencyCode(event.target.value)} value={currencyCode}>
            <option value="USD">USD</option>
            <option value="VES">VES</option>
            <option value="EUR">EUR</option>
          </Select>
        </Field>
      </div>
      <div className="expenses-form-grid">
        <Field label="Método de pago" hint="Puede completarse luego">
          <input
            className="input"
            onChange={(event) => setPaymentMethod(event.target.value)}
            placeholder="Transferencia, efectivo…"
            value={paymentMethod}
          />
        </Field>
        <Field label="Referencia" hint="Opcional">
          <input
            className="input"
            onChange={(event) => setPaymentReference(event.target.value)}
            value={paymentReference}
          />
        </Field>
      </div>
      <Field label="Notas" hint="Opcional">
        <textarea
          className="textarea"
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          value={notes}
        />
      </Field>
      <div className="expenses-form__actions">
        <Button disabled={saving || !categoryId || !description || !amount} type="submit">
          {saving ? 'Guardando…' : 'Crear borrador'}
        </Button>
      </div>
    </form>
  );
}

function CatalogsPanel({
  condominiumId,
  session,
  categories,
  vendors,
  onChanged,
}: {
  condominiumId: string;
  session: Session;
  categories: ExpenseCategory[];
  vendors: ExpenseVendor[];
  onChanged: () => void;
}) {
  const [categoryName, setCategoryName] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const createCategory = async () => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/expense-categories`, session, {
        method: 'POST',
        body: JSON.stringify({
          code: categoryName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''),
          name: categoryName,
        }),
      });
      setCategoryName('');
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear.');
    } finally {
      setSaving(false);
    }
  };

  const createVendor = async () => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/vendors`, session, {
        method: 'POST',
        body: JSON.stringify({ name: vendorName }),
      });
      setVendorName('');
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="expenses-catalogs">
      {error ? <div className="expenses-inline-alert">{error}</div> : null}
      <section>
        <h3>Categorías</h3>
        <p>Clasifican los egresos sin afectar la contabilidad de cuotas o pagos.</p>
        <div className="expenses-catalog-create">
          <input
            className="input"
            onChange={(event) => setCategoryName(event.target.value)}
            placeholder="Nueva categoría"
            value={categoryName}
          />
          <Button
            disabled={saving || categoryName.trim().length < 2}
            onClick={() => void createCategory()}
            size="sm"
            type="button"
          >
            Agregar
          </Button>
        </div>
        <div className="expenses-chip-list">
          {categories.map((category) => (
            <Badge key={category.id} tone={category.is_active ? 'info' : 'neutral'}>
              {category.name}
            </Badge>
          ))}
        </div>
      </section>
      <section>
        <h3>Proveedores</h3>
        <p>Directorio básico para relacionar gastos y soportes.</p>
        <div className="expenses-catalog-create">
          <input
            className="input"
            onChange={(event) => setVendorName(event.target.value)}
            placeholder="Nuevo proveedor"
            value={vendorName}
          />
          <Button
            disabled={saving || vendorName.trim().length < 2}
            onClick={() => void createVendor()}
            size="sm"
            type="button"
          >
            Agregar
          </Button>
        </div>
        <div className="expenses-chip-list">
          {vendors.map((vendor) => (
            <Badge key={vendor.id} tone={vendor.is_active ? 'success' : 'neutral'}>
              {vendor.name}
            </Badge>
          ))}
        </div>
      </section>
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
  const [transitioning, setTransitioning] = useState(false);
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
    setFilters({ query: '', status: '', currency: '' });
  }, [condominiumId]);

  const selectedExpense = data?.expenses.find((expense) => expense.id === selectedExpenseId);
  const filteredExpenses = useMemo(
    () => filterExpenses(data?.expenses ?? [], filters),
    [data?.expenses, filters],
  );
  const counts = useMemo(() => getExpenseStatusCounts(data?.expenses ?? []), [data?.expenses]);
  const currencies = useMemo(
    () => [...new Set((data?.expenses ?? []).map((expense) => expense.currency_code))].sort(),
    [data?.expenses],
  );

  const loadExpenseDocuments = useCallback(
    async (expenseId: string) => {
      try {
        setAttachments(
          await apiRequest<ExpenseAttachment[]>(
            `/v1/condominiums/${condominiumId}/expenses/${expenseId}/attachments`,
            session,
          ),
        );
      } catch {
        setAttachments([]);
      }
    },
    [condominiumId, session],
  );

  const openDetail = async (expense: ExpenseRecord) => {
    setSelectedExpenseId(expense.id);
    setDrawer('detail');
    const [eventsResult] = await Promise.allSettled([
      apiRequest<ExpenseEvent[]>(
        `/v1/condominiums/${condominiumId}/expenses/${expense.id}/events`,
        session,
      ),
      loadExpenseDocuments(expense.id),
    ]);
    setEvents(eventsResult.status === 'fulfilled' ? eventsResult.value : []);
  };

  const transition = async (action: string) => {
    if (!selectedExpense) return;
    const reason = action === 'void' ? window.prompt('Motivo de la anulación:')?.trim() : undefined;
    if (action === 'void' && !reason) return;
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

  const firstCurrency = data.summary.totals_by_currency[0];

  return (
    <div className="expenses-page">
      <PageHeader
        actions={
          <>
            <Button onClick={() => setDrawer('catalogs')} size="sm" variant="secondary">
              Categorías y proveedores
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

      <section aria-label="Indicadores de gastos" className="expenses-metrics-grid">
        <MetricCard
          detail={
            firstCurrency
              ? 'Los importes se muestran separados por moneda.'
              : 'Registra el primer gasto para iniciar el control.'
          }
          icon={<ExpensesIcon size={20} />}
          label={firstCurrency ? `Total ${firstCurrency.currency_code}` : 'Gastos registrados'}
          tone="blue"
          value={
            firstCurrency
              ? formatMoney(firstCurrency.total_amount, firstCurrency.currency_code)
              : String(data.expenses.length)
          }
        />
        <MetricCard
          detail="Requieren revisión de un administrador autorizado."
          icon={<CheckCircleIcon size={20} />}
          label="Pendientes de aprobación"
          tone="red"
          value={String(data.summary.pending_approval_count || counts.pending_approval)}
        />
        <MetricCard
          detail="Gastos que ya completaron su ciclo de pago."
          icon={<PaymentsIcon size={20} />}
          label="Pagados"
          tone="green"
          value={String(counts.paid)}
        />
        <MetricCard
          detail="Proveedores activos disponibles en el directorio."
          icon={<PeopleIcon size={20} />}
          label="Proveedores"
          tone="navy"
          value={String(
            data.summary.active_vendor_count ||
              data.vendors.filter((item) => item.is_active).length,
          )}
        />
      </section>

      {data.summary.totals_by_currency.length > 1 ? (
        <Surface className="expenses-currency-strip">
          <div>
            <strong>Resumen por moneda</strong>
            <span>Habitta nunca suma monedas distintas.</span>
          </div>
          <div>
            {data.summary.totals_by_currency.map((summary) => (
              <article key={summary.currency_code}>
                <small>{summary.currency_code}</small>
                <strong>{formatMoney(summary.total_amount, summary.currency_code)}</strong>
                <span>{summary.expense_count} movimientos</span>
              </article>
            ))}
          </div>
        </Surface>
      ) : null}

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
                  const category = data.categories.find((item) => item.id === expense.category_id);
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
        <DrawerShell
          eyebrow="Nuevo movimiento"
          onClose={() => setDrawer(null)}
          title="Registrar gasto"
          wide
        >
          <CreateExpenseForm
            categories={data.categories}
            condominiumId={condominiumId}
            onCreated={async () => {
              await load();
              setDrawer(null);
            }}
            session={session}
            vendors={data.vendors}
          />
        </DrawerShell>
      ) : null}

      {drawer === 'catalogs' ? (
        <DrawerShell
          eyebrow="Configuración operativa"
          onClose={() => setDrawer(null)}
          title="Catálogos de gastos"
        >
          <CatalogsPanel
            categories={data.categories}
            condominiumId={condominiumId}
            onChanged={() => void load()}
            session={session}
            vendors={data.vendors}
          />
        </DrawerShell>
      ) : null}

      {drawer === 'detail' && selectedExpense ? (
        <DrawerShell
          eyebrow="Trazabilidad del egreso"
          onClose={() => setDrawer(null)}
          title={selectedExpense.description}
        >
          <div className="expenses-detail">
            <div className="expenses-detail__amount">
              <small>Monto registrado</small>
              <strong>{formatMoney(selectedExpense.amount, selectedExpense.currency_code)}</strong>
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
                  {data.categories.find((item) => item.id === selectedExpense.category_id)?.name ??
                    '—'}
                </dd>
              </div>
              <div>
                <dt>Proveedor</dt>
                <dd>
                  {data.vendors.find((item) => item.id === selectedExpense.vendor_id)?.name ?? '—'}
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
            <section className="expenses-documents">
              <h3>Documentos privados</h3>
              {attachments.length ? (
                <div className="expenses-documents__list">
                  {attachments.map((attachment) => (
                    <div className="private-document-row" key={attachment.id}>
                      <div>
                        <ExpensesIcon size={17} />
                        <span>
                          <strong>{attachment.original_filename}</strong>
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
              {nextExpenseActions(selectedExpense.status).map((action) => (
                <Button
                  disabled={transitioning}
                  key={action}
                  onClick={() => void transition(action)}
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
  );
}
