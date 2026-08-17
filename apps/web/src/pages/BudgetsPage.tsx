import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ExpensesIcon, ReportsIcon } from '../components/icons';
import { Drawer } from '../components/Drawer';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Select, Skeleton, Surface } from '../components/ui';
import { apiRequest } from '../lib/api';
import type { ExpenseCategory } from '../lib/expenses';
import { canManage, useCondominiumRoles } from '../lib/roles';
import {
  budgetStatusLabels,
  budgetTotalsByCurrency,
  formatBudgetDate,
  formatBudgetMoney,
  latestBudgetVersion,
  linesForBudgetVersion,
} from '../lib/budgets';
import type {
  BudgetActualRow,
  BudgetLine,
  BudgetPeriod,
  BudgetVersion,
  BudgetWorkspace,
} from '../lib/budgets';
import '../budgets.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type EditorLine = {
  id: string;
  categoryId: string;
  currencyCode: string;
  amount: string;
  note: string;
};

type EditorState = {
  mode: 'create' | 'revision';
  periodId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  requestId: string;
  revisionNote: string;
  lines: EditorLine[];
};

const statusTone = (status: BudgetVersion['status']) => {
  if (status === 'approved') return 'success' as const;
  if (status === 'pending_approval') return 'warning' as const;
  if (status === 'superseded') return 'neutral' as const;
  return 'info' as const;
};

const newLine = (categoryId = '', currencyCode = 'USD'): EditorLine => ({
  id: crypto.randomUUID(),
  categoryId,
  currencyCode,
  amount: '',
  note: '',
});

function BudgetLoading() {
  return (
    <div aria-label="Cargando presupuestos" className="budgets-page">
      <PageHeader eyebrow="Planificación financiera" title="Presupuestos" />
      <div className="budgets-metrics">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="budgets-workspace-skeleton" />
    </div>
  );
}

