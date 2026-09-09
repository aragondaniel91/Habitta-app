import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, Surface } from '../../components/ui';
import { FeesIcon } from '../../components/icons';
import { ApiRequestError } from '../../lib/api';
import {
  clearBillingSetupIntent,
  safeBillingRedirectUrl,
  startBillingSetup,
} from '../../lib/billing';
import type { CommercialSummary } from '../../lib/commercial';
import './billing-method-setup.css';

type Props = {
  condominiumId: string;
  session: Session;
  canManageBilling: boolean;
  // Fetched once by the dedicated billing parent and passed down here, so this card and
  // CommercialSummaryCard read the same authoritative commercial state.
  summary: CommercialSummary | null;
  refresh: () => Promise<CommercialSummary>;
};

const clearReturnState = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('billingSetup');
  url.searchParams.delete('attempt');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};

export function BillingMethodSetupCard({
  canManageBilling,
  condominiumId,
  session,
  summary,
  refresh,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const returnState = new URLSearchParams(window.location.search).get('billingSetup');
    if (!returnState) return;

    if (returnState === 'cancelled') {
      clearBillingSetupIntent(condominiumId);
      setNotice('No se guardó ningún método de pago y no se realizó ningún cobro.');
      clearReturnState();
      return;
    }
    if (returnState !== 'success') return;

    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;
    setNotice('Stripe completó el paso seguro. Habitta está confirmando el método de pago…');

    const poll = async () => {
      attempt += 1;
      try {
        const value = await refresh();
        if (cancelled) return;
        if (value.billing_method_ready) {
          clearBillingSetupIntent(condominiumId);
          setNotice('Método de pago confirmado.');
          clearReturnState();
          return;
        }
      } catch {
        // Webhook confirmation is authoritative; a transient read failure can be retried here.
      }
      if (!cancelled && attempt < 6) timer = window.setTimeout(() => void poll(), 1500);
      if (!cancelled && attempt >= 6) {
        setNotice(
          'La confirmación está tardando más de lo normal. No repitas el pago: puedes actualizar esta sección en unos segundos.',
        );
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [condominiumId, refresh]);

  if (
    !summary?.found ||
    !summary.has_term ||
    (!summary.billing_consent_recorded && summary.commercial_status !== 'confirmed')
  ) {
    return null;
  }

  const ready = summary.billing_method_ready;
  const trialing = summary.status === 'trialing';

  const beginSetup = async () => {
    if (!canManageBilling || loading) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startBillingSetup(condominiumId, session);
      if (result.billingMethodReady || result.status === 'ready') {
        await refresh();
        setNotice('El método de pago ya está confirmado.');
        return;
      }
      if (!result.action?.url) throw new Error('Habitta no recibió la sesión segura de pago.');
      window.location.assign(safeBillingRedirectUrl(result.action.url));
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 403) {
        setError(
          'Solo el propietario de la organización puede configurar el método de pago de Habitta.',
        );
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No pudimos iniciar la configuración segura del método de pago.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Surface className="settings-panel settings-billing-method">
      <div className="settings-section-heading">
        <div>
          <span className="settings-kicker">Facturación Habitta</span>
          <h2>Método de pago</h2>
          <p>
            {ready
              ? 'Tu método de pago está preparado para la suscripción de Habitta.'
              : 'Configura el método que Habitta podrá usar después de tu prueba y bajo las condiciones comerciales aceptadas.'}
          </p>
        </div>
        <Badge tone={ready ? 'success' : 'warning'}>{ready ? 'Configurado' : 'Pendiente'}</Badge>
      </div>

      <div className="settings-billing-method__security">
        <span aria-hidden="true">
          <FeesIcon size={20} />
        </span>
        <div>
          <strong>
            {ready ? 'Método protegido por Stripe' : 'Configuración segura alojada por Stripe'}
          </strong>
          <p>
            Habitta guarda únicamente referencias técnicas del proveedor. Los datos completos de tu
            tarjeta no se almacenan en Habitta.
          </p>
        </div>
      </div>

      {ready ? (
        <dl className="settings-account-details settings-billing-method__status">
          <div>
            <dt>Método de pago</dt>
            <dd>Listo</dd>
          </div>
          <div>
            <dt>Cobro automático</dt>
            <dd>{summary.auto_bill_enabled ? 'Habilitado' : 'Deshabilitado'}</dd>
          </div>
        </dl>
      ) : (
        <div className="settings-billing-method__action">
          <div>
            <strong>
              {!canManageBilling
                ? 'La gestión de facturación requiere al propietario de la organización'
                : trialing
                  ? 'Hoy no se realiza ningún cobro'
                  : 'Este paso no realiza un cargo inmediato'}
            </strong>
            <p>
              {canManageBilling
                ? 'Stripe te pedirá el método de pago. Habitta sólo lo considerará listo después de validar el webhook firmado del proveedor.'
                : 'Puedes consultar el plan y el estado del método de pago, pero sólo el propietario de la organización puede cambiar la forma de pago de Habitta.'}
            </p>
          </div>
          <Button
            disabled={loading || !canManageBilling}
            onClick={() => void beginSetup()}
            type="button"
          >
            {loading
              ? 'Abriendo Stripe…'
              : canManageBilling
                ? 'Configurar método de pago seguro'
                : 'Requiere propietario'}
          </Button>
        </div>
      )}

      {notice ? (
        <div className="settings-success-alert settings-billing-method__notice" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="settings-inline-alert" role="alert">
          {error}
        </div>
      ) : null}
    </Surface>
  );
}
