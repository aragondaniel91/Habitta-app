import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { PrivateDocumentUploader } from '../documents/PrivateDocumentUploader';
import { downloadPrivateDocument } from '../documents/api';
import { apiRequest } from '../../lib/api';
import { expenseStatusLabels, formatMoney } from '../../lib/expenses';
import type { ExpenseRecord } from '../../lib/expenses';
import { formatMaintenanceDate, workOrderStatusLabels } from '../../lib/maintenance';
import type { MaintenanceVendor, MaintenanceWorkOrder } from '../../lib/maintenance';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type QuoteStatus = 'submitted' | 'approved' | 'rejected' | 'superseded';

type MaintenanceQuote = {
  id: string;
  condominium_id: string;
  work_order_id: string;
  vendor_id: string;
  amount: string | number;
  currency_code: string;
  reference: string | null;
  valid_until: string | null;
  notes: string | null;
  status: QuoteStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

type MaintenanceAttachment = {
  id: string;
  condominium_id: string;
  work_order_id: string;
  quote_id: string | null;
  document_type: 'quote' | 'completion_photo' | 'completion_document' | 'invoice' | 'support' | 'other';
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

type MaintenanceExpenseLink = {
  id: string;
  condominium_id: string;
  work_order_id: string;
  expense_id: string;
  quote_id: string | null;
  linked_by: string;
  created_at: string;
};

const quoteStatusLabels: Record<QuoteStatus, string> = {
  submitted: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  superseded: 'Sustituida',
};

const quoteTone = (status: QuoteStatus) => {
  if (status === 'approved') return 'success' as const;
  if (status === 'submitted') return 'warning' as const;
  return 'neutral' as const;
};

const documentLabels: Record<MaintenanceAttachment['document_type'], string> = {
  quote: 'Cotización',
  completion_photo: 'Foto de culminación',
  completion_document: 'Documento de culminación',
  invoice: 'Factura',
  support: 'Soporte',
  other: 'Otro',
};

export function MaintenanceFinancialWorkspace({ condominiumId, condominiumName, session }: Props) {
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>([]);
  const [vendors, setVendors] = useState<MaintenanceVendor[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [quotes, setQuotes] = useState<MaintenanceQuote[]>([]);
  const [attachments, setAttachments] = useState<MaintenanceAttachment[]>([]);
  const [expenseLinks, setExpenseLinks] = useState<MaintenanceExpenseLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [vendorId, setVendorId] = useState('');
  const [reference, setReference] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [decisionSaving, setDecisionSaving] = useState('');
  const [expenseId, setExpenseId] = useState('');
  const [expenseQuoteId, setExpenseQuoteId] = useState('');
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [attachmentQuoteId, setAttachmentQuoteId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  const selectedWorkOrder = useMemo(
    () => workOrders.find((item) => item.id === selectedWorkOrderId),
    [selectedWorkOrderId, workOrders],
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextWorkOrders, nextVendors, nextExpenses] = await Promise.all([
        apiRequest<MaintenanceWorkOrder[]>(
          `/v1/condominiums/${condominiumId}/maintenance/work-orders`,
          session,
        ),
        apiRequest<MaintenanceVendor[]>(`/v1/condominiums/${condominiumId}/vendors`, session),
        apiRequest<ExpenseRecord[]>(`/v1/condominiums/${condominiumId}/expenses`, session),
      ]);
      setWorkOrders(nextWorkOrders);
      setVendors(nextVendors);
      setExpenses(nextExpenses);
      setSelectedWorkOrderId((current) =>
        current && nextWorkOrders.some((item) => item.id === current)
          ? current
          : (nextWorkOrders.find((item) => !['completed', 'cancelled'].includes(item.status))?.id ??
            nextWorkOrders[0]?.id ??
            ''),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el espacio financiero de mantenimiento.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  const loadDetail = useCallback(async () => {
    if (!selectedWorkOrderId) {
      setQuotes([]);
      setAttachments([]);
      setExpenseLinks([]);
      return;
    }
    setDetailLoading(true);
    setError('');
    const base = `/v1/condominiums/${condominiumId}/maintenance/work-orders/${selectedWorkOrderId}`;
    try {
      const [nextQuotes, nextAttachments, nextLinks] = await Promise.all([
        apiRequest<MaintenanceQuote[]>(`${base}/quotes`, session),
        apiRequest<MaintenanceAttachment[]>(`${base}/attachments`, session),
        apiRequest<MaintenanceExpenseLink[]>(`${base}/expenses`, session),
      ]);
      setQuotes(nextQuotes);
      setAttachments(nextAttachments);
      setExpenseLinks(nextLinks);
      setAttachmentQuoteId((current) =>
        current && nextQuotes.some((item) => item.id === current) ? current : '',
      );
      setExpenseQuoteId((current) =>
        current && nextQuotes.some((item) => item.id === current) ? current : '',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar cotizaciones, evidencias y gastos.',
      );
    } finally {
      setDetailLoading(false);
    }
  }, [condominiumId, selectedWorkOrderId, session]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    setAmount('');
    setReference('');
    setValidUntil('');
    setNotes('');
    setExpenseId('');
    setExpenseQuoteId('');
    setAttachmentQuoteId('');
  }, [selectedWorkOrderId]);

  const createQuote = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedWorkOrderId) return;
    setQuoteSaving(true);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${selectedWorkOrderId}/quotes`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            vendorId,
            amount,
            currencyCode,
            reference: reference || undefined,
            validUntil: validUntil || undefined,
            notes: notes || undefined,
          }),
        },
      );
      setAmount('');
      setReference('');
      setValidUntil('');
      setNotes('');
      await loadDetail();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear la cotización.');
    } finally {
      setQuoteSaving(false);
    }
  };

  const decideQuote = async (quoteId: string, decision: 'approve' | 'reject') => {
    setDecisionSaving(quoteId);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${selectedWorkOrderId}/quotes/${quoteId}/decision`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ decision, note: decisionNotes[quoteId]?.trim() || undefined }),
        },
      );
      await loadDetail();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo decidir la cotización.',
      );
    } finally {
      setDecisionSaving('');
    }
  };

  const linkExpense = async () => {
    if (!expenseId || !selectedWorkOrderId) return;
    setExpenseSaving(true);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${selectedWorkOrderId}/expenses`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ expenseId, quoteId: expenseQuoteId || undefined }),
        },
      );
      setExpenseId('');
      setExpenseQuoteId('');
      await loadDetail();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo vincular el gasto.');
    } finally {
      setExpenseSaving(false);
    }
  };

  const linkedExpenseIds = useMemo(
    () => new Set(expenseLinks.map((link) => link.expense_id)),
    [expenseLinks],
  );
  const availableExpenses = expenses.filter((expense) => !linkedExpenseIds.has(expense.id));
  const selectableQuotes = quotes.filter((quote) => quote.status === 'submitted' || quote.status === 'approved');
  const selectedAttachmentQuote = quotes.find((quote) => quote.id === attachmentQuoteId);

  if (loading) {
    return (
      <div className="maintenance-financial-page">
        <PageHeader eyebrow="Mantenimiento" title="Finanzas y evidencias" />
        <Skeleton className="maintenance-financial-skeleton" />
      </div>
    );
  }

  return (
    <div className="maintenance-financial-page">
      <PageHeader
        description={`Cotizaciones, soportes privados y gastos vinculados de ${condominiumName}.`}
        eyebrow="Mantenimiento"
        title="Finanzas y evidencias"
      />

      {error ? <div className="maintenance-financial-alert">{error}</div> : null}

      <Surface className="maintenance-financial-selector">
        <Field label="Orden de trabajo">
          <Select
            onChange={(event) => setSelectedWorkOrderId(event.target.value)}
            value={selectedWorkOrderId}
          >
            <option value="">Selecciona una orden</option>
            {workOrders.map((workOrder) => (
              <option key={workOrder.id} value={workOrder.id}>
                {workOrder.work_order_number} · {workOrder.title}
              </option>
            ))}
          </Select>
        </Field>
        {selectedWorkOrder ? (
          <div className="maintenance-financial-selector__summary">
            <Badge tone={selectedWorkOrder.status === 'completed' ? 'success' : 'info'}>
              {workOrderStatusLabels[selectedWorkOrder.status]}
            </Badge>
            <span>{selectedWorkOrder.description}</span>
          </div>
        ) : null}
      </Surface>

      {!selectedWorkOrder ? (
        <EmptyState
          description="Crea una orden de trabajo en Operaciones para empezar a registrar cotizaciones y evidencias."
          title="No hay una orden seleccionada"
        />
      ) : detailLoading ? (
        <Skeleton className="maintenance-financial-skeleton" />
      ) : (
        <div className="maintenance-financial-grid">
          <Surface className="maintenance-financial-card maintenance-financial-card--wide">
            <div className="maintenance-financial-card__heading">
              <div>
                <span>Cotizaciones</span>
                <h2>Presupuestos de proveedores</h2>
              </div>
              <Badge tone="info">{quotes.length}</Badge>
            </div>

            {!['completed', 'cancelled'].includes(selectedWorkOrder.status) ? (
              <form className="maintenance-financial-form" onSubmit={(event) => void createQuote(event)}>
                <div className="maintenance-financial-form__grid">
                  <Field label="Proveedor">
                    <Select onChange={(event) => setVendorId(event.target.value)} required value={vendorId}>
                      <option value="">Selecciona</option>
                      {vendors
                        .filter((vendor) => vendor.is_active)
                        .map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Monto">
                    <input
                      className="input"
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
                  <Field label="Vigente hasta" hint="Opcional">
                    <input
                      className="input"
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => setValidUntil(event.target.value)}
                      type="date"
                      value={validUntil}
                    />
                  </Field>
                </div>
                <Field label="Referencia" hint="Opcional">
                  <input className="input" onChange={(event) => setReference(event.target.value)} value={reference} />
                </Field>
                <Field label="Notas" hint="Opcional">
                  <textarea className="textarea" onChange={(event) => setNotes(event.target.value)} rows={3} value={notes} />
                </Field>
                <Button disabled={quoteSaving || !vendorId || !amount} type="submit">
                  {quoteSaving ? 'Guardando…' : 'Agregar cotización'}
                </Button>
              </form>
            ) : null}

            <div className="maintenance-financial-list">
              {quotes.length === 0 ? (
                <p className="maintenance-financial-muted">Todavía no hay cotizaciones para esta orden.</p>
              ) : (
                quotes.map((quote) => (
                  <article className="maintenance-quote" key={quote.id}>
                    <div className="maintenance-quote__top">
                      <div>
                        <strong>{vendors.find((vendor) => vendor.id === quote.vendor_id)?.name ?? 'Proveedor'}</strong>
                        <span>{formatMoney(quote.amount, quote.currency_code)}</span>
                      </div>
                      <Badge tone={quoteTone(quote.status)}>{quoteStatusLabels[quote.status]}</Badge>
                    </div>
                    <div className="maintenance-quote__meta">
                      <span>{quote.reference || 'Sin referencia'}</span>
                      <span>{quote.valid_until ? `Vence ${formatMaintenanceDate(quote.valid_until)}` : 'Sin vencimiento'}</span>
                      <span>Creada {formatMaintenanceDate(quote.created_at, true)}</span>
                    </div>
                    {quote.notes ? <p>{quote.notes}</p> : null}
                    {quote.decision_note ? <p className="maintenance-quote__decision">Decisión: {quote.decision_note}</p> : null}
                    {quote.status === 'submitted' ? (
                      <div className="maintenance-quote__decision-controls">
                        <textarea
                          aria-label={`Nota de decisión para ${quote.reference || quote.id}`}
                          className="textarea"
                          onChange={(event) =>
                            setDecisionNotes((current) => ({ ...current, [quote.id]: event.target.value }))
                          }
                          placeholder="Nota opcional al aprobar; obligatoria al rechazar"
                          rows={2}
                          value={decisionNotes[quote.id] ?? ''}
                        />
                        <div>
                          <Button
                            disabled={decisionSaving === quote.id}
                            onClick={() => void decideQuote(quote.id, 'approve')}
                            size="sm"
                            type="button"
                          >
                            Aprobar
                          </Button>
                          <Button
                            disabled={
                              decisionSaving === quote.id ||
                              (decisionNotes[quote.id]?.trim().length ?? 0) < 3
                            }
                            onClick={() => void decideQuote(quote.id, 'reject')}
                            size="sm"
                            type="button"
                          >
                            Rechazar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </Surface>

          <Surface className="maintenance-financial-card">
            <div className="maintenance-financial-card__heading">
              <div>
                <span>Evidencias privadas</span>
                <h2>Archivos de la orden</h2>
              </div>
              <Badge tone="info">{attachments.length}</Badge>
            </div>
            <Field label="Cotización relacionada" hint="Selecciona una para permitir archivos tipo Cotización">
              <Select onChange={(event) => setAttachmentQuoteId(event.target.value)} value={attachmentQuoteId}>
                <option value="">Sin cotización</option>
                {quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {vendors.find((vendor) => vendor.id === quote.vendor_id)?.name ?? 'Proveedor'} · {formatMoney(quote.amount, quote.currency_code)}
                  </option>
                ))}
              </Select>
            </Field>
            <PrivateDocumentUploader
              defaultDocumentType={selectedAttachmentQuote ? 'quote' : 'support'}
              documentTypes={
                selectedAttachmentQuote
                  ? [
                      { value: 'quote', label: 'Cotización' },
                      { value: 'invoice', label: 'Factura' },
                      { value: 'support', label: 'Soporte' },
                      { value: 'completion_photo', label: 'Foto de culminación' },
                      { value: 'completion_document', label: 'Documento de culminación' },
                      { value: 'other', label: 'Otro' },
                    ]
                  : [
                      { value: 'invoice', label: 'Factura' },
                      { value: 'support', label: 'Soporte' },
                      { value: 'completion_photo', label: 'Foto de culminación' },
                      { value: 'completion_document', label: 'Documento de culminación' },
                      { value: 'other', label: 'Otro' },
                    ]
              }
              onUploaded={loadDetail}
              path={`/v1/condominiums/${condominiumId}/maintenance/work-orders/${selectedWorkOrderId}/attachments`}
              quoteId={attachmentQuoteId || undefined}
              session={session}
              title="Cargar evidencia"
            />
            <div className="maintenance-financial-list">
              {attachments.map((attachment) => (
                <article className="maintenance-attachment" key={attachment.id}>
                  <div>
                    <strong>{attachment.original_filename}</strong>
                    <span>{documentLabels[attachment.document_type]} · {Math.max(1, Math.ceil(attachment.size_bytes / 1024))} KB</span>
                  </div>
                  <Button
                    disabled={downloadingId === attachment.id}
                    onClick={() => {
                      setDownloadingId(attachment.id);
                      void downloadPrivateDocument(
                        `/v1/condominiums/${condominiumId}/maintenance/work-orders/${selectedWorkOrderId}/attachments/${attachment.id}/file`,
                        session,
                        attachment.original_filename,
                      ).finally(() => setDownloadingId(''));
                    }}
                    size="sm"
                    type="button"
                  >
                    {downloadingId === attachment.id ? 'Descargando…' : 'Descargar'}
                  </Button>
                </article>
              ))}
            </div>
          </Surface>

          <Surface className="maintenance-financial-card">
            <div className="maintenance-financial-card__heading">
              <div>
                <span>Contabilidad</span>
                <h2>Gastos vinculados</h2>
              </div>
              <Badge tone="info">{expenseLinks.length}</Badge>
            </div>
            <Field label="Gasto existente">
              <Select onChange={(event) => setExpenseId(event.target.value)} value={expenseId}>
                <option value="">Selecciona un gasto</option>
                {availableExpenses.map((expense) => (
                  <option key={expense.id} value={expense.id}>
                    {expense.description} · {formatMoney(expense.amount, expense.currency_code)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cotización relacionada" hint="Opcional">
              <Select onChange={(event) => setExpenseQuoteId(event.target.value)} value={expenseQuoteId}>
                <option value="">Sin cotización</option>
                {selectableQuotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quoteStatusLabels[quote.status]} · {formatMoney(quote.amount, quote.currency_code)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button disabled={expenseSaving || !expenseId} onClick={() => void linkExpense()} type="button">
              {expenseSaving ? 'Vinculando…' : 'Vincular gasto'}
            </Button>
            <p className="maintenance-financial-muted">
              Vincular no modifica el monto, el estado ni la cuenta de Tesorería del gasto.
            </p>
            <div className="maintenance-financial-list">
              {expenseLinks.map((link) => {
                const expense = expenses.find((item) => item.id === link.expense_id);
                return (
                  <article className="maintenance-expense-link" key={link.id}>
                    <div>
                      <strong>{expense?.description ?? 'Gasto vinculado'}</strong>
                      <span>
                        {expense
                          ? `${formatMoney(expense.amount, expense.currency_code)} · ${expenseStatusLabels[expense.status]}`
                          : link.expense_id}
                      </span>
                    </div>
                    {link.quote_id ? <Badge tone="neutral">Con cotización</Badge> : null}
                  </article>
                );
              })}
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}
