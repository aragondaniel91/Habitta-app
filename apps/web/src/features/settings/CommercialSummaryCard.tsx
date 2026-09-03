import { useEffect, useState } from 'react';
import { Badge, Button, Field, Surface } from '../../components/ui';
import { FeesIcon } from '../../components/icons';
import {
  commercialBenefitLabel,
  commercialStatusLabel,
  loadCommercialCheckoutPreview,
  loadCommercialSummary,
  recordCommercialConsent,
} from '../../lib/commercial';
import type { CommercialCheckoutPreview, CommercialSummary } from '../../lib/commercial';

function formatMoney(value: number | undefined, currency = 'USD') {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  return new Date(normalized).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function statusTone(status: CommercialSummary['status']) {
  if (status === 'active') return 'success' as const;
  if (status === 'trialing') return 'info' as const;
  if (status === 'past_due' || status === 'suspended') return 'warning' as const;
  return 'neutral' as const;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No pudimos validar las condiciones comerciales.';
}

export function CommercialSummaryCard({ condominiumId }: { condominiumId: string }) {
  const [summary, setSummary] = useState<CommercialSummary | null>(null);
  const [checkout, setCheckout] = useState<CommercialCheckoutPreview | null>(null);
  const [offerCode, setOfferCode] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [ownerCheckoutRequired, setOwnerCheckoutRequired] = useState(false);
  const [consentRecordedNow, setConsentRecordedNow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setCheckout(null);
    setConsentRecordedNow(false);
    void loadCommercialSummary(condominiumId)
      .then((value) => {
        if (!cancelled) setSummary(value);
      })
      .catch(() => {
        // Pricing is intentionally restricted to organization owners and condominium admins.
        // Other settings roles simply do not receive a commercial card.
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [condominiumId]);

  useEffect(() => {
    if (
      summary?.status !== 'trialing' ||
      summary.commercial_status === 'confirmed' ||
      summary.billing_consent_recorded
    ) {
      setCheckout(null);
      setOwnerCheckoutRequired(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setCheckoutError(null);
    void loadCommercialCheckoutPreview(condominiumId)
      .then((value) => {
        if (cancelled) return;
        setCheckout(value);
        setOfferCode(value.promotion?.code ?? '');
        setOwnerCheckoutRequired(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = errorMessage(error);
        if (message.includes('organization owner scope')) {
          setOwnerCheckoutRequired(true);
          setCheckoutError(null);
        } else {
          setCheckoutError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [condominiumId, summary?.billing_consent_recorded, summary?.commercial_status, summary?.status]);

  if (!summary?.found || !summary.has_term) return null;

  const currency = summary.currency ?? 'USD';
  const currentPrice = formatMoney(summary.current_effective_period_amount, currency);
  const nextPrice = formatMoney(summary.next_period_amount, currency);
  const period = summary.billing_period === 'annual' ? 'año' : 'mes';
  const trial = summary.status === 'trialing';
  const checkoutPeriod = checkout?.billing_period === 'annual' ? 'año' : 'mes';
  const normalizedInputCode = offerCode.trim().toUpperCase();
  const appliedOfferCode = checkout?.promotion?.code ?? '';
  const previewMatchesInput = normalizedInputCode === appliedOfferCode;

  const refreshCheckout = async (nextOfferCode: string | null) => {
    setPreviewLoading(true);
    setCheckoutError(null);
    setConsentAccepted(false);
    try {
      const value = await loadCommercialCheckoutPreview(condominiumId, nextOfferCode);
      setCheckout(value);
      setOfferCode(value.promotion?.code ?? '');
      setOwnerCheckoutRequired(false);
    } catch (error: unknown) {
      setCheckoutError(errorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmConsent = async () => {
    if (!checkout || !consentAccepted || !previewMatchesInput) return;
    setConsentLoading(true);
    setCheckoutError(null);
    try {
      const result = await recordCommercialConsent(
        condominiumId,
        checkout.promotion?.code ?? null,
        checkout.terms_fingerprint,
      );
      setCheckout(result);
      setConsentAccepted(false);
      setConsentRecordedNow(true);
      setSummary((current) =>
        current
          ? {
              ...current,
              commercial_status: 'confirmed',
              billing_consent_recorded: true,
              auto_bill_enabled: false,
            }
          : current,
      );
    } catch (error: unknown) {
      const message = errorMessage(error);
      setCheckoutError(message);
      if (message.includes('commercial terms changed')) {
        try {
          const refreshed = await loadCommercialCheckoutPreview(
            condominiumId,
            checkout.promotion?.code ?? null,
          );
          setCheckout(refreshed);
          setOfferCode(refreshed.promotion?.code ?? '');
          setConsentAccepted(false);
        } catch {
          // Keep the authoritative consent error visible. The user can retry preview manually.
        }
      }
    } finally {
      setConsentLoading(false);
    }
  };

  return (
    <Surface className="settings-panel settings-commercial-card">
      <div className="settings-section-heading">
        <div>
          <span className="settings-kicker">Suscripción Habitta</span>
          <h2>Plan y próximo cobro</h2>
        </div>
        <Badge tone={statusTone(summary.status)}>{commercialStatusLabel(summary.status)}</Badge>
      </div>

      <div className="settings-account-profile">
        <span>
          <FeesIcon size={20} />
        </span>
        <div>
          <strong>{summary.plan_name ?? 'Plan Habitta'}</strong>
          <small>{commercialBenefitLabel(summary)}</small>
        </div>
      </div>

      <dl className="settings-account-details">
        <div>
          <dt>Precio actual</dt>
          <dd>
            {currentPrice}/{period}
          </dd>
        </div>
        <div>
          <dt>Precio contratado</dt>
          <dd>
            {formatMoney(summary.contracted_period_amount, currency)}/{period}
          </dd>
        </div>
        <div>
          <dt>{trial ? 'Fin de prueba' : 'Próxima fecha'}</dt>
          <dd>{formatDate(trial ? summary.trial_ends_at : summary.next_billing_date)}</dd>
        </div>
        <div>
          <dt>Próximo precio</dt>
          <dd>
            {nextPrice}/{period}
          </dd>
        </div>
        {summary.adjustment_ends_at ? (
          <div>
            <dt>Beneficio vigente hasta</dt>
            <dd>{formatDate(summary.adjustment_ends_at)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Cobro automático</dt>
          <dd>{summary.auto_bill_enabled ? 'Habilitado' : 'Deshabilitado'}</dd>
        </div>
      </dl>

      {consentRecordedNow ? (
        <div className="settings-success-alert settings-commercial-success" role="status">
          Condiciones comerciales aceptadas. No se realizó ningún cobro y el cobro automático sigue
          deshabilitado hasta completar la configuración del método de pago.
        </div>
      ) : null}

      {trial && !summary.billing_consent_recorded && summary.commercial_status !== 'confirmed' ? (
        <section className="settings-commercial-checkout" aria-label="Revisión comercial">
          <div className="settings-commercial-checkout__heading">
            <div>
              <span className="settings-kicker">Revisión comercial</span>
              <h3>Confirma exactamente qué ocurrirá después de la prueba</h3>
              <p>
                Hoy debes pagar $0. Puedes validar una promoción antes de aceptar las condiciones.
              </p>
            </div>
          </div>

          {ownerCheckoutRequired ? (
            <div className="settings-inline-alert">
              La revisión y el consentimiento de facturación deben ser completados por el propietario
              de la organización. Un administrador del condominio puede ver el plan, pero no autorizar
              condiciones comerciales en nombre de la organización.
            </div>
          ) : null}

          {!ownerCheckoutRequired ? (
            <>
              <div className="settings-commercial-promo">
                <Field
                  label="Código promocional (opcional)"
                  hint="Validamos vigencia, límite de usos y reglas de no acumulación en el servidor."
                >
                  <input
                    autoComplete="off"
                    className="input"
                    disabled={previewLoading || consentLoading}
                    maxLength={32}
                    onChange={(event) => {
                      setOfferCode(event.target.value.toUpperCase());
                      setConsentAccepted(false);
                      setCheckoutError(null);
                    }}
                    placeholder="Ej. LANZAMIENTO25"
                    value={offerCode}
                  />
                </Field>
                <div className="settings-commercial-promo__actions">
                  <Button
                    disabled={previewLoading || consentLoading || !offerCode.trim()}
                    onClick={() => void refreshCheckout(offerCode)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {previewLoading && offerCode.trim() ? 'Validando…' : 'Aplicar código'}
                  </Button>
                  {checkout?.promotion ? (
                    <Button
                      disabled={previewLoading || consentLoading}
                      onClick={() => {
                        setOfferCode('');
                        void refreshCheckout(null);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Quitar promoción
                    </Button>
                  ) : null}
                </div>
              </div>

              {checkoutError ? (
                <div className="settings-inline-alert" role="alert">
                  {checkoutError}
                </div>
              ) : null}

              {previewLoading && !checkout ? (
                <p className="settings-commercial-loading" role="status">
                  Cargando condiciones comerciales…
                </p>
              ) : null}

              {checkout ? (
                <>
                  <div className="settings-commercial-pricing-grid">
                    <article>
                      <span>Precio de lista</span>
                      <strong>
                        {formatMoney(checkout.catalog_period_amount, checkout.currency)}/
                        {checkoutPeriod}
                      </strong>
                      <small>Referencia pública actual del plan.</small>
                    </article>
                    <article>
                      <span>Precio contratado</span>
                      <strong>
                        {formatMoney(checkout.contracted_period_amount, checkout.currency)}/
                        {checkoutPeriod}
                      </strong>
                      <small>Tu base contractual, separada de promociones temporales.</small>
                    </article>
                    <article data-emphasis="success">
                      <span>Debido hoy</span>
                      <strong>{formatMoney(checkout.amount_due_today, checkout.currency)}</strong>
                      <small>La prueba sigue activa. No se cobra hoy.</small>
                    </article>
                  </div>

                  <div className="settings-commercial-timeline">
                    <article>
                      <span className="settings-commercial-timeline__step">1</span>
                      <div>
                        <small>Hasta {formatDate(checkout.trial_ends_at)}</small>
                        <strong>Prueba gratuita · $0</strong>
                        <p>No hay cargo durante los 30 días de prueba.</p>
                      </div>
                    </article>
                    <article>
                      <span className="settings-commercial-timeline__step">2</span>
                      <div>
                        <small>Primer cobro · {formatDate(checkout.first_billing_date)}</small>
                        <strong>
                          {formatMoney(checkout.first_period_amount, checkout.currency)}/
                          {checkoutPeriod}
                        </strong>
                        <p>
                          {checkout.promotion
                            ? `Promoción ${checkout.promotion.code} aplicada por ${checkout.promotion.duration_months} ${checkout.promotion.duration_months === 1 ? 'mes' : 'meses'}, hasta ${formatDate(checkout.promotion.ends_on)}.`
                            : 'Sin promoción: se mantiene el precio contratado.'}
                        </p>
                      </div>
                    </article>
                    {checkout.promotion ? (
                      <article>
                        <span className="settings-commercial-timeline__step">3</span>
                        <div>
                          <small>Después de la promoción</small>
                          <strong>
                            {formatMoney(checkout.post_promotion_period_amount, checkout.currency)}/
                            {checkoutPeriod}
                          </strong>
                          <p>Vuelve automáticamente a tu precio contractual base.</p>
                        </div>
                      </article>
                    ) : null}
                  </div>

                  {!previewMatchesInput ? (
                    <div className="settings-inline-alert">
                      El código escrito no coincide con la revisión mostrada. Aplícalo o elimínalo
                      antes de aceptar las condiciones.
                    </div>
                  ) : null}

                  <label className="settings-commercial-consent">
                    <input
                      checked={consentAccepted}
                      disabled={consentLoading || previewLoading || !previewMatchesInput}
                      onChange={(event) => setConsentAccepted(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      Acepto las condiciones comerciales mostradas arriba y autorizo estas condiciones
                      de facturación para cuando se configure un método de pago. Entiendo que hoy no se
                      realiza ningún cobro, que este paso no agrega un método de pago y que el cobro
                      automático permanece deshabilitado.
                    </span>
                  </label>

                  <div className="settings-commercial-checkout__actions">
                    <Button
                      disabled={
                        consentLoading ||
                        previewLoading ||
                        !consentAccepted ||
                        !previewMatchesInput
                      }
                      onClick={() => void confirmConsent()}
                      type="button"
                    >
                      {consentLoading ? 'Registrando consentimiento…' : 'Aceptar condiciones comerciales'}
                    </Button>
                    <small>
                      El método de pago se configurará en un paso separado. Este consentimiento no
                      habilita cobros automáticos por sí solo.
                    </small>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <p className="settings-delivery-note">
        {trial
          ? summary.billing_consent_recorded || summary.commercial_status === 'confirmed'
            ? 'Tu consentimiento comercial ya está registrado. Habitta no intentará un cobro automático mientras no exista también un método de pago preparado y el cobro automático permanezca deshabilitado.'
            : 'Estás en tu prueba de 30 días. No se cobra hoy. Habitta no intentará un cobro automático al finalizar sin una configuración y consentimiento explícitos.'
          : summary.adjustment_source === 'gift'
            ? 'Este período fue otorgado sin costo y no representa un pago ni un abono contable.'
            : summary.adjustment_source === 'coupon'
              ? 'El descuento es temporal. Tu precio contractual base permanece registrado por separado.'
              : 'El precio mostrado corresponde al término comercial vigente de tu suscripción.'}
      </p>
    </Surface>
  );
}
