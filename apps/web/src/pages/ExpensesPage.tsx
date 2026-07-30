import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, ExpensesIcon, SettingsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { apiRequest } from '../lib/api';

type ExpenseStatus = 'draft' | 'approved' | 'paid' | 'void';
type BudgetStatus = 'draft' | 'approved' | 'closed';

type ExpenseCategory = {
  id: string;
  condominium_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type Supplier = {
  id: string;
  condominium_id: string;
  name: string;
  tax_document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: 'active' | 'inactive';
};

type Expense = {
  id: string;
  condominium_id: string;
  expense_reference: string;
  category_id: string;
  category_code: string;
  category_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string;
  currency_code: string;
  amount: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  status: ExpenseStatus;
  document_reference: string | null;
  void_reason: string | null;
  created_at: string;
};

type ExpenseSummary = {
  condominium_id: string;
  currency_code: string;
  committed_amount: string;
  paid_amount: string;
  payable_amount: string;
  draft_amount: string;
};

type Budget = {
  id: string;
  condominium_id: string;
  name: string;
  period_start: string;
  period_end: string;
  status: BudgetStatus;
  notes: string | null;
};

type BudgetActual = {
  budget_line_id: string;
  condominium_id: string;
  budget_id: string;
  budget_name: string;
  budget_status: BudgetStatus;
  category_id: string;
  category_name: string;
  currency_code: string;
  planned_amount: string;
  actual_amount: string;
  variance_amount: string;
};

type View = 'expenses' | 'suppliers' | 'budgets' | 'categories';
type Editor =
  | { kind: 'expense' }
  | { kind: 'supplier'; supplier: Supplier | null }
  | { kind: 'category'; category: ExpenseCategory | null }
  | { kind: 'budget' }
  | { kind: 'budget-line'; budget: Budget }
  | null;

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

const statusLabels: Record<ExpenseStatus, string> = {
  draft: 'Borrador',
  approved: 'Aprobado',
  paid: 'Pagado',
  void: 'Anulado',
};

const budgetStatusLabels: Record<BudgetStatus, string> = {
  draft: 'Borrador',
  approved: 'Aprobado',
  closed: 'Cerrado',
};

function formatMoney(value: string | number, currencyCode: string) {
  const amount = Number(value);
  try {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currencyCode} ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }
}

function moneyInput(value: FormDataEntryValue | null) {
  const normalized = Number(String(value ?? '0'));
  return Number.isFinite(normalized) ? normalized.toFixed(2) : '0.00';
}

function ExpensesSkeleton() {
  return (
    <div className="expenses-page">
      <Skeleton className="expenses-skeleton expenses-skeleton--hero" />
      <div className="expenses-summary-grid">
        <Skeleton className="expenses-skeleton" />
        <Skeleton className="expenses-skeleton" />
      </div>
      <Skeleton className="expenses-skeleton expenses-skeleton--workspace" />
    </div>
  );
}

