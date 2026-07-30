import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Organization } from './AppShell';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  HomeIcon,
  LogOutIcon,
  PeopleIcon,
  SettingsIcon,
} from './icons';
import { Button, Field, Surface } from './ui';
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  PROGRESSIVE_SETUP_ITEMS,
  TIMEZONE_OPTIONS,
  createEmptyAdminOnboardingInput,
  submitAdminOnboarding,
  suggestedCurrency,
  suggestedTimezone,
  validateAdminOnboarding,
  type AdminOnboardingErrors,
  type AdminOnboardingInput,
  type OrganizationType,
} from '../lib/adminOnboarding';

type Step = 'organization' | 'condominium' | 'review' | 'complete';

type Props = {
  organizations: Organization[];
  onComplete: () => Promise<void>;
  onSignOut: () => void;
};

const organizationChoices: Array<{
  value: OrganizationType;
  title: string;
  description: string;
  icon: typeof HomeIcon;
}> = [
  {
    value: 'independent',
    title: 'Administración independiente',
    description: 'Para una persona o junta que administra su propio condominio.',
    icon: HomeIcon,
  },
  {
    value: 'management_company',
    title: 'Empresa administradora',
    description: 'Para una empresa que administrará varios condominios desde la misma cuenta.',
    icon: PeopleIcon,
  },
];

function BrandLockup() {
  return (
    <div className="access-brand">
      <span className="brand-mark">
        <HomeIcon size={21} />
      </span>
      <span>
        <strong>Habitta</strong>
        <small>Gestión de condominios</small>
      </span>
    </div>
  );
}

function reviewValue(value: string) {
  return value.trim() || 'No especificado';
}

