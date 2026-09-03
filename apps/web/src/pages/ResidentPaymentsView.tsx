import { useMemo } from 'react';
import {
  CheckCircleIcon,
  HomeIcon,
  PaymentsIcon,
  SettingsIcon,
  UnitsIcon,
} from '../components/icons';
import { FinancialPagination } from '../components/FinancialPagination';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, InfoHint, Surface } from '../components/ui';
import type { Payment, PaymentMethod, Receivable } from '../features/payments/types';
import { formatDashboardAmount, formatDashboardDate } from '../lib/dashboard';
import { paymentStatusLabels, paymentStatusTone, sortPayments } from '../lib/payments';
import type { PageInfo } from '../lib/pagination';
import { residentUnitLabel } from '../lib/resident-units';
import type { ResidentFinancialUnit, ResidentUnitOption } from '../lib/resident-units';
import '../resident-payments.css';

type Unit = { id: string; code: string; building_id: string | null; status?: string };

type ResidentPaymentsData = {
  units: Unit[];
  methods: PaymentMethod[];
  payments: Payment[];
  paymentsPage: PageInfo;
  receivables: Receivable[];
};

type Props = {
  condominiumName: string;
  data: ResidentPaymentsData;
  error: string;
  message: string;
  selectedCurrency: string;
  selectedUnitId: string;
  /** The ledger's answer for the units currently in view, one row per unit per currency. */
  financialRows: ResidentFinancialUnit[];
  /** Every unit the resident has a financial view of. */
  unitOptions: ResidentUnitOption[];
  unitLabels: Map<string, string>;
  /** False when the database would refuse a payment for every unit in view. */
  canRegisterPayment: boolean;
  loadingMorePayments: boolean;
  onCurrencyChange: (currency: string) => void;
  onUnitChange: (unitId: string) => void;
  onLoadMore: () => void;
  onOpenPayment: (payment: Payment) => void;
  onRegisterPayment: () => void;
};

const paymentActionLabel = (status: string) => {
  if (status === 'correction_requested') return 'Corregir pago';
  if (status === 'draft') return 'Continuar';
  if (status === 'approved' || status === 'reversed') return 'Ver recibo';
  return '';
};

const paymentStatusDetail = (payment: Payment) => {
  if (payment.status === 'correction_requested') {
    return (
      payment.correction_reason || 'La administración solicitó una corrección antes de validar.'
    );
  }
  if (payment.status === 'rejected') {
    return payment.rejection_reason || 'La administración rechazó este pago.';
  }
  if (payment.status === 'draft') return 'Aún no se ha enviado a validación.';
  if (payment.status === 'submitted') return 'Enviado. Esperando validación de la administración.';
  if (payment.status === 'under_review') return 'La administración está revisando este pago.';
  if (payment.status === 'approved') return 'Aprobado y aplicado con trazabilidad.';
  if (payment.status === 'reversed') return 'El recibo conserva el historial del reverso.';
  return '';
};

