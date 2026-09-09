import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Surface } from '../../components/ui';
import { loadCommercialSummary } from '../../lib/commercial';
import type { CommercialSummary } from '../../lib/commercial';
import { useCondominiumRoles } from '../../lib/roles';
import { BillingMethodSetupCard } from './BillingMethodSetupCard';
import { CommercialSummaryCard } from './CommercialSummaryCard';
import { getBillingManagementCapability } from './billing-capability';
import './condominium-billing-panel.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

export function CondominiumBillingPanel({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const canViewCommercial = roles.includes('condominium_admin');
  const [summary, setSummary] = useState<CommercialSummary | null>(null);
  const [canManageBilling, setCanManageBilling] = useState(false);
  const [loading, setLoading] = useState(canViewCommercial);
  const [error, setError] = useState('');

  const refreshCommercialSummary = useCallback(async () => {
    const value = await loadCommercialSummary(condominiumId);
    setSummary(value);
    return value;
  }, [condominiumId]);

  useEffect(() => {
    if (!canViewCommercial) {
      setSummary(null);
      setCanManageBilling(false);
      setLoading(false);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    void Promise.allSettled([
      refreshCommercialSummary(),
      getBillingManagementCapability(condominiumId, session),
    ]).then(([summaryResult, capabilityResult]) => {
      if (cancelled) return;
      if (summaryResult.status === 'rejected') {
        setSummary(null);
        setError('No pudimos cargar la suscripción de Habitta en este momento.');
      }
      if (capabilityResult.status === 'fulfilled') {
        setCanManageBilling(capabilityResult.value.canManageBilling);
      } else {
        setCanManageBilling(false);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [canViewCommercial, condominiumId, refreshCommercialSummary, session]);

  if (!canViewCommercial) return null;

  return (
    <section
      aria-labelledby="settings-billing-title"
      className="settings-commercial-section"
      id="plan-facturacion"
    >
      <div className="settings-commercial-section__header">
        <div>
          <span className="settings-kicker">Plan y facturación</span>
          <h2 id="settings-billing-title">Suscripción de Habitta</h2>
          <p>
            Consulta el plan contratado por {condominiumName}, su próximo cobro y el método
            utilizado para pagar Habitta.
          </p>
        </div>
        <Badge tone={canManageBilling ? 'success' : 'neutral'}>
          {canManageBilling ? 'Administrable' : 'Solo lectura'}
        </Badge>
      </div>

      <div className="settings-commercial-section__scope-note">
        <strong>Facturación de Habitta</strong>
        <span>
          Esta sección corresponde únicamente a la suscripción de la plataforma. No modifica cuotas,
          pagos, cuentas bancarias ni movimientos financieros del condominio.
        </span>
      </div>

      {loading ? (
        <Surface className="settings-panel settings-commercial-section__loading">
          Cargando plan y facturación…
        </Surface>
      ) : null}

      {error ? (
        <div className="settings-inline-alert" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && summary ? (
        <div className="settings-commercial-section__grid">
          <CommercialSummaryCard
            condominiumId={condominiumId}
            setSummary={setSummary}
            summary={summary}
          />
          <BillingMethodSetupCard
            canManageBilling={canManageBilling}
            condominiumId={condominiumId}
            refresh={refreshCommercialSummary}
            session={session}
            summary={summary}
          />
        </div>
      ) : null}
    </section>
  );
}