export function AdminOnboardingWizard({ organizations, onComplete, onSignOut }: Props) {
  const hasOrganization = organizations.length > 0;
  const [step, setStep] = useState<Step>(hasOrganization ? 'condominium' : 'organization');
  const [input, setInput] = useState<AdminOnboardingInput>(() =>
    createEmptyAdminOnboardingInput(organizations[0]?.id ?? ''),
  );
  const [errors, setErrors] = useState<AdminOnboardingErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === input.organizationId),
    [input.organizationId, organizations],
  );

  const steps = hasOrganization
    ? [
        { key: 'condominium', label: 'Condominio', hint: 'Datos principales' },
        { key: 'review', label: 'Confirmación', hint: 'Revisa y crea' },
        { key: 'complete', label: 'Listo', hint: 'Próximos pasos' },
      ]
    : [
        { key: 'organization', label: 'Administración', hint: 'Cómo trabajarás' },
        { key: 'condominium', label: 'Condominio', hint: 'Datos principales' },
        { key: 'review', label: 'Confirmación', hint: 'Revisa y crea' },
        { key: 'complete', label: 'Listo', hint: 'Próximos pasos' },
      ];

  const activeIndex = steps.findIndex((item) => item.key === step);

  const update = <Key extends keyof AdminOnboardingInput>(
    key: Key,
    value: AdminOnboardingInput[Key],
  ) => {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError('');
  };

  const continueFromOrganization = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateAdminOnboarding(input, false);
    if (nextErrors.organizationName) {
      setErrors(nextErrors);
      return;
    }
    setStep('condominium');
  };

  const continueFromCondominium = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateAdminOnboarding(input, hasOrganization);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setStep('review');
  };

  const createWorkspace = async () => {
    const nextErrors = validateAdminOnboarding(input, hasOrganization);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStep('condominium');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      await submitAdminOnboarding(input, hasOrganization);
      setStep('complete');
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'No pudimos completar la configuración. Intenta nuevamente.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-onboarding-shell">
      <header className="onboarding-topbar">
        <BrandLockup />
        <Button onClick={onSignOut} size="sm" type="button" variant="ghost">
          <LogOutIcon size={17} />
          Cerrar sesión
        </Button>
      </header>

      <div className="admin-onboarding-layout">
        <aside className="admin-onboarding-progress">
          <span className="access-kicker">Configuración inicial</span>
          <h1>
            {hasOrganization ? 'Agrega otro condominio.' : 'Preparemos tu espacio en Habitta.'}
          </h1>
          <p>
            Solo pediremos la información necesaria para empezar. La configuración financiera y la
            carga de residentes se completan después.
          </p>
          <ol>
            {steps.map((item, index) => {
              const complete = index < activeIndex;
              const active = index === activeIndex;
              return (
                <li
                  data-active={active || undefined}
                  data-complete={complete || undefined}
                  key={item.key}
                >
                  <span>{complete ? <CheckCircleIcon size={18} /> : index + 1}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="admin-onboarding-stage">
          <Surface className="admin-onboarding-card">
            {step === 'organization' ? (
              <form className="admin-onboarding-form" onSubmit={continueFromOrganization}>
                <div>
                  <span className="access-kicker">Tu modelo de administración</span>
                  <h2>¿Cómo trabajarás con Habitta?</h2>
                  <p>Esta selección organiza la experiencia; no limita el crecimiento futuro.</p>
                </div>

                <div className="organization-choice-grid">
                  {organizationChoices.map((choice) => {
                    const Icon = choice.icon;
                    const selected = input.organizationType === choice.value;
                    return (
                      <button
                        aria-pressed={selected}
                        className="organization-choice"
                        data-selected={selected || undefined}
                        key={choice.value}
                        onClick={() => update('organizationType', choice.value)}
                        type="button"
                      >
                        <span>
                          <Icon size={25} />
                        </span>
                        <strong>{choice.title}</strong>
                        <small>{choice.description}</small>
                      </button>
                    );
                  })}
                </div>

                <Field
                  error={errors.organizationName}
                  hint={
                    input.organizationType === 'management_company'
                      ? 'Ejemplo: Administradora Los Samanes'
                      : 'Puede ser el nombre de la junta o de la administración.'
                  }
                  label={
                    input.organizationType === 'management_company'
                      ? 'Nombre de la empresa administradora'
                      : 'Nombre de la organización'
                  }
                >
                  <input
                    autoFocus
                    className="input"
                    maxLength={120}
                    onChange={(event) => update('organizationName', event.target.value)}
                    placeholder={
                      input.organizationType === 'management_company'
                        ? 'Nombre de la empresa'
                        : 'Nombre de la administración'
                    }
                    value={input.organizationName}
                  />
                </Field>

                <div className="onboarding-card__actions">
                  <Button type="submit">
                    Continuar
                    <ArrowRightIcon size={18} />
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'condominium' ? (
              <form className="admin-onboarding-form" onSubmit={continueFromCondominium}>
                <div>
                  <span className="access-kicker">Primer condominio</span>
                  <h2>Registra la información principal.</h2>
                  <p>Estos datos se usarán en reportes, fechas, pagos y comunicaciones.</p>
                </div>

                {hasOrganization ? (
                  <Field
                    error={errors.organizationId}
                    hint="Puedes administrar varios condominios bajo la misma organización."
                    label="Organización administradora"
                  >
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
                ) : null}

                <div className="admin-onboarding-fields">
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
                        update('countryCode', countryCode);
                        setInput((current) => ({
                          ...current,
                          countryCode,
                          timezone: suggestedTimezone(countryCode),
                          primaryCurrencyCode,
                          secondaryCurrencyCode: primaryCurrencyCode === 'USD' ? '' : 'USD',
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
                    hint="Opcional. Habitta mantendrá saldos separados por moneda."
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

                  <Field
                    error={errors.approximateUnits}
                    hint="Solo se usa para orientar la configuración inicial."
                    label="Cantidad aproximada de unidades"
                  >
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

                  <Field
                    hint="Opcional. Podrás crear el resto de las torres después."
                    label="Nombre de la primera torre"
                  >
                    <input
                      className="input"
                      maxLength={120}
                      onChange={(event) => update('firstBuildingName', event.target.value)}
                      placeholder="Ejemplo: Torre A"
                      value={input.firstBuildingName}
                    />
                  </Field>
                </div>

                <div className="onboarding-card__actions">
                  {!hasOrganization ? (
                    <Button onClick={() => setStep('organization')} type="button" variant="ghost">
                      Atrás
                    </Button>
                  ) : null}
                  <Button type="submit">
                    Revisar información
                    <ArrowRightIcon size={18} />
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'review' ? (
              <div className="admin-onboarding-form">
                <div>
                  <span className="access-kicker">Confirmación</span>
                  <h2>Revisa antes de crear el espacio.</h2>
                  <p>
                    La organización, los roles y el condominio se crearán en una sola operación
                    segura.
                  </p>
                </div>

                <dl className="admin-onboarding-review">
                  <div>
                    <dt>Administración</dt>
                    <dd>
                      {hasOrganization ? selectedOrganization?.name : input.organizationName.trim()}
                    </dd>
                  </div>
                  {!hasOrganization ? (
                    <div>
                      <dt>Tipo</dt>
                      <dd>
                        {input.organizationType === 'management_company'
                          ? 'Empresa administradora'
                          : 'Administración independiente'}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Condominio</dt>
                    <dd>{input.condominiumName.trim()}</dd>
                  </div>
                  <div>
                    <dt>Ubicación</dt>
                    <dd>
                      {input.city.trim()} · {input.countryCode} · {input.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt>Monedas</dt>
                    <dd>
                      {input.primaryCurrencyCode}
                      {input.secondaryCurrencyCode ? ` + ${input.secondaryCurrencyCode}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Unidades / primera torre</dt>
                    <dd>
                      {reviewValue(input.approximateUnits)} / {reviewValue(input.firstBuildingName)}
                    </dd>
                  </div>
                  <div>
                    <dt>Roles asignados</dt>
                    <dd>
                      {hasOrganization
                        ? 'condominium_admin'
                        : 'organization_owner + condominium_admin'}
                    </dd>
                  </div>
                </dl>

                {submitError ? (
                  <p className="access-message" data-tone="error" role="alert">
                    {submitError}
                  </p>
                ) : null}

                <div className="onboarding-card__actions">
                  <Button
                    disabled={submitting}
                    onClick={() => setStep('condominium')}
                    type="button"
                    variant="ghost"
                  >
                    Editar
                  </Button>
                  <Button
                    disabled={submitting}
                    onClick={() => void createWorkspace()}
                    type="button"
                  >
                    {submitting ? 'Creando espacio…' : 'Crear condominio'}
                    {!submitting ? <ArrowRightIcon size={18} /> : null}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 'complete' ? (
              <div className="admin-onboarding-complete">
                <span className="admin-onboarding-success">
                  <CheckCircleIcon size={34} />
                </span>
                <div>
                  <span className="access-kicker">Configuración completada</span>
                  <h2>Tu condominio está listo para comenzar.</h2>
                  <p>
                    Los datos quedaron separados por comunidad y los permisos fueron asignados por
                    el servidor.
                  </p>
                </div>

                <div className="admin-onboarding-roles">
                  {!hasOrganization ? <span>organization_owner</span> : null}
                  <span>condominium_admin</span>
                </div>

                <section className="progressive-setup-card">
                  <div>
                    <SettingsIcon size={21} />
                    <div>
                      <strong>Configuración progresiva</strong>
                      <small>Completa estos pasos desde Configuración cuando estés listo.</small>
                    </div>
                  </div>
                  <ul>
                    {PROGRESSIVE_SETUP_ITEMS.map((item, index) => (
                      <li key={item}>
                        <span>{index + 1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>

                <Button onClick={() => void onComplete()} type="button">
                  Ir al dashboard
                  <ArrowRightIcon size={18} />
                </Button>
              </div>
            ) : null}
          </Surface>
        </section>
      </div>
    </main>
  );
}