export function ResidentPaymentsView({
  condominiumName,
  data,
  error,
  message,
  selectedCurrency,
  selectedUnitId,
  financialRows,
  unitOptions,
  unitLabels,
  canRegisterPayment,
  loadingMorePayments,
  onCurrencyChange,
  onUnitChange,
  onLoadMore,
  onOpenPayment,
  onRegisterPayment,
}: Props) {
  const currencies = useMemo(
    () =>
      [
        ...new Set([
          ...data.methods.map((method) => method.currency_code),
          ...data.payments.map((payment) => payment.original_currency_code),
          ...data.receivables.map((receivable) => receivable.currency_code),
        ]),
      ]
        .filter(Boolean)
        .sort(),
    [data.methods, data.payments, data.receivables],
  );
  const currency = selectedCurrency || currencies[0] || 'USD';
  const activeMethods = data.methods.filter(
    (method) => method.is_active && method.currency_code === currency,
  );
  // Registration belongs to the account context currently on screen. A method in another currency
  // must not make this currency look payable, and the database still decides whether any unit in
  // the selected scope can actually receive the payment.
  const canRegister = canRegisterPayment && activeMethods.length > 0;
  const visiblePayments = useMemo(
    () =>
      sortPayments(data.payments).filter(
        (payment) => !currency || payment.original_currency_code === currency,
      ),
    [currency, data.payments],
  );
  // From the ledger, per unit, not from the open receivables on this page.
  //
  // Summing `outstanding_amount` was wrong in both directions: it misses credits and overpayments
  // that are not attached to any charge, and it only ever covered the receivables that happened to
  // be loaded. Adding the per-unit rows of a single currency is safe -- they are the same currency
  // and the same ledger -- and it agrees with what the dashboard shows.
  const outstanding = financialRows
    .filter((row) => row.currency_code === currency)
    .reduce((total, row) => total + Number(row.net_outstanding ?? 0), 0);
  const inValidation = visiblePayments.filter((payment) =>
    ['submitted', 'under_review'].includes(payment.status),
  ).length;
  const actionRequired = visiblePayments.filter((payment) =>
    ['draft', 'correction_requested'].includes(payment.status),
  ).length;
  const selectedScopeLabel = selectedUnitId
    ? residentUnitLabel(unitLabels, selectedUnitId)
    : unitOptions.length > 1
      ? 'Todas mis unidades'
      : unitOptions[0]?.label || condominiumName;

  return (
    <div className="resident-payments">
      <PageHeader
        description={`${condominiumName} · consulta tu saldo, registra pagos y sigue su validación.`}
        eyebrow="Mi hogar"
        title="Mis pagos"
      />

      {error ? (
        <div className="resident-payments__alert" role="status">
          {error} Se mantienen los últimos datos cargados.
        </div>
      ) : null}
      {message ? (
        <div className="resident-payments__success" role="status">
          <CheckCircleIcon size={17} /> {message}
        </div>
      ) : null}

      <Surface aria-label="Contexto de pagos" className="resident-payments__context-shell">
        <div className="resident-payments__context-item resident-payments__context-condominium">
          <span className="resident-payments__context-icon">
            <UnitsIcon size={22} />
          </span>
          <div>
            <span>Condominio seleccionado</span>
            <strong>{condominiumName}</strong>
          </div>
        </div>

        <div className="resident-payments__context-item resident-payments__context-unit">
          <div>
            <span>Estoy viendo</span>
            {unitOptions.length > 1 ? (
              <label className="resident-payments__unit-select" htmlFor="resident-payments-unit">
                <HomeIcon size={20} />
                <select
                  aria-label="Unidad que deseas consultar"
                  id="resident-payments-unit"
                  onChange={(event) => onUnitChange(event.target.value)}
                  value={selectedUnitId}
                >
                  <option value="">Todas mis unidades</option>
                  {unitOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <strong className="resident-payments__single-unit">
                <HomeIcon size={20} /> {selectedScopeLabel}
              </strong>
            )}
          </div>
        </div>

        <div className="resident-payments__context-item resident-payments__context-currency">
          <div>
            <span>Moneda</span>
            {currencies.length > 1 ? (
              <div aria-label="Seleccionar moneda" className="resident-payments__currency-tabs">
                {currencies.map((item) => (
                  <button
                    aria-pressed={currency === item}
                    data-active={currency === item || undefined}
                    key={item}
                    onClick={() => onCurrencyChange(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <Badge tone="info">{currency}</Badge>
            )}
          </div>
        </div>
      </Surface>

      <Surface className="resident-payments__account-shell">
        <div className="resident-payments__account-main">
          <section className="resident-payments__account-summary" aria-label="Saldo actual">
            <div className="resident-payments__account-heading">
              <span className="resident-payments__account-icon">
                <HomeIcon size={21} />
              </span>
              <div>
                <span>Cuenta residencial</span>
                <strong>{selectedScopeLabel}</strong>
              </div>
            </div>

            <div className="resident-payments__balance-block">
              <span>
                Saldo actual
                <InfoHint label="Cómo funciona el saldo pendiente">
                  Registrar o enviar un comprobante no reduce el saldo por sí solo. Habitta conserva
                  el saldo hasta que el pago sea aprobado y aplicado de forma trazable.
                </InfoHint>
              </span>
              <strong className="hq-money">{formatDashboardAmount(outstanding, currency)}</strong>
              <p>Este saldo solo cambia cuando la administración aprueba y aplica el pago.</p>
            </div>
          </section>

          <section className="resident-payments__methods-compact" aria-label="Métodos disponibles">
            <div className="resident-payments__compact-heading">
              <span>Métodos disponibles</span>
              <Badge tone={activeMethods.length ? 'success' : 'neutral'}>
                {activeMethods.length ? `${activeMethods.length} activos` : 'Sin métodos'}
              </Badge>
            </div>

            {activeMethods.length ? (
              <div className="resident-payments__methods">
                {activeMethods.map((method) => (
                  <article key={method.id}>
                    <span className="resident-payments__method-icon">
                      <PaymentsIcon size={18} />
                    </span>
                    <div>
                      <strong>{method.display_name}</strong>
                      <small>
                        {method.instructions || 'Sigue las instrucciones de la administración.'}
                      </small>
                    </div>
                    <div className="resident-payments__method-badges">
                      {method.requires_reference ? <Badge tone="info">Referencia</Badge> : null}
                      {method.requires_proof ? <Badge tone="warning">Comprobante</Badge> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="resident-payments__method-empty" role="note">
                <span className="resident-payments__method-icon">
                  <PaymentsIcon size={18} />
                </span>
                <div>
                  <strong>No hay método disponible para {currency}</strong>
                  <small>La administración todavía no publicó un método activo para esta moneda.</small>
                </div>
              </div>
            )}
          </section>

          <section className="resident-payments__account-action" aria-label="Registrar un pago">
            <span className="resident-payments__action-icon" data-available={canRegister || undefined}>
              {canRegister ? <CheckCircleIcon size={20} /> : <SettingsIcon size={20} />}
            </span>
            <div className="resident-payments__action-copy">
              <strong>{canRegister ? '¿Ya realizaste tu pago?' : 'Registro no disponible'}</strong>
              <small>
                {canRegister
                  ? 'Carga los datos y el comprobante para enviarlo a validación.'
                  : activeMethods.length === 0
                    ? `No hay un método activo para ${currency}.`
                    : 'No hay una unidad elegible para recibir el pago.'}
              </small>
            </div>
            <Button disabled={!canRegister} onClick={onRegisterPayment}>
              <PaymentsIcon size={17} /> Registrar pago
            </Button>
          </section>
        </div>
      </Surface>

      {actionRequired > 0 || inValidation > 0 ? (
        <section
          aria-label="Pagos que necesitan seguimiento"
          className="resident-payments__status-row"
        >
          {actionRequired > 0 ? (
            <Surface className="resident-payments__status" data-status="action">
              <span className="resident-payments__status-icon">
                <PaymentsIcon size={18} />
              </span>
              <div>
                <strong>
                  {actionRequired} {actionRequired === 1 ? 'pago requiere' : 'pagos requieren'}{' '}
                  acción
                </strong>
                <small>Continúa un borrador o corrige lo solicitado desde tu historial.</small>
              </div>
            </Surface>
          ) : null}
          {inValidation > 0 ? (
            <Surface className="resident-payments__status" data-status="review">
              <span className="resident-payments__status-icon">
                <CheckCircleIcon size={18} />
              </span>
              <div>
                <strong>
                  {inValidation} {inValidation === 1 ? 'pago está' : 'pagos están'} en validación
                </strong>
                <small>La administración está revisando el registro enviado.</small>
              </div>
            </Surface>
          ) : null}
        </section>
      ) : null}

      <Surface className="resident-payments__panel resident-payments__history-panel">
        <div className="resident-payments__section-heading">
          <div>
            <span className="hq-kicker">Historial de pagos</span>
            <h2>Mis movimientos</h2>
          </div>
          <div className="resident-payments__history-meta">
            <Badge tone="neutral">Todos los períodos</Badge>
            <span className="resident-payments__count">
              {visiblePayments.length} visibles · {data.payments.length} de {data.paymentsPage.total}{' '}
              cargados
            </span>
          </div>
        </div>

        {visiblePayments.length ? (
          <div className="resident-payments__history">
            {visiblePayments.map((payment) => {
              const action = paymentActionLabel(payment.status);
              return (
                <article key={payment.id}>
                  <span className="resident-payments__history-icon">
                    {payment.status === 'approved' ? (
                      <CheckCircleIcon size={18} />
                    ) : (
                      <PaymentsIcon size={18} />
                    )}
                  </span>
                  <div className="resident-payments__history-main">
                    <div>
                      <strong>
                        {formatDashboardAmount(
                          payment.original_amount,
                          payment.original_currency_code,
                        )}
                      </strong>
                      <Badge tone={paymentStatusTone(payment.status)}>
                        {paymentStatusLabels[payment.status] ?? payment.status}
                      </Badge>
                    </div>
                    <span>
                      {!selectedUnitId && unitOptions.length > 1
                        ? `${residentUnitLabel(unitLabels, payment.unit_id)} · `
                        : ''}
                      {formatDashboardDate(payment.payment_date)}
                      {payment.reference ? ` · Ref. ${payment.reference}` : ''}
                    </span>
                    <small>{paymentStatusDetail(payment)}</small>
                  </div>
                  {action ? (
                    <Button onClick={() => onOpenPayment(payment)} size="sm" variant="ghost">
                      {action}
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="resident-payments__history-empty">
            <div aria-hidden="true" className="resident-payments__history-illustration">
              <span className="resident-payments__history-paper">
                <span />
                <span />
                <span />
              </span>
              <span className="resident-payments__history-money">$</span>
            </div>
            <div className="resident-payments__history-empty-copy">
              <strong>Aún no tienes pagos</strong>
              <small>Cuando registres uno aparecerá aquí con su estado de validación.</small>
              <details className="resident-payments__history-help">
                <summary>Más información sobre pagos</summary>
                <p>
                  Cuando registres un pago podrás seguir aquí su validación, correcciones y recibo
                  sin perder la trazabilidad de la unidad ni de la moneda.
                </p>
              </details>
            </div>
          </div>
        )}

        <FinancialPagination
          itemLabel="pagos"
          loaded={data.payments.length}
          loading={loadingMorePayments}
          onLoadMore={onLoadMore}
          total={data.paymentsPage.total}
        />
      </Surface>
    </div>
  );
}
