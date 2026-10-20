import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Dialog, DialogBody, DialogFooter } from '../../../components/Dialog';
import { Button, Field, Select } from '../../../components/ui';
import { paymentApi, paymentProof } from '../api';
import { paymentProofFileError } from '../proof-file';
import { PaymentProofPreview } from './PaymentProofPreview';
import type {
  AllocationInput,
  ChargeConcept,
  Payment,
  PaymentAllocationIntent,
  PaymentMethod,
  Receivable,
} from '../types';
import type { PaymentUnitOption } from './PaymentCaptureDrawer';
import './resident-payment-wizard.css';

type Props = {
  condominiumId: string;
  session: Session;
  units: PaymentUnitOption[];
  receivables: Receivable[];
  methods: PaymentMethod[];
  concepts?: ChargeConcept[];
  context?: 'resident' | 'administrator';
  payment?: Payment;
  onClose: () => void;
  onDraftCreated: () => Promise<void>;
  onComplete: (message: string) => Promise<void>;
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// All resident allocations use exact minor units; only API boundaries use decimal strings.
const toCents = (value: string | number | null | undefined): number | null => {
  const input = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ''] = input.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
};
const money = (cents: number) => (cents / 100).toFixed(2);
const categoryLabels: Record<ChargeConcept['category'], string> = {
  regular_dues: 'Condominio y gastos comunes',
  extraordinary_dues: 'Cuotas extraordinarias',
  service: 'Servicios',
  penalty: 'Multas',
  adjustment: 'Ajustes',
  opening_balance: 'Saldos iniciales',
  other: 'Otros',
};

