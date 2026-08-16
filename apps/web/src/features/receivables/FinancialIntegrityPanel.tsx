import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, Field, Select } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { formatDashboardDate } from '../../lib/dashboard';

type CurrencyPolicy = {
  condominium_id: string;
  accounting_currency_code: string;
  accepted_currency_codes: string[];
  conversion_mode: 'disabled' | 'approved_rates_only';
  default_rate_source: string | null;
  max_rate_age_days: number;
};

type ExchangeRate = {
  id: string;
  from_currency_code: string;
  to_currency_code: string;
  rate: string | number;
  effective_on: string;
  rate_at: string;
  source: string;
  source_reference: string | null;
  status: 'approved' | 'superseded';
};

type SolvencyPolicy = {
  condominium_id: string;
  balance_basis: 'outstanding' | 'overdue';
  grace_days: number;
  tolerance_per_currency: string | number;
  certificate_validity_days: number;
};

type Props = {
  condominiumId: string;
  session: Session;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const toLocalDateTimeInput = (iso: string) => {
  const value = new Date(iso);
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
};

export function FinancialIntegrityPanel({ condominiumId, session }: Props) {
  const [open, setOpen] = useState(false);
  const [currencyPolicy, setCurrencyPolicy] = useState<CurrencyPolicy | null>(null);
  const [solvencyPolicy, setSolvencyPolicy] = useState<SolvencyPolicy | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [accountingCurrency, setAccountingCurrency] = useState('VES');
  const [acceptedCurrencies, setAcceptedCurrencies] = useState('VES, USD');
  const [conversionMode, setConversionMode] = useState<'disabled' | 'approved_rates_only'>(
    'disabled',
  );
  const [defaultSource, setDefaultSource] = useState('BCV');
  const [maxRateAgeDays, setMaxRateAgeDays] = useState('7');
  const [balanceBasis, setBalanceBasis] = useState<'outstanding' | 'overdue'>('outstanding');
  const [graceDays, setGraceDays] = useState('0');
  const [tolerance, setTolerance] = useState('0.00');
  const [validityDays, setValidityDays] = useState('30');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('VES');
  const [rate, setRate] = useState('');
  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [rateAt, setRateAt] = useState(nowIso());
  const [source, setSource] = useState('BCV');
  const [sourceReference, setSourceReference] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const normalizedAccepted = useMemo(
    () =>
      acceptedCurrencies
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    [acceptedCurrencies],
  );

  const load = async () => {
    setMessage('');
    try {
      const [currencyRows, solvencyRows, nextRates] = await Promise.all([
        apiRequest<CurrencyPolicy[]>(`/v1/condominiums/${condominiumId}/currency-policy`, session),
        apiRequest<SolvencyPolicy[]>(`/v1/condominiums/${condominiumId}/solvency-policy`, session),
        apiRequest<ExchangeRate[]>(`/v1/condominiums/${condominiumId}/exchange-rates`, session),
      ]);
      const nextCurrency = currencyRows[0] ?? null;
      const nextSolvency = solvencyRows[0] ?? null;
      setCurrencyPolicy(nextCurrency);
      setSolvencyPolicy(nextSolvency);
      setRates(nextRates);
      if (nextCurrency) {
        setAccountingCurrency(nextCurrency.accounting_currency_code);
        setAcceptedCurrencies(nextCurrency.accepted_currency_codes.join(', '));
        setConversionMode(nextCurrency.conversion_mode);
        setDefaultSource(nextCurrency.default_rate_source ?? '');
        setMaxRateAgeDays(String(nextCurrency.max_rate_age_days));
      }
      if (nextSolvency) {
        setBalanceBasis(nextSolvency.balance_basis);
        setGraceDays(String(nextSolvency.grace_days));
        setTolerance(String(nextSolvency.tolerance_per_currency));
        setValidityDays(String(nextSolvency.certificate_validity_days));
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo cargar la política financiera.',
      );
    }
  };

  useEffect(() => {
    void load();
  }, [condominiumId]);

  const saveCurrencyPolicy = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('currency');
    setMessage('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/currency-policy`, session, {
        method: 'PUT',
        body: JSON.stringify({
          accountingCurrencyCode: accountingCurrency.toUpperCase(),
          acceptedCurrencyCodes: normalizedAccepted,
          conversionMode,
          defaultRateSource: defaultSource.trim() || undefined,
          maxRateAgeDays: Number(maxRateAgeDays),
        }),
      });
      setMessage(
        'Política de moneda actualizada. Ningún saldo histórico fue convertido o revalorizado.',
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo guardar la política de moneda.',
      );
    } finally {
      setBusy('');
    }
  };

  const saveSolvencyPolicy = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('solvency');
    setMessage('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/solvency-policy`, session, {
        method: 'PUT',
        body: JSON.stringify({
          balanceBasis,
          graceDays: Number(graceDays),
          tolerancePerCurrency: Number(tolerance),
          certificateValidityDays: Number(validityDays),
        }),
      });
      setMessage(
        'Criterio de solvencia actualizado para futuras evaluaciones. Los certificados emitidos permanecen inmutables.',
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo guardar la política de solvencia.',
      );
    } finally {
      setBusy('');
    }
  };

  const saveRate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('rate');
    setMessage('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/exchange-rates`, session, {
        method: 'POST',
        body: JSON.stringify({
          fromCurrencyCode: fromCurrency.toUpperCase(),
          toCurrencyCode: toCurrency.toUpperCase(),
          rate,
          effectiveOn,
          rateAt,
          source: source.trim(),
          sourceReference: sourceReference.trim() || undefined,
        }),
      });
      setRate('');
      setSourceReference('');
      setRateAt(nowIso());
      setMessage(
        'Tasa aprobada y congelada. Las transacciones futuras pueden referenciar este snapshot; las históricas no cambian.',
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar la tasa aprobada.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="financial-integrity-panel">
      <div className="account-statement-section-heading">
        <div>
          <strong>Política financiera del condominio</strong>
          <span>
            Monedas, tasas aprobadas y criterio de solvencia sin conversiones silenciosas.
          </span>
        </div>
        <Button onClick={() => setOpen((current) => !current)} size="sm" variant="secondary">
          {open ? 'Ocultar política' : 'Configurar política'}
        </Button>
      </div>

      <div className="financial-integrity-summary">
        <div>
          <span>Moneda contable</span>
          <strong>{currencyPolicy?.accounting_currency_code ?? 'Sin configurar'}</strong>
        </div>
        <div>
          <span>Conversión</span>
          <strong>
            {currencyPolicy?.conversion_mode === 'approved_rates_only'
              ? 'Solo tasas aprobadas'
              : 'Desactivada'}
          </strong>
        </div>
        <div>
          <span>Solvencia</span>
          <strong>
            {solvencyPolicy?.balance_basis === 'overdue' ? 'Saldo vencido' : 'Saldo pendiente'}
          </strong>
        </div>
      </div>

      {message ? (
        <div className="receivables-action-feedback" role="status">
          {message}
        </div>
      ) : null}

      {open ? (
        <div className="financial-integrity-config-grid">
          <form
            className="financial-integrity-card"
            onSubmit={(event) => void saveCurrencyPolicy(event)}
          >
            <div>
              <strong>Monedas y conversión</strong>
              <span>VES suele ser la moneda contable en Venezuela, pero Habitta no lo impone.</span>
            </div>
            <Field label="Moneda contable">
              <input
                maxLength={3}
                minLength={3}
                onChange={(event) => setAccountingCurrency(event.target.value.toUpperCase())}
                required
                value={accountingCurrency}
              />
            </Field>
            <Field label="Monedas aceptadas" hint="Sepáralas con comas. Ej. VES, USD, EUR">
              <input
                onChange={(event) => setAcceptedCurrencies(event.target.value)}
                required
                value={acceptedCurrencies}
              />
            </Field>
            <Field label="Conversión entre monedas">
              <Select
                onChange={(event) =>
                  setConversionMode(event.target.value as 'disabled' | 'approved_rates_only')
                }
                value={conversionMode}
              >
                <option value="disabled">Desactivada</option>
                <option value="approved_rates_only">Solo con tasas aprobadas</option>
              </Select>
            </Field>
            <Field
              label="Fuente sugerida"
              hint="BCV puede ser la fuente operativa, pero el backend es neutral y admite una fuente aprobada manualmente."
            >
              <input
                maxLength={120}
                onChange={(event) => setDefaultSource(event.target.value)}
                placeholder="BCV"
                value={defaultSource}
              />
            </Field>
            <Field label="Antigüedad máxima de una tasa">
              <input
                max="31"
                min="0"
                onChange={(event) => setMaxRateAgeDays(event.target.value)}
                required
                type="number"
                value={maxRateAgeDays}
              />
            </Field>
            <Button disabled={busy === 'currency'} type="submit">
              {busy === 'currency' ? 'Guardando…' : 'Guardar política de moneda'}
            </Button>
          </form>

          <form
            className="financial-integrity-card"
            onSubmit={(event) => void saveSolvencyPolicy(event)}
          >
            <div>
              <strong>Solvencia</strong>
              <span>
                El certificado se evalúa contra el ledger por moneda; nunca contra un total
                convertido.
              </span>
            </div>
            <Field label="Base del criterio">
              <Select
                onChange={(event) =>
                  setBalanceBasis(event.target.value as 'outstanding' | 'overdue')
                }
                value={balanceBasis}
              >
                <option value="outstanding">Todo saldo pendiente</option>
                <option value="overdue">Solo saldo vencido</option>
              </Select>
            </Field>
            <Field label="Días de gracia">
              <input
                max="365"
                min="0"
                onChange={(event) => setGraceDays(event.target.value)}
                required
                type="number"
                value={graceDays}
              />
            </Field>
            <Field
              label="Tolerancia por moneda"
              hint="Se aplica independientemente a USD, VES, EUR, etc."
            >
              <input
                min="0"
                onChange={(event) => setTolerance(event.target.value)}
                required
                step="0.01"
                type="number"
                value={tolerance}
              />
            </Field>
            <Field label="Vigencia del certificado (días)">
              <input
                max="365"
                min="1"
                onChange={(event) => setValidityDays(event.target.value)}
                required
                type="number"
                value={validityDays}
              />
            </Field>
            <Button disabled={busy === 'solvency'} type="submit">
              {busy === 'solvency' ? 'Guardando…' : 'Guardar criterio de solvencia'}
            </Button>
          </form>

          <form className="financial-integrity-card" onSubmit={(event) => void saveRate(event)}>
            <div>
              <strong>Registrar tasa aprobada</strong>
              <span>
                La tasa queda como evidencia inmutable para transacciones que la utilicen.
              </span>
            </div>
            <div className="financial-integrity-inline">
              <Field label="Desde">
                <input
                  maxLength={3}
                  minLength={3}
                  onChange={(event) => setFromCurrency(event.target.value.toUpperCase())}
                  required
                  value={fromCurrency}
                />
              </Field>
              <Field label="Hacia">
                <input
                  maxLength={3}
                  minLength={3}
                  onChange={(event) => setToCurrency(event.target.value.toUpperCase())}
                  required
                  value={toCurrency}
                />
              </Field>
              <Field label="Tasa">
                <input
                  inputMode="decimal"
                  min="0.0000000001"
                  onChange={(event) => setRate(event.target.value)}
                  required
                  step="0.0000000001"
                  type="number"
                  value={rate}
                />
              </Field>
            </div>
            <Field label="Fecha efectiva">
              <input
                onChange={(event) => setEffectiveOn(event.target.value)}
                required
                type="date"
                value={effectiveOn}
              />
            </Field>
            <Field label="Fecha/hora observada">
              <input
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) setRateAt(new Date(value).toISOString());
                }}
                required
                type="datetime-local"
                value={toLocalDateTimeInput(rateAt)}
              />
            </Field>
            <Field label="Fuente">
              <input
                maxLength={120}
                onChange={(event) => setSource(event.target.value)}
                placeholder="BCV, tasa contractual, otra fuente aprobada"
                required
                value={source}
              />
            </Field>
            <Field label="Referencia de la fuente">
              <input
                maxLength={500}
                onChange={(event) => setSourceReference(event.target.value)}
                placeholder="Referencia interna, gaceta, captura privada, etc."
                value={sourceReference}
              />
            </Field>
            <Button
              disabled={busy === 'rate' || conversionMode !== 'approved_rates_only'}
              type="submit"
            >
              {busy === 'rate' ? 'Registrando…' : 'Aprobar tasa'}
            </Button>
          </form>
        </div>
      ) : null}

      {rates.length ? (
        <div className="financial-integrity-rate-history">
          <strong>Tasas registradas</strong>
          {rates.slice(0, 6).map((item) => (
            <div key={item.id}>
              <span>
                {item.from_currency_code} → {item.to_currency_code}
              </span>
              <b>{Number(item.rate).toLocaleString('es-VE', { maximumFractionDigits: 10 })}</b>
              <small>
                {formatDashboardDate(item.effective_on)} · {item.source}
              </small>
              <Badge tone={item.status === 'approved' ? 'success' : 'neutral'}>
                {item.status === 'approved' ? 'Aprobada' : 'Sustituida'}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