function BudgetEditor({
  editor,
  categories,
  saving,
  error,
  onChange,
  onClose,
  onSave,
}: {
  editor: EditorState;
  categories: ExpenseCategory[];
  saving: boolean;
  error: string;
  onChange: (editor: EditorState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const setLine = (id: string, patch: Partial<EditorLine>) => {
    onChange({
      ...editor,
      lines: editor.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  };

  const canSave =
    editor.name.trim().length > 0 &&
    editor.startsOn.length === 10 &&
    editor.endsOn.length === 10 &&
    editor.endsOn >= editor.startsOn &&
    editor.lines.length > 0 &&
    editor.lines.every(
      (line) =>
        line.categoryId && /^[A-Za-z]{3}$/.test(line.currencyCode) && Number(line.amount) > 0,
    );

  return (
    <Drawer
      eyebrow={editor.mode === 'create' ? 'Nuevo período' : 'Nueva versión'}
      onClose={onClose}
      prefix="budgets"
      title={editor.mode === 'create' ? 'Crear presupuesto' : `Revisar ${editor.name}`}
      wide
    >
      <div className="budgets-editor">
        {error ? <div className="budgets-alert">{error}</div> : null}

        <div className="budgets-editor__grid">
          <label>
            Nombre
            <input
              className="input"
              disabled={editor.mode === 'revision'}
              maxLength={160}
              onChange={(event) => onChange({ ...editor, name: event.target.value })}
              placeholder="Presupuesto anual 2027"
              value={editor.name}
            />
          </label>
          <label>
            Desde
            <input
              className="input"
              disabled={editor.mode === 'revision'}
              onChange={(event) => onChange({ ...editor, startsOn: event.target.value })}
              type="date"
              value={editor.startsOn}
            />
          </label>
          <label>
            Hasta
            <input
              className="input"
              disabled={editor.mode === 'revision'}
              onChange={(event) => onChange({ ...editor, endsOn: event.target.value })}
              type="date"
              value={editor.endsOn}
            />
          </label>
        </div>

        <label className="budgets-editor__note">
          Nota de versión
          <textarea
            className="input"
            maxLength={1000}
            onChange={(event) => onChange({ ...editor, revisionNote: event.target.value })}
            placeholder="Explica brevemente el alcance o motivo de esta versión."
            rows={3}
            value={editor.revisionNote}
          />
        </label>

        <div className="budgets-editor__heading">
          <div>
            <strong>Líneas presupuestarias</strong>
            <span>
              Cada categoría puede presupuestarse por moneda sin conversiones automáticas.
            </span>
          </div>
          <Button
            onClick={() =>
              onChange({
                ...editor,
                lines: [...editor.lines, newLine(categories[0]?.id ?? '')],
              })
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            Agregar línea
          </Button>
        </div>

        <div className="budgets-editor__lines">
          {editor.lines.map((line, index) => (
            <div className="budgets-editor-line" key={line.id}>
              <span className="budgets-editor-line__number">{index + 1}</span>
              <label>
                Categoría
                <Select
                  onChange={(event) => setLine(line.id, { categoryId: event.target.value })}
                  value={line.categoryId}
                >
                  <option value="">Seleccionar</option>
                  {categories
                    .filter((category) => category.is_active)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </Select>
              </label>
              <label>
                Moneda
                <input
                  className="input budgets-currency-input"
                  maxLength={3}
                  onChange={(event) =>
                    setLine(line.id, { currencyCode: event.target.value.toUpperCase() })
                  }
                  value={line.currencyCode}
                />
              </label>
              <label>
                Monto
                <input
                  className="input"
                  inputMode="decimal"
                  min="0.01"
                  onChange={(event) => setLine(line.id, { amount: event.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={line.amount}
                />
              </label>
              <label className="budgets-editor-line__note">
                Nota
                <input
                  className="input"
                  maxLength={1000}
                  onChange={(event) => setLine(line.id, { note: event.target.value })}
                  placeholder="Opcional"
                  value={line.note}
                />
              </label>
              <Button
                disabled={editor.lines.length === 1}
                onClick={() =>
                  onChange({
                    ...editor,
                    lines: editor.lines.filter((candidate) => candidate.id !== line.id),
                  })
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>

        <div className="budgets-editor__footer">
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving || !canSave} onClick={onSave} type="button">
            {saving
              ? 'Guardando…'
              : editor.mode === 'create'
                ? 'Crear borrador'
                : 'Crear nueva versión'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

export function BudgetsPage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const canEdit = canManage(roles);
  const canApprove = roles.includes('condominium_admin');
  const [workspace, setWorkspace] = useState<BudgetWorkspace | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [transitioningId, setTransitioningId] = useState('');
  const [reportPeriodId, setReportPeriodId] = useState('');
  const [reportRows, setReportRows] = useState<BudgetActualRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [budgetWorkspace, expenseCategories] = await Promise.all([
        apiRequest<BudgetWorkspace>(`/v1/condominiums/${condominiumId}/budgets`, session),
        apiRequest<ExpenseCategory[]>(
          `/v1/condominiums/${condominiumId}/expense-categories`,
          session,
        ),
      ]);
      setWorkspace(budgetWorkspace);
      setCategories(expenseCategories);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar los presupuestos.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEditor(null);
    setReportPeriodId('');
    setReportRows([]);
  }, [condominiumId]);

  const currentVersions = useMemo(() => {
    if (!workspace) return [];
    return workspace.periods
      .map((period) => latestBudgetVersion(period, workspace.versions))
      .filter((version): version is BudgetVersion => Boolean(version));
  }, [workspace]);

  const currencies = useMemo(() => {
    if (!workspace) return [];
    const currentIds = new Set(currentVersions.map((version) => version.id));
    return [
      ...new Set(
        workspace.lines
          .filter((line) => currentIds.has(line.budget_version_id))
          .map((line) => line.currency_code),
      ),
    ].sort();
  }, [currentVersions, workspace]);

  const openCreate = () => {
    const year = new Date().getFullYear() + 1;
    setEditorError('');
    setEditor({
      mode: 'create',
      periodId: '',
      name: `Presupuesto ${year}`,
      startsOn: `${year}-01-01`,
      endsOn: `${year}-12-31`,
      requestId: crypto.randomUUID(),
      revisionNote: '',
      lines: [newLine(categories[0]?.id ?? '')],
    });
  };

  const openRevision = (period: BudgetPeriod, version: BudgetVersion) => {
    if (!workspace) return;
    const sourceLines = linesForBudgetVersion(version.id, workspace.lines);
    setEditorError('');
    setEditor({
      mode: 'revision',
      periodId: period.id,
      name: period.name,
      startsOn: period.starts_on,
      endsOn: period.ends_on,
      requestId: crypto.randomUUID(),
      revisionNote: '',
      lines: sourceLines.map((line) => ({
        id: crypto.randomUUID(),
        categoryId: line.category_id,
        currencyCode: line.currency_code,
        amount: String(line.amount),
        note: line.note ?? '',
      })),
    });
  };

  const saveBudget = async () => {
    if (!editor) return;
    setSaving(true);
    setEditorError('');
    try {
      const lines = editor.lines.map((line) => ({
        categoryId: line.categoryId,
        currencyCode: line.currencyCode,
        amount: line.amount,
        note: line.note || undefined,
      }));
      if (editor.mode === 'create') {
        await apiRequest(`/v1/condominiums/${condominiumId}/budgets`, session, {
          method: 'POST',
          body: JSON.stringify({
            name: editor.name,
            startsOn: editor.startsOn,
            endsOn: editor.endsOn,
            requestId: editor.requestId,
            revisionNote: editor.revisionNote || undefined,
            lines,
          }),
        });
      } else {
        await apiRequest(
          `/v1/condominiums/${condominiumId}/budgets/${editor.periodId}/revisions`,
          session,
          {
            method: 'POST',
            body: JSON.stringify({
              requestId: editor.requestId,
              revisionNote: editor.revisionNote || undefined,
              lines,
            }),
          },
        );
      }
      setEditor(null);
      await load();
    } catch (requestError) {
      setEditorError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar el presupuesto.',
      );
    } finally {
      setSaving(false);
    }
  };

  const transition = async (
    period: BudgetPeriod,
    version: BudgetVersion,
    action: 'submit' | 'approve',
  ) => {
    setTransitioningId(version.id);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/budgets/${period.id}/versions/${version.id}/${action}`,
        session,
        { method: 'POST' },
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar el estado del presupuesto.',
      );
    } finally {
      setTransitioningId('');
    }
  };

  const loadReport = async (period: BudgetPeriod) => {
    setReportPeriodId(period.id);
    setReportLoading(true);
    setError('');
    try {
      setReportRows(
        await apiRequest<BudgetActualRow[]>(
          `/v1/condominiums/${condominiumId}/budgets/${period.id}/actual-vs-budget`,
          session,
        ),
      );
    } catch (requestError) {
      setReportRows([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo calcular la ejecución presupuestaria.',
      );
    } finally {
      setReportLoading(false);
    }
  };

  if (loading && !workspace) return <BudgetLoading />;

  if (!workspace) {
    return (
      <Surface>
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir el módulo de presupuestos.'}
          icon={<ExpensesIcon size={28} />}
          onAction={() => void load()}
          title="Presupuestos no disponibles"
        />
      </Surface>
    );
  }

  const approvedCount = currentVersions.filter((version) => version.status === 'approved').length;
  const pendingCount = currentVersions.filter(
    (version) => version.status === 'pending_approval',
  ).length;

  return (
    <div className="budgets-page">
      <PageHeader
        actions={
          canEdit ? (
            <Button onClick={openCreate} size="sm">
              Crear presupuesto
            </Button>
          ) : undefined
        }
        description={`${condominiumName} · planificación, aprobación, versiones y ejecución por moneda.`}
        eyebrow="Planificación financiera"
        title="Presupuestos"
      />

      {error ? (
        <div className="budgets-alert" role="status">
          {error}
        </div>
      ) : null}

      <section aria-label="Indicadores de presupuestos" className="budgets-metrics">
        <Surface>
          <small>Períodos</small>
          <strong>{workspace.periods.length}</strong>
          <span>Presupuestos con historial versionado.</span>
        </Surface>
        <Surface>
          <small>Aprobados</small>
          <strong>{approvedCount}</strong>
          <span>Versiones vigentes para comparar con gastos reales.</span>
        </Surface>
        <Surface>
          <small>Pendientes</small>
          <strong>{pendingCount}</strong>
          <span>Esperan aprobación administrativa.</span>
        </Surface>
        <Surface>
          <small>Monedas</small>
          <strong>{currencies.length ? currencies.join(' · ') : '—'}</strong>
          <span>Nunca se consolidan monedas distintas.</span>
        </Surface>
      </section>

      {!workspace.periods.length ? (
        <Surface className="budgets-empty">
          <EmptyState
            actionLabel={canEdit ? 'Crear primer presupuesto' : undefined}
            description="Define un período, agrega líneas por categoría y moneda, y envíalo a aprobación."
            icon={<ExpensesIcon size={28} />}
            onAction={canEdit ? openCreate : undefined}
            title="Todavía no hay presupuestos"
          />
        </Surface>
      ) : (
        <div className="budgets-list">
          {workspace.periods.map((period) => {
            const version = latestBudgetVersion(period, workspace.versions);
            if (!version) return null;
            const lines = linesForBudgetVersion(version.id, workspace.lines);
            const totals = budgetTotalsByCurrency(lines);
            const history = workspace.versions
              .filter((candidate) => candidate.budget_period_id === period.id)
              .sort((a, b) => b.version_number - a.version_number);
            return (
              <Surface className="budgets-card" key={period.id}>
                <div className="budgets-card__header">
                  <div>
                    <div className="budgets-card__title-row">
                      <h2>{period.name}</h2>
                      <Badge tone={statusTone(version.status)}>
                        {budgetStatusLabels[version.status]}
                      </Badge>
                    </div>
                    <p>
                      {formatBudgetDate(period.starts_on)} — {formatBudgetDate(period.ends_on)} ·
                      versión {version.version_number}
                    </p>
                  </div>
                  <div className="budgets-card__actions">
                    {version.status === 'draft' && canEdit ? (
                      <>
                        <Button
                          onClick={() => openRevision(period, version)}
                          size="sm"
                          variant="secondary"
                        >
                          Revisar
                        </Button>
                        <Button
                          disabled={transitioningId === version.id}
                          onClick={() => void transition(period, version, 'submit')}
                          size="sm"
                        >
                          Enviar a aprobación
                        </Button>
                      </>
                    ) : null}
                    {version.status === 'pending_approval' && canApprove ? (
                      <Button
                        disabled={transitioningId === version.id}
                        onClick={() => void transition(period, version, 'approve')}
                        size="sm"
                      >
                        Aprobar
                      </Button>
                    ) : null}
                    {version.status === 'approved' && canEdit ? (
                      <Button
                        onClick={() => openRevision(period, version)}
                        size="sm"
                        variant="secondary"
                      >
                        Crear revisión
                      </Button>
                    ) : null}
                    {period.approved_version_id ? (
                      <Button onClick={() => void loadReport(period)} size="sm" variant="ghost">
                        Ver ejecución
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="budgets-card__totals">
                  {Object.entries(totals).map(([currencyCode, amount]) => (
                    <div key={currencyCode}>
                      <span>{currencyCode}</span>
                      <strong>{formatBudgetMoney(amount, currencyCode)}</strong>
                    </div>
                  ))}
                </div>

                <div className="budgets-lines-table-wrap">
                  <table className="budgets-lines-table">
                    <thead>
                      <tr>
                        <th>Categoría</th>
                        <th>Moneda</th>
                        <th>Monto</th>
                        <th>Nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id}>
                          <td>
                            {categories.find((category) => category.id === line.category_id)
                              ?.name ?? 'Categoría'}
                          </td>
                          <td>{line.currency_code}</td>
                          <td>{formatBudgetMoney(line.amount, line.currency_code)}</td>
                          <td>{line.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <details className="budgets-history">
                  <summary>Historial de versiones ({history.length})</summary>
                  <div>
                    {history.map((item) => (
                      <span key={item.id}>
                        v{item.version_number} · {budgetStatusLabels[item.status]}
                        {item.revision_note ? ` · ${item.revision_note}` : ''}
                      </span>
                    ))}
                  </div>
                </details>
              </Surface>
            );
          })}
        </div>
      )}

      {reportPeriodId ? (
        <Surface className="budgets-report">
          <div className="budgets-report__header">
            <div>
              <span className="budgets-report__icon">
                <ReportsIcon size={20} />
              </span>
              <div>
                <h2>Ejecución real vs. presupuesto</h2>
                <p>Solo gastos aprobados o pagados del período. Sin conversión entre monedas.</p>
              </div>
            </div>
            <Button
              onClick={() => {
                setReportPeriodId('');
                setReportRows([]);
              }}
              size="sm"
              variant="ghost"
            >
              Cerrar
            </Button>
          </div>
          {reportLoading ? (
            <Skeleton className="budgets-report-skeleton" />
          ) : (
            <div className="budgets-lines-table-wrap">
              <table className="budgets-lines-table budgets-lines-table--report">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Moneda</th>
                    <th>Presupuesto</th>
                    <th>Real</th>
                    <th>Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={`${row.category_id}:${row.currency_code}`}>
                      <td>{row.category_name}</td>
                      <td>{row.currency_code}</td>
                      <td>{formatBudgetMoney(row.budget_amount, row.currency_code)}</td>
                      <td>{formatBudgetMoney(row.actual_amount, row.currency_code)}</td>
                      <td data-negative={Number(row.variance_amount) < 0 || undefined}>
                        {formatBudgetMoney(row.variance_amount, row.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      ) : null}

      {editor ? (
        <BudgetEditor
          categories={categories}
          editor={editor}
          error={editorError}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={() => void saveBudget()}
          saving={saving}
        />
      ) : null}
    </div>
  );
}
