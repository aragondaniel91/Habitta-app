import { useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid } from '../../components/FormLayout';
import { Button, Field, Select } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import type { ChargeConcept, ReceivableUnit } from '../../lib/receivables';

type Installment = { dueDate: string; amount: string };
type Preview = {
  count: number;
  total: string;
  currencyCode: string;
  valid?: { unit_id: string; unit_code: string; legal_owner: string; amount: string }[];
  blockers?: { unit_id: string; unit_code?: string; error: string }[];
};
type Props = {
  condominiumId: string;
  session: Session;
  units: ReceivableUnit[];
  concepts: ChargeConcept[];
  selectedCurrency: string;
  buildingNameById: Record<string, string>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
};
const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const dateAfter = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function ChargeInstallmentPlanDrawer(props: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const active = props.units.filter((unit) => unit.status !== 'inactive');
  const [selected, setSelected] = useState<string[]>([]);
  const [building, setBuilding] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'single' | 'plan'>('single');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState(3);
  const [cadence, setCadence] = useState<'weekly' | 'biweekly' | 'monthly' | 'custom'>('monthly');
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const filtered = useMemo(
    () =>
      active.filter(
        (unit) =>
          (!building || unit.building_id === building) &&
          unit.code.toLowerCase().includes(query.toLowerCase()),
      ),
    [active, building, query],
  );
  const resetDraft = () => {
    setPreview(null);
    setIdempotencyKey(crypto.randomUUID());
  };
  const updateSelection = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
    resetDraft();
  };
  const buildSchedule = () => {
    const value = Number(amount);
    if (!(value > 0) || count < 1) return;
    const base = Math.floor((value * 100) / count) / 100;
    const first = today();
    // Custom starts with a neutral monthly draft; every generated due date remains editable.
    const days = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 30;
    setInstallments(
      Array.from({ length: count }, (_, index) => ({
        dueDate: dateAfter(first, days * (index + 1)),
        amount: money(index === count - 1 ? value - base * (count - 1) : base),
      })),
    );
  };
  const payload = () => {
    const dueDate =
      formRef.current?.elements.namedItem('plan-due') instanceof HTMLInputElement
        ? (formRef.current.elements.namedItem('plan-due') as HTMLInputElement).value
        : '';
    return {
      conceptId:
        (formRef.current?.elements.namedItem('plan-concept') as HTMLSelectElement | null)?.value ??
        '',
      name:
        (formRef.current?.elements.namedItem('plan-name') as HTMLInputElement | null)?.value ?? '',
      currencyCode:
        (formRef.current?.elements.namedItem('plan-currency') as HTMLSelectElement | null)?.value ??
        'USD',
      issueDate:
        (formRef.current?.elements.namedItem('plan-issue') as HTMLInputElement | null)?.value ??
        today(),
      dueDate,
      fixedAmount: amount,
      rows: selected.map((unitId) => ({ unitId })),
      ...(mode === 'single' ? { distributionMethod: 'fixed_per_unit' as const } : {}),
      installments: mode === 'single' ? [{ dueDate, amount }] : installments,
      idempotencyKey,
    };
  };
  const previewPlan = async () => {
    if (mode === 'plan' && selected.length > 100) {
      setError(
        'El plan de cuotas admite hasta 100 unidades. Para todas las unidades activas usa el lote extraordinario original.',
      );
      return;
    }
    const body = payload();
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<Preview>(
        `/v1/condominiums/${props.condominiumId}/${mode === 'plan' ? 'charge-installment-plans' : 'charge-batches'}/preview`,
        props.session,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setPreview({ ...result, valid: result.valid ?? [], blockers: result.blockers ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo validar la publicación.');
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    if (!preview || preview.blockers?.length) return;
    const body = payload();
    setBusy(true);
    setError('');
    try {
      if (mode === 'plan')
        await apiRequest(
          `/v1/condominiums/${props.condominiumId}/charge-installment-plans/publish`,
          props.session,
          { method: 'POST', body: JSON.stringify(body) },
        );
      else
        await apiRequest(
          `/v1/condominiums/${props.condominiumId}/charge-batches/commit`,
          props.session,
          {
            method: 'POST',
            body: JSON.stringify({
              ...body,
              distributionMethod: 'fixed_per_unit',
              fixedAmount: body.fixedAmount,
              rows: body.rows,
            }),
          },
        );
      await props.onRefresh();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar el cargo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      eyebrow="Nueva cuota"
      onClose={props.onClose}
      prefix="receivables"
      title="Cargo puntual o plan de cuotas"
      wide
    >
      <p className="receivables-drawer-intro">
        Selecciona destinatarios reales antes de publicar. El plan conserva un único cargo original
        por unidad y solo propone su calendario de pago.
      </p>
      {error ? (
        <div className="receivables-action-feedback" role="alert">
          {error}
        </div>
      ) : null}
      {!preview ? (
        <form
          className="receivables-form ux-form"
          onChange={resetDraft}
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === 'plan' && !installments.length) buildSchedule();
            else void previewPlan();
          }}
        >
          <FormGrid>
            <Field label="Modalidad">
              <Select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as 'single' | 'plan');
                  setInstallments([]);
                  resetDraft();
                }}
              >
                <option value="single">Pago único</option>
                <option value="plan">Proponer plan de cuotas</option>
              </Select>
            </Field>
            <Field label="Concepto">
              <Select name="plan-concept" required>
                <option value="">Selecciona un concepto</option>
                {props.concepts
                  .filter((x) => x.is_active !== false)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </FormGrid>
          <Field label="Concepto / nombre del cargo">
            <input
              className="input"
              name="plan-name"
              required
              placeholder="Ej. Fondo extraordinario"
            />
          </Field>
          <FormGrid>
            <Field label="Monto original por unidad">
              <input
                className="input"
                inputMode="decimal"
                onChange={(e) => {
                  setAmount(e.target.value);
                  setInstallments([]);
                }}
                pattern="^(0|[1-9][0-9]{0,15})(\\.[0-9]{1,2})?$"
                required
                value={amount}
              />
            </Field>
            <Field label="Moneda">
              <Select defaultValue={props.selectedCurrency || 'USD'} name="plan-currency">
                <option>USD</option>
                <option>VES</option>
              </Select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Emisión">
              <input
                className="input"
                defaultValue={today()}
                name="plan-issue"
                required
                type="date"
              />
            </Field>
            <Field label="Vencimiento del cargo original">
              <input className="input" name="plan-due" required type="date" />
            </Field>
          </FormGrid>
          <Field label="Destinatarios">
            <Select value={building} onChange={(e) => setBuilding(e.target.value)}>
              <option value="">Todas las torres</option>
              {[...new Set(active.map((u) => u.building_id).filter(Boolean))].map((id) => (
                <option key={id} value={id!}>
                  {props.buildingNameById[id!] ?? 'Torre'}
                </option>
              ))}
            </Select>
          </Field>
          <input
            aria-label="Buscar unidad"
            className="input"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar unidad"
            value={query}
          />
          <FormActions>
            <Button
              onClick={() => {
                setSelected(active.map((unit) => unit.id));
                resetDraft();
              }}
              type="button"
              variant="secondary"
            >
              Seleccionar todas las activas ({active.length})
            </Button>
            <Button
              onClick={() => {
                setSelected((current) => [
                  ...new Set([...current, ...filtered.map((unit) => unit.id)]),
                ]);
                resetDraft();
              }}
              type="button"
              variant="secondary"
            >
              Seleccionar filtradas ({filtered.length})
            </Button>
            <Button
              onClick={() => {
                setSelected([]);
                resetDraft();
              }}
              type="button"
              variant="ghost"
            >
              Limpiar selección
            </Button>
          </FormActions>
          <div
            className="receivables-unit-selector"
            role="group"
            aria-label="Unidades destinatarias"
          >
            {filtered.map((unit) => (
              <label key={unit.id}>
                <input
                  checked={selected.includes(unit.id)}
                  onChange={() => updateSelection(unit.id)}
                  type="checkbox"
                />{' '}
                {unit.code}
              </label>
            ))}
          </div>
          <p>
            {selected.length} unidades seleccionadas:{' '}
            {active
              .filter((u) => selected.includes(u.id))
              .map((u) => u.code)
              .join(', ') || 'ninguna'}
          </p>
          {mode === 'plan' && selected.length > 100 ? (
            <div className="receivables-action-feedback" role="alert">
              Este plan no puede publicarse para {selected.length} unidades: el límite seguro es
              100. No se omitirá ninguna unidad; usa el lote extraordinario original para todas las
              activas o reduce la selección.
            </div>
          ) : null}
          {mode === 'plan' ? (
            <>
              <FormGrid>
                <Field label="Número de cuotas">
                  <input
                    className="input"
                    max={60}
                    min={1}
                    onChange={(e) => {
                      setCount(Number(e.target.value));
                      setInstallments([]);
                    }}
                    type="number"
                    value={count}
                  />
                </Field>
                <Field label="Frecuencia">
                  <Select
                    value={cadence}
                    onChange={(e) => {
                      setCadence(e.target.value as typeof cadence);
                      setInstallments([]);
                    }}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="custom">Fechas personalizadas</option>
                  </Select>
                </Field>
              </FormGrid>
              <Button onClick={buildSchedule} type="button" variant="secondary">
                Generar calendario editable
              </Button>
              {installments.map((item, index) => (
                <FormGrid key={index}>
                  <Field label={`Cuota ${index + 1}`}>
                    <input
                      className="input"
                      onChange={(e) =>
                        setInstallments((all) =>
                          all.map((x, i) => (i === index ? { ...x, amount: e.target.value } : x)),
                        )
                      }
                      value={item.amount}
                    />
                  </Field>
                  <Field label="Fecha">
                    <input
                      className="input"
                      onChange={(e) =>
                        setInstallments((all) =>
                          all.map((x, i) => (i === index ? { ...x, dueDate: e.target.value } : x)),
                        )
                      }
                      type="date"
                      value={item.dueDate}
                    />
                  </Field>
                </FormGrid>
              ))}
            </>
          ) : null}
          <FormActions>
            <Button
              disabled={
                busy ||
                !selected.length ||
                (mode === 'plan' && (!installments.length || selected.length > 100))
              }
              type="submit"
            >
              {busy ? 'Validando…' : 'Previsualizar publicación'}
            </Button>
          </FormActions>
        </form>
      ) : (
        <div className="receivables-preview-card">
          <strong>
            {preview.count} cargos originales · {preview.total} {preview.currencyCode}
          </strong>
          <p>
            {mode === 'plan'
              ? 'Se creará un cargo original y una propuesta pendiente por cada unidad.'
              : 'Se creará un cargo original por cada unidad, sin propuesta de plan.'}
          </p>
          {(preview.valid ?? []).map((row) => (
            <p key={row.unit_id}>
              {row.unit_code}: {row.amount} · Propietario legal: {row.legal_owner}
            </p>
          ))}
          {(preview.blockers ?? []).map((row) => (
            <p key={row.unit_id} role="alert">
              {row.unit_code ?? row.unit_id}: {row.error}
            </p>
          ))}
          <FormActions>
            <Button
              onClick={() => {
                setPreview(null);
                setIdempotencyKey(crypto.randomUUID());
              }}
              variant="secondary"
            >
              Editar
            </Button>
            <Button disabled={busy || !!preview.blockers?.length} onClick={() => void publish()}>
              {busy ? 'Publicando…' : 'Confirmar publicación'}
            </Button>
          </FormActions>
        </div>
      )}
    </Drawer>
  );
}