/** Resident-facing intent capture. It persists a proposal only; review is still the sole ledger writer. */
export function ResidentPaymentWizard({
  condominiumId,
  session,
  units,
  receivables,
  methods,
  concepts = [],
  context = 'resident',
  payment,
  onClose,
  onDraftCreated,
  onComplete,
}: Props) {
  const key = useRef(crypto.randomUUID());
  const [step, setStep] = useState(1);
  const [unitId, setUnitId] = useState(
    payment?.unit_id ?? (units.length === 1 ? (units[0]?.id ?? '') : ''),
  );
  const [currency, setCurrency] = useState(payment?.original_currency_code ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [conceptFilter, setConceptFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [chargeSearch, setChargeSearch] = useState('');
  const [amountMode, setAmountMode] = useState<'full' | 'partial' | 'per_charge'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [perChargeAmounts, setPerChargeAmounts] = useState<Record<string, string>>({});
  const [methodId, setMethodId] = useState(payment?.payment_method_id ?? '');
  const [payerName, setPayerName] = useState(payment?.payer_name ?? '');
  const [paymentDate, setPaymentDate] = useState(payment?.payment_date ?? today());
  const [reference, setReference] = useState(payment?.reference ?? '');
  const [notes, setNotes] = useState(payment?.notes ?? '');
  const [proof, setProof] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!payment) return undefined;
    let active = true;
    paymentApi<PaymentAllocationIntent | null>(
      `/v1/condominiums/${condominiumId}/payments/${payment.id}/allocation-intent`,
      session,
    )
      .then((intent) => {
        if (!active || !intent || !Array.isArray(intent.proposals)) return;
        setSelected(intent.proposals.map((proposal) => proposal.receivable_item_id));
        setPerChargeAmounts(
          Object.fromEntries(
            intent.proposals.map((proposal) => [
              proposal.receivable_item_id,
              proposal.payment_amount,
            ]),
          ),
        );
        const restoredCents = intent.proposals.reduce<number | null>((total, proposal) => {
          const portion = toCents(proposal.payment_amount);
          return total === null || portion === null ? null : total + portion;
        }, 0);
        if (restoredCents === null || !Number.isSafeInteger(restoredCents)) {
          setError('La propuesta guardada contiene un monto inválido.');
          return;
        }
        setCustomAmount(money(restoredCents));
        setAmountMode('per_charge');
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : 'No se pudo cargar la propuesta guardada.',
          );
      });
    return () => {
      active = false;
    };
  }, [condominiumId, payment, session]);

  const available = useMemo(
    () =>
      receivables.filter(
        (item) => item.unit_id === unitId && (toCents(item.outstanding_amount) ?? 0) > 0,
      ),
    [receivables, unitId],
  );
  const currencies = useMemo(
    () => [...new Set(available.map((item) => item.currency_code))].sort(),
    [available],
  );
  const choices = available.filter((item) => item.currency_code === currency);
  const conceptById = useMemo(
    () => new Map(concepts.map((concept) => [concept.id, concept])),
    [concepts],
  );
  const usedConcepts = useMemo(() => {
    const ids = new Set(choices.map((item) => item.concept_id).filter(Boolean));
    return concepts
      .filter((concept) => ids.has(concept.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [choices, concepts]);
  const usedCategories = [...new Set(usedConcepts.map((concept) => concept.category))];
  const availableConcepts = usedConcepts.filter(
    (concept) => !categoryFilter || concept.category === categoryFilter,
  );
  const visibleCharges = choices.filter((item) => {
    const concept = item.concept_id ? conceptById.get(item.concept_id) : undefined;
    if (categoryFilter && concept?.category !== categoryFilter) return false;
    if (conceptFilter && item.concept_id !== conceptFilter) return false;
    const query = chargeSearch.trim().toLocaleLowerCase('es');
    return (
      !query || `${item.description} ${concept?.name ?? ''}`.toLocaleLowerCase('es').includes(query)
    );
  });
  const picked = choices.filter((item) => selected.includes(item.id));
  const fullTotalCents = picked.reduce(
    (sum, item) => sum + (toCents(item.outstanding_amount) ?? 0),
    0,
  );
  const portions = picked.map((item) => ({
    item,
    cents:
      amountMode === 'per_charge'
        ? toCents(perChargeAmounts[item.id] ?? money(toCents(item.outstanding_amount) ?? 0))
        : toCents(item.outstanding_amount),
  }));
  const perChargeValid = portions.every(
    ({ item, cents }) =>
      cents !== null && cents > 0 && cents <= (toCents(item.outstanding_amount) ?? 0),
  );
  const proposedCents =
    amountMode === 'full'
      ? fullTotalCents
      : amountMode === 'partial'
        ? toCents(customAmount)
        : perChargeValid
          ? portions.reduce((total, { cents }) => total + (cents ?? 0), 0)
          : null;
  const allocations = useMemo<AllocationInput[]>(() => {
    let remaining = proposedCents ?? 0;
    if (proposedCents === null || !Number.isSafeInteger(proposedCents)) return [];
    return portions.flatMap(({ item, cents }) => {
      const amountCents =
        amountMode === 'per_charge'
          ? (cents ?? 0)
          : Math.min(remaining, toCents(item.outstanding_amount) ?? 0);
      remaining -= amountCents;
      return amountCents > 0
        ? [
            {
              receivableItemId: item.id,
              paymentAmount: money(amountCents),
              receivableAmount: money(amountCents),
              paymentCurrencyCode: currency,
              receivableCurrencyCode: currency,
              receivablePerPaymentRate: '1',
            },
          ]
        : [];
    });
  }, [amountMode, currency, picked, proposedCents, perChargeAmounts]);
  const selectedMethod = methods.find((item) => item.id === methodId);
  const compatibleMethods = methods.filter(
    (item) => item.is_active && item.currency_code === currency,
  );
  const amountValid =
    proposedCents !== null &&
    Number.isSafeInteger(fullTotalCents) &&
    proposedCents > 0 &&
    proposedCents <= fullTotalCents &&
    allocations.length > 0;
  const methodValid = Boolean(
    selectedMethod &&
    compatibleMethods.some((method) => method.id === selectedMethod.id) &&
    payerName.trim() &&
    paymentDate &&
    (!selectedMethod.requires_reference || reference.trim()) &&
    (!selectedMethod.requires_proof || proof || payment),
  );
  const canContinue =
    step === 1
      ? Boolean(unitId && currency && selected.length)
      : step === 2
        ? amountValid
        : step === 3
          ? methodValid
          : amountValid && methodValid;

  const advance = () => {
    setError('');
    if (!canContinue) {
      setError('Completa los datos obligatorios para continuar.');
      return;
    }
    setStep((value) => Math.min(4, value + 1));
  };
  const save = async (submit: boolean) => {
    if (!amountValid || !methodValid || saving || !selectedMethod) return;
    setSaving(true);
    setError('');
    try {
      const savedPayment = payment
        ? await paymentApi<Payment>(
            `/v1/condominiums/${condominiumId}/payments/${payment.id}`,
            session,
            {
              method: 'PATCH',
              body: JSON.stringify({
                paymentMethodId: methodId,
                paymentDate,
                originalAmount: money(proposedCents ?? 0),
                originalCurrencyCode: currency,
                payerName,
                reference,
                notes,
              }),
            },
          )
        : await paymentApi<Payment>(`/v1/condominiums/${condominiumId}/payments`, session, {
            method: 'POST',
            body: JSON.stringify({
              unitId,
              paymentMethodId: methodId,
              paymentDate,
              originalAmount: money(proposedCents ?? 0),
              originalCurrencyCode: currency,
              payerName,
              reference,
              notes,
              idempotencyKey: key.current,
            }),
          });
      // The endpoint records a draft proposal, never payment_allocations or ledger entries.
      await paymentApi(
        `/v1/condominiums/${condominiumId}/payments/${savedPayment.id}/allocation-intent`,
        session,
        {
          method: 'PUT',
          body: JSON.stringify({ allocations }),
        },
      );
      if (proof)
        await paymentProof(
          `/v1/condominiums/${condominiumId}/payments/${savedPayment.id}/proof`,
          session,
          proof,
        );
      await onDraftCreated();
      if (submit)
        await paymentApi(
          `/v1/condominiums/${condominiumId}/payments/${savedPayment.id}/submit`,
          session,
          { method: 'POST' },
        );
      await onComplete(
        submit
          ? 'Pago enviado a revisión. La propuesta de aplicación quedó guardada para administración; aún no se ha aplicado ningún cargo.'
          : 'Borrador guardado con su propuesta de aplicación. Aún no se ha aplicado ningún cargo.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el pago.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      closeDisabled={saving}
      description={
        context === 'administrator'
          ? 'Registra el pago en nombre de una unidad, selecciona sus cuotas y envía la propuesta a validación. La aprobación contable es independiente.'
          : 'Elige las obligaciones y envía una propuesta para revisión administrativa.'
      }
      eyebrow={context === 'administrator' ? 'Captura administrativa guiada' : 'Pago guiado'}
      onClose={onClose}
      size="lg"
      title={payment ? 'Corregir pago' : 'Registrar un pago'}
    >
      <DialogBody className="resident-payment-wizard">
        <ol aria-label="Progreso" className="resident-payment-wizard__steps">
          {['Unidad y cargos', 'Monto', 'Método', 'Confirmar'].map((label, index) => (
            <li
              aria-current={step === index + 1 ? 'step' : undefined}
              className={step === index + 1 ? 'is-current' : step > index + 1 ? 'is-done' : ''}
              key={label}
            >
              <span className="step-circle" aria-hidden="true">
                {index + 1}
              </span>
              <span className="step-label">{label}</span>
            </li>
          ))}
        </ol>
        {error ? (
          <p className="resident-payment-wizard__error" role="alert">
            {error}
          </p>
        ) : null}
        {step === 1 ? (
          <div className="resident-payment-wizard__grid">
            <Field label={context === 'administrator' ? 'Unidad del pago' : 'Unidad autorizada'}>
              <Select
                onChange={(event) => {
                  setUnitId(event.target.value);
                  setCurrency('');
                  setSelected([]);
                  setConceptFilter('');
                  setCategoryFilter('');
                  setChargeSearch('');
                  setAmountMode('full');
                  setCustomAmount('');
                  setPerChargeAmounts({});
                  setMethodId('');
                  setReference('');
                  setProof(undefined);
                }}
                value={unitId}
              >
                <option value="">Seleccionar unidad</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </Select>
            </Field>
            {unitId ? (
              <Field label="Moneda de los cargos">
                <Select
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setSelected([]);
                    setConceptFilter('');
                    setCategoryFilter('');
                    setChargeSearch('');
                    setAmountMode('full');
                    setCustomAmount('');
                    setPerChargeAmounts({});
                    setMethodId('');
                    setReference('');
                    setProof(undefined);
                  }}
                  value={currency}
                >
                  <option value="">Seleccionar moneda</option>
                  {currencies.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {currency ? (
              <section className="resident-payment-wizard__charges" aria-label="Cargos publicados">
                <div className="resident-payment-wizard__charges-heading">
                  <h3>Selecciona uno o más cargos</h3>
                  <span>{selected.length} seleccionada(s)</span>
                </div>
                <div className="resident-payment-wizard__charge-filters">
                  <Field label="Tipo de cargo">
                    <Select
                      value={categoryFilter}
                      onChange={(event) => {
                        setCategoryFilter(event.target.value);
                        setConceptFilter('');
                      }}
                    >
                      <option value="">Todos los tipos</option>
                      {usedCategories.map((category) => (
                        <option key={category} value={category}>
                          {categoryLabels[category]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Concepto">
                    <Select
                      value={conceptFilter}
                      onChange={(event) => setConceptFilter(event.target.value)}
                    >
                      <option value="">Todos los conceptos</option>
                      {availableConcepts.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Buscar cuota">
                    <input
                      className="input"
                      onChange={(event) => setChargeSearch(event.target.value)}
                      placeholder="Descripción o concepto"
                      type="search"
                      value={chargeSearch}
                    />
                  </Field>
                </div>
                {Array.from(
                  visibleCharges.reduce((groups, item) => {
                    const concept = item.concept_id ? conceptById.get(item.concept_id) : undefined;
                    const groupName = concept ? categoryLabels[concept.category] : 'Otros cargos';
                    const rows = groups.get(groupName) ?? [];
                    rows.push(item);
                    groups.set(groupName, rows);
                    return groups;
                  }, new Map<string, Receivable[]>()),
                ).map(([groupName, items]) => (
                  <div className="resident-payment-wizard__charge-group" key={groupName}>
                    <h4>{groupName}</h4>
                    {items.map((item) => {
                      const concept = item.concept_id
                        ? conceptById.get(item.concept_id)
                        : undefined;
                      return (
                        <label key={item.id}>
                          <input
                            checked={selected.includes(item.id)}
                            onChange={() =>
                              setSelected((current) =>
                                current.includes(item.id)
                                  ? current.filter((id) => id !== item.id)
                                  : [...current, item.id],
                              )
                            }
                            type="checkbox"
                          />
                          <span>
                            <strong>{item.description}</strong>
                            <small>
                              {concept ? <em>{concept.name} · </em> : null}
                              Pendiente {item.outstanding_amount} {item.currency_code}
                              {item.due_date ? ` · Vence ${item.due_date}` : ''}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
                {!choices.length ? (
                  <p>No hay cargos publicados pendientes para esta unidad y moneda.</p>
                ) : !visibleCharges.length ? (
                  <p>
                    No hay cuotas que coincidan con los filtros. Cambiar los filtros no elimina tus
                    selecciones.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
        {step === 2 ? (
          <section className="resident-payment-wizard__amount">
            <h3>¿Cuánto deseas pagar?</h3>
            <div className="resident-payment-wizard__choices">
              {[
                ['full', 'Pagar todo', 'Cubrir el saldo completo de todas las cuotas elegidas.'],
                [
                  'partial',
                  'Abonar un total',
                  'Escribes un monto total; Habitta lo distribuye entre las cuotas en el orden mostrado.',
                ],
                [
                  'per_charge',
                  'Personalizar por cuota',
                  'Decides exactamente cuánto pagar de cada cuota.',
                ],
              ].map(([value, label, description]) => (
                <label key={value}>
                  <input
                    checked={amountMode === value}
                    name="amount-mode"
                    onChange={() => setAmountMode(value as typeof amountMode)}
                    type="radio"
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </div>
            {amountMode === 'partial' ? (
              <Field label={`Abono total a distribuir (${currency})`}>
                <input
                  className="input"
                  inputMode="decimal"
                  onChange={(event) => setCustomAmount(event.target.value)}
                  placeholder="0.00"
                  value={customAmount}
                />
              </Field>
            ) : null}
            {amountMode === 'per_charge' ? (
              <section
                className="resident-payment-wizard__per-charge"
                aria-label="Importes por cuota"
              >
                <div className="resident-payment-wizard__section-heading">
                  <h3>Define el monto por cuota</h3>
                  <p>Puedes pagar una cuota completa y otra parcialmente.</p>
                </div>
                {picked.map((item) => {
                  const outstanding = toCents(item.outstanding_amount) ?? 0;
                  const entered = perChargeAmounts[item.id] ?? money(outstanding);
                  const cents = toCents(entered);
                  const invalid = cents === null || cents <= 0 || cents > outstanding;
                  return (
                    <div className="resident-payment-wizard__per-charge-row" key={item.id}>
                      <div className="resident-payment-wizard__charge-identity">
                        <span className="resident-payment-wizard__charge-icon" aria-hidden="true">
                          ▤
                        </span>
                        <div className="resident-payment-wizard__charge-info">
                          <strong>{item.description}</strong>
                          <small>
                            <span className="resident-payment-wizard__pending-tag">Pendiente</span>
                            {money(outstanding)} {currency}
                          </small>
                        </div>
                      </div>
                      <div className="resident-payment-wizard__charge-amount">
                        <Field label="Abono">
                          <input
                            aria-label={`Abono para ${item.description} (${currency})`}
                            aria-invalid={invalid}
                            className="input"
                            inputMode="decimal"
                            onChange={(event) =>
                              setPerChargeAmounts((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            value={entered}
                          />
                        </Field>
                        <span
                          className="resident-payment-wizard__currency-suffix"
                          aria-hidden="true"
                        >
                          {currency}
                        </span>
                      </div>
                      {invalid ? (
                        <p role="alert">
                          Ingresa un valor mayor a cero, con máximo dos decimales, sin superar su
                          saldo pendiente.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : null}
            <div className="resident-payment-wizard__preview">
              <h3>Vista previa</h3>
              <small>Propuesta para revisión · No cambia los saldos pendientes</small>
              {allocations.map((item) => {
                const charge = picked.find((value) => value.id === item.receivableItemId);
                return (
                  <p key={item.receivableItemId}>
                    <span>{charge?.description}</span>
                    <span>
                      {item.paymentAmount} {currency}
                    </span>
                  </p>
                );
              })}
              <b>
                <span>{allocations.length} cuota(s)</span>
                <span>
                  Total: {money(proposedCents ?? 0)} {currency}
                </span>
              </b>
              {proposedCents === null ? (
                <p role="alert">
                  {amountMode === 'per_charge'
                    ? 'Corrige los importes de cada cuota antes de continuar.'
                    : 'Introduce un monto válido con máximo dos decimales.'}
                </p>
              ) : null}
              {proposedCents !== null && proposedCents > fullTotalCents ? (
                <p role="alert">El monto no puede superar el pendiente seleccionado.</p>
              ) : null}
            </div>
          </section>
        ) : null}
        {step === 3 ? (
          <div className="resident-payment-wizard__grid">
            <Field label="Método compatible">
              <Select onChange={(event) => setMethodId(event.target.value)} value={methodId}>
                <option value="">Seleccionar método</option>
                {compatibleMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            {!compatibleMethods.length ? (
              <p className="resident-payment-wizard__note" role="status">
                No hay métodos habilitados para {currency}. Contacta a administración antes de
                registrar este pago.
              </p>
            ) : null}
            {selectedMethod?.instructions ? (
              <p className="resident-payment-wizard__note">{selectedMethod.instructions}</p>
            ) : null}
            <Field label="Fecha de pago">
              <input
                className="input"
                onChange={(event) => setPaymentDate(event.target.value)}
                type="date"
                value={paymentDate}
              />
            </Field>
            <Field label="Nombre del pagador">
              <input
                className="input"
                onChange={(event) => setPayerName(event.target.value)}
                value={payerName}
              />
            </Field>
            <Field
              hint="Número de confirmación de la transferencia u operación bancaria. No es el número interno del pago en Habitta."
              label={`Referencia${selectedMethod?.requires_reference ? ' (obligatoria)' : ' (opcional)'}`}
            >
              <input
                className="input"
                onChange={(event) => setReference(event.target.value)}
                value={reference}
              />
            </Field>
            <Field
              label={`Comprobante${selectedMethod?.requires_proof ? ' (obligatorio)' : ' (opcional)'}`}
            >
              <div className="resident-payment-wizard__upload">
                <label className="resident-payment-wizard__upload-zone">
                  <input
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    aria-label="Seleccionar comprobante"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      const validationError = file ? paymentProofFileError(file) : null;
                      setError(validationError ?? '');
                      setProof(validationError ? undefined : file);
                      event.currentTarget.value = '';
                    }}
                    type="file"
                  />
                  <span className="resident-payment-wizard__upload-zone-label">
                    {proof
                      ? 'Cambiar archivo seleccionado'
                      : 'Seleccionar imagen o PDF del comprobante'}
                  </span>
                </label>
                {proof ? (
                  <div className="resident-payment-wizard__upload-commands">
                    <span className="resident-payment-wizard__file-name" role="status">
                      Comprobante seleccionado: {proof.name}
                    </span>
                    <button type="button" onClick={() => setProof(undefined)}>
                      Quitar selección
                    </button>
                  </div>
                ) : null}
                {payment ? (
                  <div className="resident-payment-wizard__existing-proof">
                    <small>Comprobante guardado actualmente</small>
                    <PaymentProofPreview
                      condominiumId={condominiumId}
                      paymentId={payment.id}
                      session={session}
                    />
                    <small>
                      Al guardar un comprobante nuevo, el anterior queda conservado en el historial.
                    </small>
                  </div>
                ) : null}
              </div>
            </Field>
            <Field
              hint={
                context === 'administrator'
                  ? 'Información adicional para el equipo revisor; no reemplaza el comprobante ni la referencia bancaria.'
                  : 'Descripción opcional para explicar tu pago; la administración podrá verla.'
              }
              label="Información adicional (opcional)"
            >
              <textarea
                className="input"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </Field>
          </div>
        ) : null}
        {step === 4 ? (
          <section className="resident-payment-wizard__preview">
            <h3>Confirma tu propuesta</h3>
            <p>
              {units.find((unit) => unit.id === unitId)?.label} · {selectedMethod?.display_name}
            </p>
            <div className="resident-payment-wizard__allocation-summary">
              {allocations.map((allocation) => (
                <p key={allocation.receivableItemId}>
                  <span>
                    {picked.find((item) => item.id === allocation.receivableItemId)?.description}
                  </span>
                  <strong>
                    {allocation.paymentAmount} {currency}
                  </strong>
                </p>
              ))}
              <div className="resident-payment-wizard__allocation-total">
                <span>{allocations.length} cuota(s)</span>
                <strong>
                  Total: {money(proposedCents ?? 0)} {currency}
                </strong>
              </div>
            </div>
            <p>
              Guardar o enviar conserva una intención de aplicación para revisión; ningún saldo
              cambia hasta que administración apruebe el pago.
              {context === 'administrator'
                ? ' Si registras el pago, la política de aprobación independiente puede exigir otro revisor.'
                : ''}
            </p>
          </section>
        ) : null}
      </DialogBody>
      <DialogFooter>
        {step > 1 ? (
          <Button
            disabled={saving}
            onClick={() => setStep((value) => value - 1)}
            type="button"
            variant="secondary"
          >
            Atrás
          </Button>
        ) : (
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
        )}
        {step < 4 ? (
          <Button onClick={advance} type="button">
            Continuar
          </Button>
        ) : (
          <>
            <Button
              disabled={saving}
              onClick={() => void save(false)}
              type="button"
              variant="secondary"
            >
              {saving ? 'Guardando…' : 'Guardar borrador'}
            </Button>
            <Button disabled={saving} onClick={() => void save(true)} type="button">
              {saving ? 'Enviando…' : 'Enviar a revisión'}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}
