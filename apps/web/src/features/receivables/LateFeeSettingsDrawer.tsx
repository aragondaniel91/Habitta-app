import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../../components/Dialog';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid } from '../../components/FormLayout';
import { Button, Field } from '../../components/ui';
import { formatDashboardAmount } from '../../lib/dashboard';
import {
  applyLateFees,
  getLateFeeSettings,
  previewLateFees,
  updateLateFeeSettings,
  type LateFeePreview,
  type LateFeeSettings,
} from './lateFees';
import '../../late-fees.css';

type Props = {
  condominiumId: string;
  session: Session;
  canManage: boolean;
  onClose: () => void;
};

type Form = {
  enabled: boolean;
  ratePercent: string;
  gracePeriodDays: string;
  capPercent: string;
  localCurrencyCode: string;
  appliesToForeignCurrency: boolean;
};

const formFromSettings = (settings: LateFeeSettings): Form => ({
  enabled: settings.enabled,
  ratePercent: String(settings.rate_percent),
  gracePeriodDays: String(settings.grace_period_days),
  capPercent: settings.cap_percent === null ? '' : String(settings.cap_percent),
  localCurrencyCode: settings.local_currency_code,
  appliesToForeignCurrency: settings.applies_to_foreign_currency,
});

export function LateFeeSettingsDrawer({ condominiumId, session, canManage, onClose }: Props) {
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<LateFeePreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLateFeeSettings(condominiumId, session)
      .then((settings) => {
        if (!cancelled) setForm(formFromSettings(settings));
      })
      .catch((requestError) => {
        if (!cancelled)
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar la política de mora.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [condominiumId, session]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const ratePercent = Number(form.ratePercent);
      const gracePeriodDays = Number(form.gracePeriodDays);
      const capPercent = form.capPercent.trim() === '' ? null : Number(form.capPercent);
      const settings = await updateLateFeeSettings(condominiumId, session, {
        enabled: form.enabled,
        ratePercent,
        gracePeriodDays,
        capPercent,
        localCurrencyCode: form.localCurrencyCode.trim().toUpperCase(),
        appliesToForeignCurrency: form.appliesToForeignCurrency,
      });
      setForm(formFromSettings(settings));
      setPreview(null);
      setMessage('Política de mora actualizada.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar la política.',
      );
    } finally {
      setSaving(false);
    }
  };

  const reviewApply = async () => {
    setPreviewing(true);
    setError('');
    setMessage('');
    try {
      const nextPreview = await previewLateFees(condominiumId, session);
      if (nextPreview.count === 0) {
        setPreview(null);
        setMessage(`No hay cuotas que requieran recargo para ${nextPreview.period}.`);
        return;
      }
      setPreview(nextPreview);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo revisar la generación de recargos.',
      );
    } finally {
      setPreviewing(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    setError('');
    setMessage('');
    try {
      const count = await applyLateFees(condominiumId, session);
      const period = preview?.period ?? 'este mes';
      setPreview(null);
      setMessage(
        count > 0
          ? `Se generaron ${count} recargo(s) por mora para ${period}.`
          : `No quedan cuotas que requieran recargo para ${period}.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudieron generar recargos.',
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Drawer eyebrow="Cobranza" onClose={onClose} prefix="late-fees" title="Recargos por mora">
        {loading || !form ? (
          <p className="late-fees-drawer__loading">Cargando política...</p>
        ) : (
          <div className="late-fees-drawer__content ux-form">
            <p className="late-fees-drawer__intro">
              Cada condominio define su propia política de mora. Habitta aplica como máximo un
              recargo por cuota vencida en cada mes calendario y nunca genera recargos sobre otros
              recargos.
            </p>

            {error ? (
              <div className="late-fees-drawer__alert" data-tone="error" role="alert">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="late-fees-drawer__alert" data-tone="success" role="status">
                {message}
              </div>
            ) : null}

            <label className="late-fees-drawer__toggle">
              <input
                checked={form.enabled}
                disabled={!canManage}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                type="checkbox"
              />
              <span>
                <strong>Aplicar recargo por mora</strong>
                <small>Mientras esté apagado, ninguna cuota vencida genera cargos nuevos.</small>
              </span>
            </label>

            <FormGrid>
              <Field
                hint="Porcentaje mensual sobre el saldo vencido de cada cuota. Se cobra como máximo una vez por mes calendario."
                label="Tasa mensual (%)"
              >
                <input
                  className="input"
                  disabled={!canManage}
                  max={100}
                  min={0}
                  onChange={(event) => setForm({ ...form, ratePercent: event.target.value })}
                  step="0.01"
                  type="number"
                  value={form.ratePercent}
                />
              </Field>
              <Field
                hint="Días de gracia después del vencimiento antes de aplicar el recargo."
                label="Período de gracia (días)"
              >
                <input
                  className="input"
                  disabled={!canManage}
                  max={365}
                  min={0}
                  onChange={(event) => setForm({ ...form, gracePeriodDays: event.target.value })}
                  step="1"
                  type="number"
                  value={form.gracePeriodDays}
                />
              </Field>
              <Field
                hint="Deja vacío para no limitar el recargo acumulado entre meses."
                label="Tope (% del cargo original)"
              >
                <input
                  className="input"
                  disabled={!canManage}
                  max={500}
                  min={0}
                  onChange={(event) => setForm({ ...form, capPercent: event.target.value })}
                  placeholder="Sin tope"
                  step="0.01"
                  type="number"
                  value={form.capPercent}
                />
              </Field>
              <Field hint="Moneda de referencia de este condominio." label="Moneda local">
                <input
                  className="input"
                  disabled={!canManage}
                  maxLength={3}
                  onChange={(event) =>
                    setForm({ ...form, localCurrencyCode: event.target.value.toUpperCase() })
                  }
                  value={form.localCurrencyCode}
                />
              </Field>
            </FormGrid>

            <label className="late-fees-drawer__toggle">
              <input
                checked={form.appliesToForeignCurrency}
                disabled={!canManage}
                onChange={(event) =>
                  setForm({ ...form, appliesToForeignCurrency: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                <strong>Aplicar también a saldos en moneda extranjera</strong>
                <small>
                  Si se apaga, solo las cuotas en {form.localCurrencyCode || 'la moneda local'}{' '}
                  generan recargo.
                </small>
              </span>
            </label>

            {canManage ? (
              <FormActions>
                <Button disabled={saving} onClick={() => void save()} type="button">
                  {saving ? 'Guardando...' : 'Guardar política'}
                </Button>
                <Button
                  disabled={previewing || applying || !form.enabled}
                  onClick={() => void reviewApply()}
                  type="button"
                  variant="secondary"
                >
                  {previewing ? 'Revisando...' : 'Revisar recargos del mes'}
                </Button>
              </FormActions>
            ) : null}
          </div>
        )}
      </Drawer>

      {preview ? (
        <ConfirmDialog
          busy={applying}
          busyLabel="Generando recargos…"
          confirmLabel="Generar recargos"
          description={`Habitta aplicará como máximo un recargo mensual por cuota vencida para ${preview.period}.`}
          onCancel={() => setPreview(null)}
          onConfirm={() => void apply()}
          title="Confirmar recargos por mora"
        >
          <div className="late-fees-drawer__preview" role="note">
            <strong>{preview.count} cuota(s) recibirán recargo.</strong>
            {preview.totals.map((total) => (
              <p key={total.currencyCode}>
                {formatDashboardAmount(total.amount, total.currencyCode)} en {total.currencyCode}
              </p>
            ))}
          </div>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
