import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { Button, Field, Select } from '../../components/ui';
import { PrivateDocumentUploader } from '../documents/PrivateDocumentUploader';
import { apiRequest } from '../../lib/api';
import type { ExpenseCategory, ExpenseRecord, ExpenseVendor } from '../../lib/expenses';
import '../../financial-capture.css';

export function ExpenseCaptureDrawer({
  condominiumId,
  session,
  categories,
  vendors,
  onClose,
  onDraftCreated,
  onComplete,
}: {
  condominiumId: string;
  session: Session;
  categories: ExpenseCategory[];
  vendors: ExpenseVendor[];
  onClose: () => void;
  onDraftCreated: () => Promise<void>;
  onComplete: (message: string) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState(
    categories.find((item) => item.is_active)?.id ?? '',
  );
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
  const [message, setMessage] = useState('');
  const [createdExpense, setCreatedExpense] = useState<ExpenseRecord>();
  const [proofSaved, setProofSaved] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createdExpense) return;
    setSaving(true);
    setMessage('');
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
      setCreatedExpense(expense);
      setMessage('Borrador creado. Ahora puedes adjuntar su comprobante.');
      await onDraftCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      eyebrow="Captura guiada"
      onClose={onClose}
      prefix="expenses"
      title="Registrar gasto"
      wide
    >
      {!createdExpense ? (
        <form className="expenses-form" onSubmit={(event) => void submit(event)}>
          {message ? <div className="expenses-inline-alert">{message}</div> : null}
          <div aria-label="Progreso de captura" className="financial-capture-progress">
            <strong>1. Datos</strong>
            <span>2. Comprobante</span>
          </div>
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
            <Field hint="Opcional" label="Proveedor">
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
            <Field hint="Opcional" label="Fecha de vencimiento">
              <input
                className="input"
                min={expenseDate}
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </Field>
            <Field hint="Opcional" label="N.º de factura">
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
              <Select
                onChange={(event) => setCurrencyCode(event.target.value)}
                value={currencyCode}
              >
                <option value="USD">USD</option>
                <option value="VES">VES</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>
          </div>
          <div className="expenses-form-grid">
            <Field hint="Puede completarse luego" label="Método de pago">
              <input
                className="input"
                onChange={(event) => setPaymentMethod(event.target.value)}
                placeholder="Transferencia, efectivo…"
                value={paymentMethod}
              />
            </Field>
            <Field hint="Opcional" label="Referencia">
              <input
                className="input"
                onChange={(event) => setPaymentReference(event.target.value)}
                value={paymentReference}
              />
            </Field>
          </div>
          <Field hint="Opcional" label="Notas">
            <textarea
              className="textarea"
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              value={notes}
            />
          </Field>
          <div className="expenses-form__actions financial-capture-footer">
            <Button disabled={saving || !categoryId || !description || !amount} type="submit">
              {saving ? 'Guardando…' : 'Continuar al comprobante'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="expenses-form financial-capture-proof-step">
          <div aria-label="Progreso de captura" className="financial-capture-progress">
            <span>1. Datos</span>
            <strong>2. Comprobante</strong>
          </div>
          {message ? <div className="financial-capture-summary">{message}</div> : null}
          <div className="financial-capture-summary">
            <span>Borrador creado</span>
            <strong>{createdExpense.description}</strong>
            <small>
              {createdExpense.amount} {createdExpense.currency_code}
            </small>
          </div>
          <PrivateDocumentUploader
            defaultDocumentType="invoice"
            description="JPEG, PNG, WebP o PDF. También admite otros documentos privados. Máximo 20 MB."
            documentTypes={[
              { value: 'invoice', label: 'Factura' },
              { value: 'receipt', label: 'Recibo' },
              { value: 'quote', label: 'Cotización' },
              { value: 'support', label: 'Soporte' },
              { value: 'other', label: 'Otro' },
            ]}
            onUploaded={async () => {
              setProofSaved(true);
              setMessage('Comprobante guardado de forma privada.');
              await onDraftCreated();
            }}
            path={`/v1/condominiums/${condominiumId}/expenses/${createdExpense.id}/attachments`}
            session={session}
            title="Adjuntar comprobante"
          />
          <div className="expenses-form__actions financial-capture-footer">
            <Button
              onClick={() =>
                void onComplete(
                  proofSaved ? 'Gasto y comprobante guardados.' : 'Borrador de gasto guardado.',
                )
              }
              type="button"
            >
              Finalizar registro
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