export function ExpensesPage({ condominiumId, condominiumName, session }: Props) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetActuals, setBudgetActuals] = useState<BudgetActual[]>([]);
  const [activeView, setActiveView] = useState<View>('expenses');
  const [editor, setEditor] = useState<Editor>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryRows, supplierRows, expenseRows, summaryRows, budgetRows, actualRows] =
        await Promise.all([
          apiRequest<ExpenseCategory[]>(
            `/v1/condominiums/${condominiumId}/expense-categories`,
            session,
          ),
          apiRequest<Supplier[]>(`/v1/condominiums/${condominiumId}/suppliers`, session),
          apiRequest<Expense[]>(`/v1/condominiums/${condominiumId}/expenses`, session),
          apiRequest<ExpenseSummary[]>(
            `/v1/condominiums/${condominiumId}/expense-summary`,
            session,
          ),
          apiRequest<Budget[]>(`/v1/condominiums/${condominiumId}/budgets`, session),
          apiRequest<BudgetActual[]>(
            `/v1/condominiums/${condominiumId}/budget-actuals`,
            session,
          ),
        ]);
      setCategories(categoryRows);
      setSuppliers(supplierRows);
      setExpenses(expenseRows);
      setSummary(summaryRows);
      setBudgets(budgetRows);
      setBudgetActuals(actualRows);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo cargar el módulo de gastos.',
      });
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedSearch = search.trim().toLocaleLowerCase('es');
  const visibleExpenses = useMemo(
    () =>
      expenses.filter(
        (expense) =>
          !normalizedSearch ||
          [
            expense.expense_reference,
            expense.description,
            expense.category_name,
            expense.supplier_name ?? '',
            expense.currency_code,
            statusLabels[expense.status],
          ]
            .join(' ')
            .toLocaleLowerCase('es')
            .includes(normalizedSearch),
      ),
    [expenses, normalizedSearch],
  );

  const visibleSuppliers = useMemo(
    () =>
      suppliers.filter(
        (supplier) =>
          !normalizedSearch ||
          [supplier.name, supplier.tax_document ?? '', supplier.email ?? '', supplier.phone ?? '']
            .join(' ')
            .toLocaleLowerCase('es')
            .includes(normalizedSearch),
      ),
    [normalizedSearch, suppliers],
  );

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          !normalizedSearch ||
          [category.code, category.name, category.description ?? '']
            .join(' ')
            .toLocaleLowerCase('es')
            .includes(normalizedSearch),
      ),
    [categories, normalizedSearch],
  );

  const budgetLinesByBudget = useMemo(() => {
    const grouped = new Map<string, BudgetActual[]>();
    budgetActuals.forEach((line) => grouped.set(line.budget_id, [...(grouped.get(line.budget_id) ?? []), line]));
    return grouped;
  }, [budgetActuals]);

  async function perform(path: string, init: RequestInit, successMessage: string) {
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(path, session, init);
      await load();
      setEditor(null);
      setMessage({ tone: 'success', text: successMessage });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo completar la operación.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      `/v1/condominiums/${condominiumId}/expenses`,
      {
        method: 'POST',
        body: JSON.stringify({
          categoryId: String(form.get('categoryId') ?? ''),
          supplierId: String(form.get('supplierId') ?? '') || null,
          description: String(form.get('description') ?? '').trim(),
          amount: moneyInput(form.get('amount')),
          currencyCode: String(form.get('currencyCode') ?? 'USD').trim().toUpperCase(),
          issueDate: String(form.get('issueDate') ?? ''),
          dueDate: String(form.get('dueDate') ?? '') || null,
          documentReference: String(form.get('documentReference') ?? '').trim() || null,
          supportMetadata: {},
        }),
      },
      'El gasto fue registrado como borrador.',
    );
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>, supplier: Supplier | null) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      supplier
        ? `/v1/condominiums/${condominiumId}/suppliers/${supplier.id}`
        : `/v1/condominiums/${condominiumId}/suppliers`,
      {
        method: supplier ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          taxDocument: String(form.get('taxDocument') ?? '').trim() || null,
          email: String(form.get('email') ?? '').trim() || null,
          phone: String(form.get('phone') ?? '').trim() || null,
          address: String(form.get('address') ?? '').trim() || null,
          notes: String(form.get('notes') ?? '').trim() || null,
          status: String(form.get('status') ?? 'active'),
        }),
      },
      supplier ? 'El proveedor fue actualizado.' : 'El proveedor fue creado.',
    );
  }

  async function saveCategory(
    event: FormEvent<HTMLFormElement>,
    category: ExpenseCategory | null,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      category
        ? `/v1/condominiums/${condominiumId}/expense-categories/${category.id}`
        : `/v1/condominiums/${condominiumId}/expense-categories`,
      {
        method: category ? 'PATCH' : 'POST',
        body: JSON.stringify({
          code: String(form.get('code') ?? '').trim().toUpperCase(),
          name: String(form.get('name') ?? '').trim(),
          description: String(form.get('description') ?? '').trim() || null,
          isActive: String(form.get('isActive') ?? 'true') === 'true',
        }),
      },
      category ? 'La categoría fue actualizada.' : 'La categoría fue creada.',
    );
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      `/v1/condominiums/${condominiumId}/budgets`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          periodStart: String(form.get('periodStart') ?? ''),
          periodEnd: String(form.get('periodEnd') ?? ''),
          notes: String(form.get('notes') ?? '').trim() || null,
        }),
      },
      'El presupuesto fue creado como borrador.',
    );
  }

  async function saveBudgetLine(event: FormEvent<HTMLFormElement>, budget: Budget) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      `/v1/condominiums/${condominiumId}/budgets/${budget.id}/lines`,
      {
        method: 'POST',
        body: JSON.stringify({
          categoryId: String(form.get('categoryId') ?? ''),
          currencyCode: String(form.get('currencyCode') ?? 'USD').trim().toUpperCase(),
          plannedAmount: moneyInput(form.get('plannedAmount')),
          notes: String(form.get('notes') ?? '').trim() || null,
        }),
      },
      'La línea presupuestaria fue guardada.',
    );
  }

  if (loading && !expenses.length && !suppliers.length && !budgets.length) return <ExpensesSkeleton />;

  return (
    <div className="expenses-page">
      <header className="expenses-hero">
        <div>
          <span className="expenses-eyebrow">CONTROL DE EGRESOS</span>
          <h1>Gastos, proveedores y presupuestos</h1>
          <p>
            Registra compromisos y pagos de {condominiumName} con trazabilidad. Cada moneda se
            presenta por separado y los registros aprobados se corrigen mediante anulación.
          </p>
        </div>
        <div className="expenses-hero__actions">
          <Button onClick={() => setEditor({ kind: 'supplier', supplier: null })} variant="secondary">
            Nuevo proveedor
          </Button>
          <Button onClick={() => setEditor({ kind: 'expense' })}>Registrar gasto</Button>
        </div>
      </header>

      {message ? (
        <div className="expenses-message" data-tone={message.tone} role="status">
          {message.tone === 'success' ? <CheckCircleIcon size={18} /> : <SettingsIcon size={18} />}
          <span>{message.text}</span>
          {message.tone === 'error' ? (
            <button onClick={() => void load()} type="button">
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="expenses-summary-grid">
        {summary.length ? (
          summary.map((row) => (
            <Surface className="expenses-summary-card" key={row.currency_code}>
              <div className="expenses-summary-card__top">
                <span>{row.currency_code}</span>
                <Badge tone="info">Moneda independiente</Badge>
              </div>
              <strong>{formatMoney(row.committed_amount, row.currency_code)}</strong>
              <small>Comprometido aprobado o pagado</small>
              <div className="expenses-summary-card__breakdown">
                <span>
                  <b>{formatMoney(row.paid_amount, row.currency_code)}</b> pagado
                </span>
                <span>
                  <b>{formatMoney(row.payable_amount, row.currency_code)}</b> por pagar
                </span>
                <span>
                  <b>{formatMoney(row.draft_amount, row.currency_code)}</b> borrador
                </span>
              </div>
            </Surface>
          ))
        ) : (
          <Surface className="expenses-summary-card expenses-summary-card--empty">
            <span>Sin egresos aprobados</span>
            <strong>—</strong>
            <small>Los totales aparecerán separados por moneda.</small>
          </Surface>
        )}
      </div>

      <Surface className="expenses-workspace">
        <div className="expenses-toolbar">
          <div className="expenses-tabs" role="tablist" aria-label="Módulo de gastos">
            {([
              ['expenses', 'Gastos', expenses.length],
              ['suppliers', 'Proveedores', suppliers.length],
              ['budgets', 'Presupuestos', budgets.length],
              ['categories', 'Categorías', categories.length],
            ] as Array<[View, string, number]>).map(([view, label, count]) => (
              <button
                aria-selected={activeView === view}
                data-active={activeView === view}
                key={view}
                onClick={() => setActiveView(view)}
                role="tab"
                type="button"
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
          <input
            className="expenses-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar en esta sección"
            type="search"
            value={search}
          />
        </div>

        {activeView === 'expenses' ? (
          visibleExpenses.length ? (
            <div className="expenses-list">
              {visibleExpenses.map((expense) => (
                <article className="expense-row" key={expense.id}>
                  <div className="expense-row__identity">
                    <span className="expense-row__icon"><ExpensesIcon size={19} /></span>
                    <div>
                      <strong>{expense.description}</strong>
                      <small>{expense.expense_reference} · {expense.category_name}</small>
                    </div>
                  </div>
                  <div>
                    <strong>{formatMoney(expense.amount, expense.currency_code)}</strong>
                    <small>{expense.supplier_name ?? 'Sin proveedor'}</small>
                  </div>
                  <div>
                    <strong>{expense.issue_date}</strong>
                    <small>{expense.due_date ? `Vence ${expense.due_date}` : 'Sin vencimiento'}</small>
                  </div>
                  <Badge
                    tone={
                      expense.status === 'paid'
                        ? 'success'
                        : expense.status === 'void'
                          ? 'danger'
                          : expense.status === 'approved'
                            ? 'info'
                            : 'neutral'
                    }
                  >
                    {statusLabels[expense.status]}
                  </Badge>
                  <div className="expense-row__actions">
                    {expense.status === 'draft' ? (
                      <Button
                        onClick={() =>
                          void perform(
                            `/v1/condominiums/${condominiumId}/expenses/${expense.id}/approve`,
                            { method: 'POST' },
                            'El gasto fue aprobado.',
                          )
                        }
                        size="sm"
                        variant="secondary"
                      >
                        Aprobar
                      </Button>
                    ) : null}
                    {expense.status === 'approved' ? (
                      <Button
                        onClick={() =>
                          void perform(
                            `/v1/condominiums/${condominiumId}/expenses/${expense.id}/paid`,
                            {
                              method: 'POST',
                              body: JSON.stringify({ paidDate: new Date().toISOString().slice(0, 10) }),
                            },
                            'El gasto fue marcado como pagado.',
                          )
                        }
                        size="sm"
                      >
                        Marcar pagado
                      </Button>
                    ) : null}
                    {expense.status !== 'void' ? (
                      <Button
                        onClick={() => {
                          const reason = window.prompt('Motivo de anulación');
                          if (reason?.trim())
                            void perform(
                              `/v1/condominiums/${condominiumId}/expenses/${expense.id}/void`,
                              { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) },
                              'El gasto fue anulado sin eliminar su historial.',
                            );
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Anular
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              actionLabel="Registrar gasto"
              description="Crea el primer gasto como borrador y apruébalo cuando la información esté validada."
              icon={<ExpensesIcon size={26} />}
              onAction={() => setEditor({ kind: 'expense' })}
              title="No hay gastos para mostrar"
            />
          )
        ) : null}

        {activeView === 'suppliers' ? (
          visibleSuppliers.length ? (
            <div className="supplier-grid">
              {visibleSuppliers.map((supplier) => (
                <article className="supplier-card" key={supplier.id}>
                  <div className="supplier-card__top">
                    <span className="expense-row__icon"><ExpensesIcon size={19} /></span>
                    <Badge tone={supplier.status === 'active' ? 'success' : 'neutral'}>
                      {supplier.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <h2>{supplier.name}</h2>
                  <p>{supplier.tax_document ?? 'Documento fiscal no indicado'}</p>
                  <dl>
                    <div><dt>Correo</dt><dd>{supplier.email ?? '—'}</dd></div>
                    <div><dt>Teléfono</dt><dd>{supplier.phone ?? '—'}</dd></div>
                  </dl>
                  <Button
                    onClick={() => setEditor({ kind: 'supplier', supplier })}
                    size="sm"
                    variant="secondary"
                  >
                    Editar proveedor
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              actionLabel="Crear proveedor"
              description="Registra empresas y prestadores antes de asociarlos a los gastos."
              icon={<ExpensesIcon size={26} />}
              onAction={() => setEditor({ kind: 'supplier', supplier: null })}
              title="No hay proveedores"
            />
          )
        ) : null}

        {activeView === 'categories' ? (
          visibleCategories.length ? (
            <div className="category-list">
              {visibleCategories.map((category) => (
                <article className="category-row" key={category.id}>
                  <div>
                    <strong>{category.name}</strong>
                    <small>{category.code} · {category.description ?? 'Sin descripción'}</small>
                  </div>
                  <Badge tone={category.is_active ? 'success' : 'neutral'}>
                    {category.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <Button
                    onClick={() => setEditor({ kind: 'category', category })}
                    size="sm"
                    variant="ghost"
                  >
                    Editar
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              actionLabel="Crear categoría"
              description="Define categorías como seguridad, limpieza, mantenimiento o servicios."
              icon={<ExpensesIcon size={26} />}
              onAction={() => setEditor({ kind: 'category', category: null })}
              title="No hay categorías de gasto"
            />
          )
        ) : null}

        {activeView === 'budgets' ? (
          budgets.length ? (
            <div className="budget-list">
              {budgets.map((budget) => {
                const lines = budgetLinesByBudget.get(budget.id) ?? [];
                return (
                  <article className="budget-card" key={budget.id}>
                    <div className="budget-card__header">
                      <div>
                        <h2>{budget.name}</h2>
                        <p>{budget.period_start} — {budget.period_end}</p>
                      </div>
                      <Badge tone={budget.status === 'approved' ? 'success' : 'neutral'}>
                        {budgetStatusLabels[budget.status]}
                      </Badge>
                    </div>
                    {lines.length ? (
                      <div className="budget-lines">
                        {lines.map((line) => (
                          <div key={line.budget_line_id}>
                            <span>{line.category_name}</span>
                            <strong>{formatMoney(line.planned_amount, line.currency_code)}</strong>
                            <small>
                              Real {formatMoney(line.actual_amount, line.currency_code)} · Variación{' '}
                              {formatMoney(line.variance_amount, line.currency_code)}
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="budget-card__empty">Aún no tiene líneas presupuestarias.</p>
                    )}
                    {budget.status === 'draft' ? (
                      <div className="budget-card__actions">
                        <Button
                          onClick={() => setEditor({ kind: 'budget-line', budget })}
                          size="sm"
                          variant="secondary"
                        >
                          Agregar línea
                        </Button>
                        <Button
                          disabled={!lines.length}
                          onClick={() =>
                            void perform(
                              `/v1/condominiums/${condominiumId}/budgets/${budget.id}/approve`,
                              { method: 'POST' },
                              'El presupuesto fue aprobado y quedó protegido.',
                            )
                          }
                          size="sm"
                        >
                          Aprobar
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              actionLabel="Crear presupuesto"
              description="Define un período y luego agrega líneas separadas por categoría y moneda."
              icon={<ExpensesIcon size={26} />}
              onAction={() => setEditor({ kind: 'budget' })}
              title="No hay presupuestos"
            />
          )
        ) : null}
      </Surface>

      {activeView === 'categories' ? (
        <Button className="expenses-floating-action" onClick={() => setEditor({ kind: 'category', category: null })}>
          Nueva categoría
        </Button>
      ) : null}
      {activeView === 'budgets' ? (
        <Button className="expenses-floating-action" onClick={() => setEditor({ kind: 'budget' })}>
          Nuevo presupuesto
        </Button>
      ) : null}

      {editor ? (
        <div className="expenses-dialog-backdrop" onMouseDown={() => !saving && setEditor(null)}>
          <section
            aria-modal="true"
            className="expenses-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="expenses-dialog__header">
              <div>
                <span>GESTIÓN DE EGRESOS</span>
                <h2>
                  {editor.kind === 'expense'
                    ? 'Registrar gasto'
                    : editor.kind === 'supplier'
                      ? editor.supplier
                        ? 'Editar proveedor'
                        : 'Crear proveedor'
                      : editor.kind === 'category'
                        ? editor.category
                          ? 'Editar categoría'
                          : 'Crear categoría'
                        : editor.kind === 'budget-line'
                          ? `Línea de ${editor.budget.name}`
                          : 'Crear presupuesto'}
                </h2>
              </div>
              <button aria-label="Cerrar" disabled={saving} onClick={() => setEditor(null)} type="button">×</button>
            </div>

            {editor.kind === 'expense' ? (
              <form onSubmit={(event) => void saveExpense(event)}>
                <div className="expenses-dialog__body expenses-form-grid">
                  <Field label="Descripción"><input name="description" required /></Field>
                  <Field label="Categoría">
                    <Select name="categoryId" required defaultValue="">
                      <option disabled value="">Seleccionar</option>
                      {categories.filter((category) => category.is_active).map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Proveedor">
                    <Select name="supplierId" defaultValue="">
                      <option value="">Sin proveedor</option>
                      {suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Moneda"><input defaultValue="USD" maxLength={3} name="currencyCode" required /></Field>
                  <Field label="Monto"><input min="0.01" name="amount" step="0.01" type="number" required /></Field>
                  <Field label="Fecha del gasto"><input defaultValue={new Date().toISOString().slice(0, 10)} name="issueDate" type="date" required /></Field>
                  <Field label="Fecha de vencimiento"><input name="dueDate" type="date" /></Field>
                  <Field label="Factura o referencia"><input name="documentReference" /></Field>
                  {!categories.some((category) => category.is_active) ? (
                    <div className="expenses-form-note">Crea una categoría activa antes de registrar el gasto.</div>
                  ) : null}
                </div>
                <div className="expenses-dialog__footer">
                  <Button disabled={saving} onClick={() => setEditor(null)} type="button" variant="ghost">Cancelar</Button>
                  <Button disabled={saving || !categories.some((category) => category.is_active)} type="submit">
                    {saving ? 'Guardando…' : 'Guardar borrador'}
                  </Button>
                </div>
              </form>
            ) : null}

            {editor.kind === 'supplier' ? (
              <form onSubmit={(event) => void saveSupplier(event, editor.supplier)}>
                <div className="expenses-dialog__body expenses-form-grid">
                  <Field label="Nombre"><input defaultValue={editor.supplier?.name ?? ''} name="name" required /></Field>
                  <Field label="RIF o documento fiscal"><input defaultValue={editor.supplier?.tax_document ?? ''} name="taxDocument" /></Field>
                  <Field label="Correo"><input defaultValue={editor.supplier?.email ?? ''} name="email" type="email" /></Field>
                  <Field label="Teléfono"><input defaultValue={editor.supplier?.phone ?? ''} name="phone" /></Field>
                  <Field label="Dirección"><input defaultValue={editor.supplier?.address ?? ''} name="address" /></Field>
                  <Field label="Estado">
                    <Select defaultValue={editor.supplier?.status ?? 'active'} name="status">
                      <option value="active">Activo</option><option value="inactive">Inactivo</option>
                    </Select>
                  </Field>
                  <Field label="Notas"><textarea defaultValue={editor.supplier?.notes ?? ''} name="notes" rows={3} /></Field>
                </div>
                <div className="expenses-dialog__footer">
                  <Button disabled={saving} onClick={() => setEditor(null)} type="button" variant="ghost">Cancelar</Button>
                  <Button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar proveedor'}</Button>
                </div>
              </form>
            ) : null}

            {editor.kind === 'category' ? (
              <form onSubmit={(event) => void saveCategory(event, editor.category)}>
                <div className="expenses-dialog__body expenses-form-grid">
                  <Field label="Código"><input defaultValue={editor.category?.code ?? ''} maxLength={30} name="code" required /></Field>
                  <Field label="Nombre"><input defaultValue={editor.category?.name ?? ''} name="name" required /></Field>
                  <Field label="Descripción"><textarea defaultValue={editor.category?.description ?? ''} name="description" rows={3} /></Field>
                  <Field label="Estado">
                    <Select defaultValue={String(editor.category?.is_active ?? true)} name="isActive">
                      <option value="true">Activa</option><option value="false">Inactiva</option>
                    </Select>
                  </Field>
                </div>
                <div className="expenses-dialog__footer">
                  <Button disabled={saving} onClick={() => setEditor(null)} type="button" variant="ghost">Cancelar</Button>
                  <Button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar categoría'}</Button>
                </div>
              </form>
            ) : null}

            {editor.kind === 'budget' ? (
              <form onSubmit={(event) => void saveBudget(event)}>
                <div className="expenses-dialog__body expenses-form-grid">
                  <Field label="Nombre"><input name="name" placeholder="Presupuesto anual 2027" required /></Field>
                  <Field label="Inicio"><input name="periodStart" type="date" required /></Field>
                  <Field label="Fin"><input name="periodEnd" type="date" required /></Field>
                  <Field label="Notas"><textarea name="notes" rows={3} /></Field>
                </div>
                <div className="expenses-dialog__footer">
                  <Button disabled={saving} onClick={() => setEditor(null)} type="button" variant="ghost">Cancelar</Button>
                  <Button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Crear presupuesto'}</Button>
                </div>
              </form>
            ) : null}

            {editor.kind === 'budget-line' ? (
              <form onSubmit={(event) => void saveBudgetLine(event, editor.budget)}>
                <div className="expenses-dialog__body expenses-form-grid">
                  <Field label="Categoría">
                    <Select defaultValue="" name="categoryId" required>
                      <option disabled value="">Seleccionar</option>
                      {categories.filter((category) => category.is_active).map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Moneda"><input defaultValue="USD" maxLength={3} name="currencyCode" required /></Field>
                  <Field label="Monto planificado"><input min="0" name="plannedAmount" step="0.01" type="number" required /></Field>
                  <Field label="Notas"><textarea name="notes" rows={3} /></Field>
                </div>
                <div className="expenses-dialog__footer">
                  <Button disabled={saving} onClick={() => setEditor(null)} type="button" variant="ghost">Cancelar</Button>
                  <Button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar línea'}</Button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
