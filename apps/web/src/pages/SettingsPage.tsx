import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Badge,
  Button,
  EmptyState,
  Field,
  InfoHint,
  Select,
  Skeleton,
  Surface,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { CondominiumBillingPanel } from '../features/settings/CondominiumBillingPanel';
import { CondominiumDangerZone } from '../features/settings/CondominiumDangerZone';
import { CondominiumIdentityPanel } from '../features/settings/CondominiumIdentityPanel';
import '../features/settings/settings-section-nav.css';
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
  hasNotificationSettingsChanges,
  normalizeNotificationPreferences,
  notificationGroupLabels,
  notificationTypeMetadata,
} from '../lib/settings';
import type { NotificationPreferenceDraft, NotificationType } from '../lib/settings';
import { useCondominiumRoles } from '../lib/roles';
import '../settings.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type SettingsData = {
  scopeKey: string;
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
  className,
  icon,
  label,
  value,
  detail,
  tone,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'navy' | 'red';
}) {
  return (
    <Surface className={['settings-metric', className].filter(Boolean).join(' ')} data-tone={tone}>
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
  const [originalSettings, setOriginalSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // get_condominium_notification_settings is restricted server-side to organization owners,
  // condominium admins and accountants (can_manage_receivables raises 42501 for every other
  // role). Every condominium-creation path grants its creator both memberships atomically, so a
  // real organization owner always also holds condominium_admin here -- skip the request for
  // roles that can never pass that check instead of firing a guaranteed-403 RPC call on every
  // Settings visit. The rest of this component already renders the "restricted" state correctly
  // when settingsResult is unavailable, so this only removes the doomed network call.
  const roles = useCondominiumRoles();
  const canManageNotificationSettings =
    roles.includes('condominium_admin') || roles.includes('accountant');

  // Settings belong to the selected condominium. This mirrors the workspace request-ownership
  // pattern so a response from an old scope cannot replace the current page.
  const viewScopeKey = `${condominiumId}:${session.user.id}:${roles.join(',')}`;
  const requestScopeKey = `${viewScopeKey}:${session.access_token}`;
  const scopeKeyRef = useRef(requestScopeKey);
  scopeKeyRef.current = requestScopeKey;
  const latestRequest = useRef(0);
  const ownsScope = useCallback((requestScope: string) => scopeKeyRef.current === requestScope, []);

  const load = useCallback(async () => {
    const requestScope = requestScopeKey;
    const requestId = ++latestRequest.current;
    const ownsRequest = () => ownsScope(requestScope) && requestId === latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const [preferenceResult, settingsResult] = await Promise.allSettled([
        getPreferences(session, condominiumId),
        canManageNotificationSettings
          ? getNotificationSettings(session, condominiumId)
          : Promise.reject(new Error('restricted-role')),
      ]);
      if (preferenceResult.status === 'rejected' && settingsResult.status === 'rejected') {
        throw preferenceResult.reason;
      }
      const preferenceRows =
        preferenceResult.status === 'fulfilled'
          ? (preferenceResult.value as NotificationPreference[])
          : [];
      const normalized = normalizeNotificationPreferences(preferenceRows);
      if (!ownsRequest()) return;
      setOriginalPreferences(normalized);
      const settings =
        settingsResult.status === 'fulfilled'
          ? (settingsResult.value as NotificationSettings)
          : null;
      setOriginalSettings(settings);
      setData({
        scopeKey: viewScopeKey,
        preferences: normalized,
        settings,
        settingsAvailable: settingsResult.status === 'fulfilled',
      });
      if (settingsResult.status === 'rejected') {
        setError(
          'La configuración global está restringida para tu rol. Tus preferencias personales siguen disponibles.',
        );
      }
    } catch (requestError) {
      if (!ownsRequest()) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar la configuración.',
      );
    } finally {
      if (ownsRequest()) setLoading(false);
    }
  }, [
    condominiumId,
    session,
    canManageNotificationSettings,
    ownsScope,
    requestScopeKey,
    viewScopeKey,
  ]);

  useEffect(() => {
    // Do not render one condominium's settings under another condominium's heading while a new
    // request is in flight. A token refresh within the same condominium keeps loaded data.
    latestRequest.current += 1;
    setData(null);
    setOriginalPreferences([]);
    setOriginalSettings(null);
    setError('');
    setMessage('');
    setLoading(true);
    setSaving(false);
  }, [viewScopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () => getNotificationChannelTotals(data?.preferences ?? []),
    [data?.preferences],
  );

  const changedPreferences = useMemo(
    () => (data ? getChangedNotificationPreferences(originalPreferences, data.preferences) : []),
    [data, originalPreferences],
  );

  const settingsChanged = useMemo(
    () => hasNotificationSettingsChanges(originalSettings, data?.settings ?? null),
    [data?.settings, originalSettings],
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
    if (!data || (!settingsChanged && !changedPreferences.length)) return;
    const saveScope = requestScopeKey;
    const saveVersion = latestRequest.current;
    const settingsToSave = settingsChanged && data.settings ? { ...data.settings } : null;
    const preferencesToSave = changedPreferences.map((preference) => ({ ...preference }));
    const savedPreferenceTypes = new Set<NotificationType>();
    const failures: string[] = [];
    let settingsSaved = false;
    setSaving(true);
    setError('');
    setMessage('');
    if (settingsToSave) {
      try {
        await saveNotificationSettings(session, condominiumId, settingsToSave);
        settingsSaved = true;
      } catch {
        failures.push('settings');
      }
    }
    for (const preference of preferencesToSave) {
      try {
        await savePreference(session, condominiumId, preference);
        savedPreferenceTypes.add(preference.notification_type);
      } catch {
        failures.push('preference');
      }
    }
    if (!ownsScope(saveScope) || saveVersion !== latestRequest.current) return;
    if (settingsSaved && settingsToSave) setOriginalSettings(settingsToSave);
    if (savedPreferenceTypes.size) {
      setOriginalPreferences((current) =>
        current.map((preference) => {
          const saved = preferencesToSave.find(
            (candidate) => candidate.notification_type === preference.notification_type,
          );
          return saved && savedPreferenceTypes.has(preference.notification_type)
            ? saved
            : preference;
        }),
      );
    }
    if (!failures.length) {
      setMessage('Configuración guardada correctamente.');
    } else if (settingsSaved || savedPreferenceTypes.size) {
      setError(
        'Se guardaron algunos cambios. Revisa los cambios pendientes e inténtalo nuevamente.',
      );
    } else {
      setError('No se pudieron guardar los cambios. Inténtalo nuevamente.');
    }
    setSaving(false);
  };

  const hasCurrentScopeData = data?.scopeKey === viewScopeKey;

  if ((loading && !data) || (data && !hasCurrentScopeData)) return <SettingsLoading />;

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

  const hasChanges = settingsChanged || changedPreferences.length > 0;
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
              {hasChanges
                ? `${(settingsChanged ? 1 : 0) + changedPreferences.length} cambios sin guardar`
                : 'Cambios guardados'}
            </span>
            <Button disabled={saving || !hasChanges} onClick={() => void save()} size="sm">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </>
        }
        description={`${condominiumName} · administra identidad, notificaciones, preferencias y la suscripción de Habitta.`}
        eyebrow="Sistema y preferencias"
        title="Configuración"
      />

      {error ? <div className="settings-inline-alert">{error}</div> : null}
      {message ? (
        <div className="settings-success-alert">
          <CheckCircleIcon size={17} /> {message}
        </div>
      ) : null}

      <nav aria-label="Secciones de configuración" className="settings-section-nav">
        <a href="#notificaciones">Notificaciones</a>
        <a href="#perfil-condominio">Perfil del condominio</a>
        <a href="#plan-facturacion">Plan y facturación</a>
        <a href="#seguridad">Seguridad</a>
      </nav>

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
          className="settings-metric--timezone"
          detail="Zona usada para programar vencimientos y recordatorios."
          icon={<SettingsIcon size={20} />}
          label="Zona horaria"
          tone="red"
          value={data.settings?.timezone ?? 'No disponible'}
        />
      </section>

      <section className="settings-layout settings-anchor-section" id="notificaciones">
        <div className="settings-primary-column">
          <Surface className="settings-panel settings-global-panel">
            <div className="settings-section-heading">
              <div>
                <span className="settings-kicker">Reglas del condominio</span>
                <h2>
                  Automatización de recordatorios
                  <InfoHint label="Más información sobre automatización de recordatorios">
                    Controles globales que definen cuándo Habitta prepara las notificaciones.
                  </InfoHint>
                </h2>
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
                      onChange={(event) => {
                        // An intermediate/empty value (e.g. the field cleared, or just "-" while
                        // typing) parses to NaN; ignore it instead of pushing NaN into settings,
                        // where it would render as an invalid number and could reach the request
                        // body as `null`.
                        const parsed = Number(event.target.value);
                        if (Number.isNaN(parsed)) return;
                        updateSettings({ due_soon_days: parsed });
                      }}
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
                <h2>
                  Canales por evento
                  <InfoHint label="Más información sobre canales por evento">
                    Elige qué eventos llegan dentro de Habitta y cuáles también solicitan correo.
                  </InfoHint>
                </h2>
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
          </Surface>

          <div className="settings-anchor-section" id="perfil-condominio">
            <CondominiumIdentityPanel condominiumId={condominiumId} session={session} />
          </div>
        </aside>
      </section>

      <CondominiumBillingPanel
        condominiumId={condominiumId}
        condominiumName={condominiumName}
        session={session}
      />

      <section className="settings-danger-section settings-anchor-section" id="seguridad">
        <CondominiumDangerZone
          condominiumId={condominiumId}
          condominiumName={condominiumName}
          session={session}
        />
      </section>
    </div>
  );
}
