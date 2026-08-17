import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Dialog, DialogBody, DialogFooter } from '../components/Dialog';
import {
  CheckCircleIcon,
  ExpensesIcon,
  FeesIcon,
  PaymentsIcon,
  PeopleIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { Drawer } from '../components/Drawer';
import { PageHeader } from '../components/PageHeader';
import { ExpenseCaptureDrawer } from '../features/expenses/ExpenseCaptureDrawer';
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
    setVoidDialogOpen(false);
    setVoidReason('');
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

  const firstCurrency = data.summary.totals_by_currency[0];

  return (
    <>
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
                <strong>
                  {formatMoney(selectedExpense.amount, selectedExpense.currency_code)}
                </strong>
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
