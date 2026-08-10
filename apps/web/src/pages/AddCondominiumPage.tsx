import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Organization } from '../components/AppShell';
import { ArrowRightIcon, CheckCircleIcon, HomeIcon } from '../components/icons';
import { Button, Field, Surface } from '../components/ui';
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  createEmptyAdminOnboardingInput,
  submitAdminOnboarding,
  suggestedCurrency,
  suggestedTimezone,
  validateAdminOnboarding,
  type AdminOnboardingErrors,
  type AdminOnboardingInput,
} from '../lib/adminOnboarding';
import '../add-condominium.css';

type Props = {
  organizations: Organization[];
  onCancel: () => void;
  onCreated: (condominiumId: string) => Promise<void>;
};

export function AddCondominiumPage({ organizations, onCancel, onCreated }: Props) {
  const [input, setInput] = useState<AdminOnboardingInput>(() =>
    createEmptyAdminOnboardingInput(organizations[0]?.id ?? ''),
  );
  const [errors, setErrors] = useState<AdminOnboardingErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdCondominiumId, setCreatedCondominiumId] = useState('');

  const update = <Key extends keyof AdminOnboardingInput>(
    key: Key,
    value: AdminOnboardingInput[Key],
  ) => {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateAdminOnboarding(input, true);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submitAdminOnboarding(input, true);
      const condominiumId = result?.condominium?.id ?? '';
      if (!condominiumId) {
        throw new Error('El condominio se creó, pero no pudimos identificarlo para abrirlo.');
      }
      setCreatedCondominiumId(condominiumId);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'No pudimos crear el nuevo condominio.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (createdCondominiumId) {
    return (
      <Surface className="add-condominium-card add-condominium-success">
        <span className="admin-onboarding-success">
          <CheckCircleIcon size={32} />
        </span>
        <div>
          <span className="access-kicker">Condominio agregado</span>
          <h2>{input.condominiumName.trim()} ya forma parte de tu organización.</h2>
          <p>Los datos y permisos permanecen separados de las demás comunidades.</p>
        </div>
        <Button onClick={() => void onCreated(createdCondominiumId)} type="button">
          Abrir el nuevo condominio
          <ArrowRightIcon size={18} />
        </Button>
      </Surface>
    );
  }

  return (
    <Surface className="add-condominium-card">
      <div className="add-condominium-heading">
        <span className="admin-onboarding-success">
          <HomeIcon size={27} />
        </span>
        <div>
          <span className="access-kicker">Expande tu administración</span>
          <h2>Agregar otro condominio</h2>
          <p>Reutiliza tu cuenta y organización. Habitta mantendrá cada comunidad aislada.</p>
        </div>
      </div>

      <form className="admin-onboarding-form" onSubmit={submit}>
        <div className="admin-onboarding-fields">
          <Field error={errors.organizationId} label="Organización administradora">
            <select
              className="select"
              onChange={(event) => update('organizationId', event.target.value)}
              value={input.organizationId}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </Field>

          <Field error={errors.condominiumName} label="Nombre del condominio">
            <input
              autoFocus
              className="input"
              maxLength={120}
              onChange={(event) => update('condominiumName', event.target.value)}
              placeholder="Ejemplo: Residencias Los Pinos"
              value={input.condominiumName}
            />
          </Field>

          <Field error={errors.countryCode} label="País">
            <select
              className="select"
              onChange={(event) => {
                const countryCode = event.target.value;
                const primaryCurrencyCode = suggestedCurrency(countryCode);
                setInput((current) => ({
                  ...current,
                  countryCode,
                  timezone: suggestedTimezone(countryCode),
                  primaryCurrencyCode,
                  secondaryCurrencyCode: primaryCurrencyCode === 'USD' ? '' : 'USD',
                }));
                setErrors((current) => ({
                  ...current,
                  countryCode: undefined,
                  timezone: undefined,
                  primaryCurrencyCode: undefined,
                  secondaryCurrencyCode: undefined,
                }));
              }}
              value={input.countryCode}
            >
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </Field>

          <Field error={errors.city} label="Ciudad">
            <input
              className="input"
              maxLength={100}
              onChange={(event) => update('city', event.target.value)}
              placeholder="Ciudad"
              value={input.city}
            />
          </Field>

          <Field error={errors.timezone} label="Zona horaria">
            <select
              className="select"
              onChange={(event) => update('timezone', event.target.value)}
              value={input.timezone}
            >
              {TIMEZONE_OPTIONS.map((timezone) => (
                <option key={timezone.value} value={timezone.value}>
                  {timezone.label}
                </option>
              ))}
            </select>
          </Field>

          <Field error={errors.primaryCurrencyCode} label="Moneda principal">
            <select
              className="select"
              onChange={(event) => update('primaryCurrencyCode', event.target.value)}
              value={input.primaryCurrencyCode}
            >
              {CURRENCY_OPTIONS.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            error={errors.secondaryCurrencyCode}
            hint="Opcional; los saldos siempre permanecerán separados."
            label="Moneda secundaria"
          >
            <select
              className="select"
              onChange={(event) => update('secondaryCurrencyCode', event.target.value)}
              value={input.secondaryCurrencyCode}
            >
              <option value="">Sin moneda secundaria</option>
              {CURRENCY_OPTIONS.filter(
                (currency) => currency.code !== input.primaryCurrencyCode,
              ).map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </select>
          </Field>

          <Field error={errors.approximateUnits} label="Unidades aproximadas">
            <input
              className="input"
              inputMode="numeric"
              max="100000"
              min="1"
              onChange={(event) => update('approximateUnits', event.target.value)}
              placeholder="Ejemplo: 120"
              type="number"
              value={input.approximateUnits}
            />
          </Field>

          <Field hint="Opcional" label="Primera torre">
            <input
              className="input"
              maxLength={120}
              onChange={(event) => update('firstBuildingName', event.target.value)}
              placeholder="Ejemplo: Torre A"
              value={input.firstBuildingName}
            />
          </Field>
        </div>

        {submitError ? (
          <p className="access-message" data-tone="error" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="onboarding-card__actions">
          <Button disabled={submitting} onClick={onCancel} type="button" variant="ghost">
            Cancelar
          </Button>
          <Button disabled={submitting} type="submit">
            {submitting ? 'Creando condominio…' : 'Crear condominio'}
            {!submitting ? <ArrowRightIcon size={18} /> : null}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
