import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AnnouncementsIcon,
  CheckCircleIcon,
  FeesIcon,
  PaymentsIcon,
  PeopleIcon,
  SettingsIcon,
} from '../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { CondominiumDangerZone } from '../features/settings/CondominiumDangerZone';
import {
  getNotificationSettings,
  getPreferences,
  saveNotificationSettings,
  savePreference,
} from '../features/notifications/api';
import type { NotificationPreference, NotificationSettings } from '../features/notifications/types';
import {
  getChangedNotificationPreferences,
  getNotificationChannelTotals,
  normalizeNotificationPreferences,
  notificationGroupLabels,
  notificationTypeMetadata,
} from '../lib/settings';
import type { NotificationPreferenceDraft, NotificationType } from '../lib/settings';
import '../settings.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type SettingsData = {
  settings: NotificationSettings | null;
  settingsAvailable: boolean;
  preferences: NotificationPreferenceDraft[];
};

const timezoneOptions = [
  'America/Caracas',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Santiago',
  'UTC',
];

function Toggle({
  checked,
  label,
  description,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className="settings-switch"
        data-checked={checked || undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
}) {
  return (
    <Surface className="settings-metric" data-tone={tone}>
      <div className="settings-metric__heading">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Surface>
  );
}

function SettingsLoading() {
  return (
    <div aria-label="Cargando configuración" className="settings-page">
      <PageHeader eyebrow="Sistema y preferencias" title="Configuración" />
      <div className="settings-metrics-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="settings-panel-skeleton" />
    </div>
  );
}

function channelIcon(notificationType: NotificationType) {
  if (notificationType.startsWith('payment_')) return <PaymentsIcon size={18} />;
  if (notificationType.startsWith('receivable_')) return <FeesIcon size={18} />;
  if (notificationType === 'opening_balance_created') return <SettingsIcon size={18} />;
  return <AnnouncementsIcon size={18} />;
}

export function SettingsPage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [originalPreferences, setOriginalPreferences] = useState<NotificationPreferenceDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [preferenceResult, settingsResult] = await Promise.allSettled([
        getPreferences(session, condominiumId),
        getNotificationSettings(session, condominiumId),
      ]);
      if (preferenceResult.status === 'rejected' && settingsResult.status === 'rejected') {
        throw preferenceResult.reason;
      }
      const preferenceRows =
        preferenceResult.status === 'fulfilled'
          ? (preferenceResult.value as NotificationPreference[])
          : [];
      const normalized = normalizeNotificationPreferences(preferenceRows);
      setOriginalPreferences(normalized);
      setData({
        preferences: normalized,
        settings:
          settingsResult.status === 'fulfilled'
            ? (settingsResult.value as NotificationSettings)
            : null,
        settingsAvailable: settingsResult.status === 'fulfilled',
      });
      if (settingsResult.status === 'rejected') {
        setError(
          'La configuración global está restringida para tu rol. Tus preferencias personales siguen disponibles.',
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar la configuración.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setMessage('');
  }, [condominiumId]);

  const totals = useMemo(
    () => getNotificationChannelTotals(data?.preferences ?? []),
    [data?.preferences],
  );

  const changedPreferences = useMemo(
    () => (data ? getChangedNotificationPreferences(originalPreferences, data.preferences) : []),
    [data, originalPreferences],
  );

  const updatePreference = (
    notificationType: NotificationType,
    channel: 'in_app_enabled' | 'email_enabled',
    checked: boolean,
  ) => {
    setData((current) =>
      current
        ? {
            ...current,
            preferences: current.preferences.map((preference) =>
              preference.notification_type === notificationType
                ? { ...preference, [channel]: checked }
                : preference,
            ),
          }
        : current,
    );
  };

  const updateSettings = (patch: Partial<NotificationSettings>) => {
    setData((current) =>
      current?.settings ? { ...current, settings: { ...current.settings, ...patch } } : current,
    );
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (data.settings) {
        await saveNotificationSettings(session, condominiumId, data.settings);
      }
      for (const preference of changedPreferences) {
        await savePreference(session, condominiumId, preference);
      }
      setOriginalPreferences(data.preferences.map((preference) => ({ ...preference })));
      setMessage('Configuración guardada correctamente.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron guardar todos los cambios.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <SettingsLoading />;

  if (!data) {
    return (
      <Surface className="settings-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir este espacio de configuración.'}
          icon={<SettingsIcon size={28} />}
          onAction={() => void load()}
          title="Configuración no disponible"
        />
      </Surface>
    );
  }

  const hasChanges = changedPreferences.length > 0 || Boolean(data.settings);
  const userLabel =
    typeof session.user.user_metadata.full_name === 'string'
      ? session.user.user_metadata.full_name
      : (session.user.email ?? 'Usuario Habitta');

  return (
    <div className="settings-page">
      <PageHeader
        actions={
          <>
            <span className="settings-save-state">
              {changedPreferences.length
                ? `${changedPreferences.length} preferencias modificadas`
                : 'Preferencias sincronizadas'}
            </span>
            <Button disabled={saving || !hasChanges} onClick={() => void save()} size="sm">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </>
        }
        description={`${condominiumName} · controla canales, recordatorios y preferencias personales.`}
        eyebrow="Sistema y preferencias"
        title="Configuración"
      />

      {error ? <div className="settings-inline-alert">{error}</div> : null}
      {message ? (
        <div className="settings-success-alert">
          <CheckCircleIcon size={17} /> {message}
        </div>
      ) : null}

      <section aria-label="Resumen de configuración" className="settings-metrics-grid">
        <MetricCard
          detail="Eventos habilitados dentro de la aplicación."
          icon={<AnnouncementsIcon size={20} />}
          label="Notificaciones internas"
          tone="blue"
          value={`${totals.inAppEnabled}/${totals.total}`}
        />
        <MetricCard
          detail="Preferencias que también solicitan entrega por correo."
          icon={<PeopleIcon size={20} />}
          label="Eventos por correo"
          tone="green"
          value={`${totals.emailEnabled}/${totals.total}`}
        />
        <MetricCard
          detail="Anticipación configurada para cuotas próximas a vencer."
          icon={<FeesIcon size={20} />}
          label="Aviso previo"
          tone="navy"
          value={data.settings ? `${data.settings.due_soon_days} días` : 'Restringido'}
        />
        <MetricCard
          detail="Zona usada para programar vencimientos y recordatorios."
          icon={<SettingsIcon size={20} />}
          label="Zona horaria"
          tone="red"
          value={data.settings?.timezone ?? 'No disponible'}
        />
      </section>

      <section className="settings-layout">
        <div className="settings-primary-column">
          <Surface className="settings-panel settings-global-panel">
            <div className="settings-section-heading">
              <div>
                <span className="settings-kicker">Reglas del condominio</span>
                <h2>Automatización de recordatorios</h2>
                <p>Controles globales que definen cuándo Habitta prepara las notificaciones.</p>
              </div>
              <Badge tone={data.settingsAvailable ? 'success' : 'warning'}>
                {data.settingsAvailable ? 'Administrable' : 'Solo lectura'}
              </Badge>
            </div>
            {data.settings ? (
              <div className="settings-global-list">
                <Toggle
                  checked={data.settings.email_enabled}
                  description="Permite que las preferencias individuales utilicen el canal de correo."
                  label="Canal de correo del condominio"
                  onChange={(checked) => updateSettings({ email_enabled: checked })}
                />
                <Toggle
                  checked={data.settings.due_soon_enabled}
                  description="Genera recordatorios antes de que una cuota alcance su fecha límite."
                  label="Avisos de próximo vencimiento"
                  onChange={(checked) => updateSettings({ due_soon_enabled: checked })}
                />
                <div className="settings-rule-grid">
                  <Field hint="Entre 1 y 30 días." label="Días de anticipación">
                    <input
                      className="input"
                      disabled={!data.settings.due_soon_enabled}
                      max={30}
                      min={1}
                      onChange={(event) =>
                        updateSettings({ due_soon_days: Number(event.target.value) })
                      }
                      type="number"
                      value={data.settings.due_soon_days}
                    />
                  </Field>
                  <Field label="Zona horaria">
                    <Select
                      onChange={(event) => updateSettings({ timezone: event.target.value })}
                      value={data.settings.timezone}
                    >
                      {timezoneOptions.map((timezone) => (
                        <option key={timezone} value={timezone}>
                          {timezone}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Toggle
                  checked={data.settings.overdue_enabled}
                  description="Genera alertas cuando una obligación supera su fecha de vencimiento."
                  label="Avisos de cuotas vencidas"
                  onChange={(checked) => updateSettings({ overdue_enabled: checked })}
                />
              </div>
            ) : (
              <EmptyState
                description="Tu rol puede personalizar sus canales, pero no modificar las reglas generales."
                icon={<SettingsIcon size={25} />}
                title="Configuración global restringida"
              />
            )}
          </Surface>

          <Surface className="settings-panel settings-preferences-panel">
            <div className="settings-section-heading">
              <div>
                <span className="settings-kicker">Preferencias personales</span>
                <h2>Canales por evento</h2>
                <p>Elige qué eventos llegan dentro de Habitta y cuáles también solicitan correo.</p>
              </div>
              <div className="settings-channel-legend">
                <span>En app</span>
                <span>Correo</span>
              </div>
            </div>
            <div className="settings-preference-groups">
              {(['cobranza', 'pagos', 'vencimientos'] as const).map((group) => (
                <section key={group}>
                  <h3>{notificationGroupLabels[group]}</h3>
                  <div className="settings-preference-list">
                    {data.preferences
                      .filter(
                        (preference) =>
                          notificationTypeMetadata[preference.notification_type].group === group,
                      )
                      .map((preference) => {
                        const metadata = notificationTypeMetadata[preference.notification_type];
                        return (
                          <article key={preference.notification_type}>
                            <span className="settings-event-icon">
                              {channelIcon(preference.notification_type)}
                            </span>
                            <div>
                              <strong>{metadata.label}</strong>
                              <small>{metadata.description}</small>
                            </div>
                            <button
                              aria-checked={preference.in_app_enabled}
                              aria-label={`${metadata.label} dentro de Habitta`}
                              className="settings-channel-toggle"
                              data-checked={preference.in_app_enabled || undefined}
                              onClick={() =>
                                updatePreference(
                                  preference.notification_type,
                                  'in_app_enabled',
                                  !preference.in_app_enabled,
                                )
                              }
                              role="switch"
                              type="button"
                            >
                              <span />
                            </button>
                            <button
                              aria-checked={preference.email_enabled}
                              aria-label={`${metadata.label} por correo`}
                              className="settings-channel-toggle"
                              data-checked={preference.email_enabled || undefined}
                              disabled={data.settings ? !data.settings.email_enabled : false}
                              onClick={() =>
                                updatePreference(
                                  preference.notification_type,
                                  'email_enabled',
                                  !preference.email_enabled,
                                )
                              }
                              role="switch"
                              type="button"
                            >
                              <span />
                            </button>
                          </article>
                        );
                      })}
                  </div>
                </section>
              ))}
            </div>
          </Surface>
        </div>

        <aside className="settings-secondary-column">
          <Surface className="settings-panel settings-account-card">
            <div className="settings-section-heading">
              <div>
                <span className="settings-kicker">Sesión actual</span>
                <h2>Cuenta</h2>
              </div>
            </div>
            <div className="settings-account-profile">
              <span>{userLabel.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{userLabel}</strong>
                <small>{session.user.email ?? 'Sin correo disponible'}</small>
              </div>
            </div>
            <dl className="settings-account-details">
              <div>
                <dt>Condominio</dt>
                <dd>{condominiumName}</dd>
              </div>
              <div>
                <dt>Usuario</dt>
                <dd>{session.user.id.slice(0, 8)}…</dd>
              </div>
              <div>
                <dt>Autenticación</dt>
                <dd>Supabase Auth</dd>
              </div>
            </dl>
          </Surface>

          <Surface className="settings-panel settings-delivery-card">
            <div className="settings-section-heading">
              <div>
                <span className="settings-kicker">Entrega segura</span>
                <h2>Cómo se aplican los canales</h2>
              </div>
            </div>
            <div className="settings-delivery-flow">
              <article>
                <span>1</span>
                <div>
                  <strong>Habitta detecta el evento</strong>
                  <small>Cuota, pago, recibo o vencimiento.</small>
                </div>
              </article>
              <article>
                <span>2</span>
                <div>
                  <strong>Aplica las reglas globales</strong>
                  <small>Correo, anticipación y zona horaria.</small>
                </div>
              </article>
              <article>
                <span>3</span>
                <div>
                  <strong>Respeta tu preferencia</strong>
                  <small>En app, correo o ambos canales.</small>
                </div>
              </article>
            </div>
            <p className="settings-delivery-note">
              En development el correo puede permanecer deshabilitado por seguridad aunque la
              preferencia esté seleccionada. La aplicación conserva la configuración para el entorno
              que permita entregas.
            </p>
          </Surface>

          <CondominiumDangerZone
            condominiumId={condominiumId}
            condominiumName={condominiumName}
            session={session}
          />
        </aside>
      </section>
    </div>
  );
}
