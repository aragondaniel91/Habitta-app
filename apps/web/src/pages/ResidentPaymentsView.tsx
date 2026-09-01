import { useMemo } from 'react';
import {
  CheckCircleIcon,
  FeesIcon,
  PaymentsIcon,
  ReportsIcon,
  SettingsIcon,
} from '../components/icons';
import { FinancialPagination } from '../components/FinancialPagination';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, InfoHint, Surface } from '../components/ui';
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
  // Two conditions, and both are real: the condominium must offer a way to pay, and the resident
  // must have somewhere to pay for. Either one missing means the button leads nowhere.
  const canRegister = canRegisterPayment && data.methods.some((method) => method.is_active);
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
  const approvedAmount = visiblePayments
    .filter((payment) => payment.status === 'approved')
    .reduce((total, payment) => total + Number(payment.original_amount || 0), 0);

  return (
    <div className="resident-payments">
      <PageHeader
        actions={
          <Button disabled={!canRegister} onClick={onRegisterPayment} size="sm">
            <PaymentsIcon size={17} /> Registrar pago
          </Button>
        }
        description={`${condominiumName} · registra tus pagos, adjunta el comprobante y sigue su validación sin entrar en herramientas de tesorería.`}
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

      {unitOptions.length > 1 ? (
        <div className="resident-payments__unit-row">
          <div>
            <strong>Tus unidades</strong>
            <span>Elige una propiedad para ver su saldo, sus cuotas y sus pagos.</span>
          </div>
          <div className="resident-payments__unit-select">
            <label htmlFor="resident-payments-unit">Ver</label>
            <select
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
          </div>
        </div>
      ) : null}

      <div className="resident-payments__currency-row">
        <div>
          <strong>Tu cuenta por moneda</strong>
          <span>Habitta nunca mezcla saldos ni pagos de monedas diferentes.</span>
        </div>
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

      <section aria-label="Resumen de pagos" className="resident-payments__hero-grid">
        <Surface className="resident-payments__balance" data-tone="navy">
          <div className="resident-payments__card-heading">
            <span>
              <FeesIcon size={20} />
            </span>
            <small>
              {selectedUnitId
                ? `Saldo de ${residentUnitLabel(unitLabels, selectedUnitId)}`
                : 'Saldo pendiente'}
            </small>
          </div>
          <strong>{formatDashboardAmount(outstanding, currency)}</strong>
          <p>
            Este saldo solo cambia cuando la administración aprueba y aplica el pago.
            <InfoHint label="Cómo funciona el saldo pendiente">
              Registrar o enviar un comprobante no reduce el saldo por sí solo. Habitta conserva el
              saldo hasta que el pago sea aprobado y aplicado de forma trazable.
            </InfoHint>
          </p>
        </Surface>

        <Surface className="resident-payments__guide" data-tone="blue">
          <div className="resident-payments__guide-copy">
            <span className="resident-payments__kicker">Registro guiado</span>
            <h2>Reporta tu pago con claridad</h2>
            <p>Completa los datos, adjunta el soporte cuando aplique y envíalo a validación.</p>
          </div>
          <ol className="resident-payments__steps">
            <li>
              <span>1</span>
              <div>
                <strong>Datos del pago</strong>
                <small>Unidad, método, fecha, monto y referencia.</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Comprobante</strong>
                <small>Habitta te indica si es obligatorio para el método elegido.</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Validación</strong>
                <small>La administración revisa y, al aprobar, se genera el recibo.</small>
              </div>
            </li>
          </ol>
          <Button disabled={!canRegister} onClick={onRegisterPayment}>
            <PaymentsIcon size={18} /> Comenzar registro
          </Button>
        </Surface>
      </section>

      <section aria-label="Estado de mis pagos" className="resident-payments__metrics">
        <Surface className="resident-payments__metric" data-tone="blue">
          <span>
            <PaymentsIcon size={18} /> En validación
          </span>
          <strong>{inValidation}</strong>
          <small>Enviados o en revisión.</small>
        </Surface>
        <Surface className="resident-payments__metric" data-tone="navy">
          <span>
            <ReportsIcon size={18} /> Requieren acción
          </span>
          <strong>{actionRequired}</strong>
          <small>Borradores o correcciones solicitadas.</small>
        </Surface>
        <Surface className="resident-payments__metric" data-tone="green">
          <span>
            <CheckCircleIcon size={18} /> Pagos aprobados
          </span>
          <strong>{formatDashboardAmount(approvedAmount, currency)}</strong>
          <small>Monto aprobado en {currency}.</small>
        </Surface>
      </section>

      <section className="resident-payments__content-grid">
        <Surface className="resident-payments__panel">
          <div className="resident-payments__section-heading">
            <div>
              <span className="resident-payments__kicker">Cómo pagar</span>
              <h2>Métodos disponibles</h2>
            </div>
            <Badge tone={activeMethods.length ? 'success' : 'neutral'}>
              {activeMethods.length ? `${activeMethods.length} activos` : 'Sin métodos'}
            </Badge>
          </div>
          {activeMethods.length ? (
            <div className="resident-payments__methods">
              {activeMethods.map((method) => (
                <article key={method.id}>
                  <span className="resident-payments__method-icon">
                    <SettingsIcon size={18} />
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
            <EmptyState
              description={`La administración todavía no publicó un método activo para ${currency}.`}
              icon={<SettingsIcon size={25} />}
              title="No hay método disponible"
            />
          )}
        </Surface>

        <Surface className="resident-payments__panel resident-payments__history-panel">
          <div className="resident-payments__section-heading">
            <div>
              <span className="resident-payments__kicker">Historial</span>
              <h2>Mis movimientos</h2>
            </div>
            <span className="resident-payments__count">
              {visiblePayments.length} visibles · {data.payments.length} de{' '}
              {data.paymentsPage.total} cargados
            </span>
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
                        {/* With one unit the answer is obvious and the label is noise. With
                            several, a payment without its destination is unreadable. */}
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
            <EmptyState
              actionLabel={canRegister ? 'Registrar mi primer pago' : undefined}
              description="Cuando registres un pago aparecerá aquí con su estado de validación."
              icon={<PaymentsIcon size={26} />}
              onAction={canRegister ? onRegisterPayment : undefined}
              title="Aún no tienes pagos"
            />
          )}

          <FinancialPagination
            itemLabel="pagos"
            loaded={data.payments.length}
            loading={loadingMorePayments}
            onLoadMore={onLoadMore}
            total={data.paymentsPage.total}
          />
        </Surface>
      </section>
    </div>
  );
}
