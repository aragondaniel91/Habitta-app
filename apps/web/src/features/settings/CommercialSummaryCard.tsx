import { useEffect, useState } from 'react';
import { Badge, Surface } from '../../components/ui';
import { FeesIcon } from '../../components/icons';
import {
  commercialBenefitLabel,
  commercialStatusLabel,
  loadCommercialSummary,
} from '../../lib/commercial';
import type { CommercialSummary } from '../../lib/commercial';

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
  return new Date(value).toLocaleDateString('es-VE', {
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

export function CommercialSummaryCard({ condominiumId }: { condominiumId: string }) {
  const [summary, setSummary] = useState<CommercialSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
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

  if (!summary?.found || !summary.has_term) return null;

  const currency = summary.currency ?? 'USD';
  const currentPrice = formatMoney(summary.current_effective_period_amount, currency);
  const nextPrice = formatMoney(summary.next_period_amount, currency);
  const period = summary.billing_period === 'annual' ? 'año' : 'mes';
  const trial = summary.status === 'trialing';

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

      <p className="settings-delivery-note">
        {trial
          ? 'Estás en tu prueba de 30 días. No se cobra hoy. Habitta no intentará un cobro automático al finalizar sin una configuración y consentimiento explícitos.'
          : summary.adjustment_source === 'gift'
            ? 'Este período fue otorgado sin costo y no representa un pago ni un abono contable.'
            : summary.adjustment_source === 'coupon'
              ? 'El descuento es temporal. Tu precio contractual base permanece registrado por separado.'
              : 'El precio mostrado corresponde al término comercial vigente de tu suscripción.'}
      </p>
    </Surface>
  );
}
