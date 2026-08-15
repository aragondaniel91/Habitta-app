import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Organization } from './AppShell';
import { CondominiumProfileFields } from './CondominiumProfileFields';
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
  PROGRESSIVE_SETUP_ITEMS,
  createEmptyAdminOnboardingInput,
  submitAdminOnboarding,
  topologyLabel,
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

function structureSummary(input: AdminOnboardingInput) {
  if (input.propertyTopology === 'house_community') {
    return `${reviewValue(input.declaredUnitCount)} casas`;
  }
  if (input.propertyTopology === 'single_building') {
    return `${reviewValue(input.declaredUnitCount)} unidades · ${reviewValue(input.firstBuildingName || input.condominiumName)}`;
  }
  if (input.propertyTopology === 'multi_building_complex') {
    return `${reviewValue(input.declaredBuildingCount)} edificios o torres`;
  }
  if (input.propertyTopology === 'mixed') {
    return `${reviewValue(input.declaredBuildingCount)} edificios · ${reviewValue(input.declaredUnitCount)} unidades conocidas`;
  }
  return 'No definida';
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
        { key: 'condominium', label: 'Condominio', hint: 'Perfil y estructura' },
        { key: 'review', label: 'Confirmación', hint: 'Revisa y crea' },
        { key: 'complete', label: 'Listo', hint: 'Próximos pasos' },
      ]
    : [
        { key: 'organization', label: 'Administración', hint: 'Cómo trabajarás' },
        { key: 'condominium', label: 'Condominio', hint: 'Perfil y estructura' },
        { key: 'review', label: 'Confirmación', hint: 'Revisa y crea' },
        { key: 'complete', label: 'Listo', hint: 'Próximos pasos' },
      ];

  const activeIndex = steps.findIndex((item) => item.key === step);

  const update = (key: keyof AdminOnboardingInput, value: string) => {
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
          <h1>{hasOrganization ? 'Agrega otro condominio.' : 'Preparemos tu espacio en Habitta.'}</h1>
          <p>
            Primero definimos la identidad y estructura real del condominio. Personas, cuotas y
            operaciones se completan después sobre esa base.
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
                        <span><Icon size={25} /></span>
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
                    value={input.organizationName}
                  />
                </Field>

                <div className="onboarding-card__actions">
                  <Button type="submit">Continuar <ArrowRightIcon size={18} /></Button>
                </div>
              </form>
            ) : null}

            {step === 'condominium' ? (
              <form className="admin-onboarding-form" onSubmit={continueFromCondominium}>
                <div>
                  <span className="access-kicker">Perfil del condominio</span>
                  <h2>Registra cómo está constituida y organizada la comunidad.</h2>
                  <p>La estructura elegida adaptará Unidades, Edificios y futuras reglas financieras.</p>
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
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <CondominiumProfileFields
                  autoFocusName
                  errors={errors}
                  input={input}
                  onChange={update}
                />

                <div className="onboarding-card__actions">
                  {!hasOrganization ? (
                    <Button onClick={() => setStep('organization')} type="button" variant="ghost">Atrás</Button>
                  ) : null}
                  <Button type="submit">Revisar información <ArrowRightIcon size={18} /></Button>
                </div>
              </form>
            ) : null}

            {step === 'review' ? (
              <div className="admin-onboarding-form">
                <div>
                  <span className="access-kicker">Confirmación</span>
                  <h2>Revisa antes de crear el espacio.</h2>
                  <p>La organización, roles, perfil legal y estructura inicial se crearán en una sola operación segura.</p>
                </div>

                <dl className="admin-onboarding-review">
                  <div>
                    <dt>Administración</dt>
                    <dd>{hasOrganization ? selectedOrganization?.name : input.organizationName.trim()}</dd>
                  </div>
                  <div>
                    <dt>Condominio</dt>
                    <dd>{input.condominiumName.trim()}</dd>
                  </div>
                  <div>
                    <dt>Identificación legal</dt>
                    <dd>{input.legalIdNumber ? `${input.legalIdType} ${input.legalIdNumber}` : 'Pendiente de completar'}</dd>
                  </div>
                  <div>
                    <dt>Dirección</dt>
                    <dd>{input.addressLine1.trim()} · {input.city.trim()} · {input.countryCode}</dd>
                  </div>
                  <div>
                    <dt>Tipo de propiedad</dt>
                    <dd>{topologyLabel(input.propertyTopology)}</dd>
                  </div>
                  <div>
                    <dt>Estructura declarada</dt>
                    <dd>{structureSummary(input)}</dd>
                  </div>
                  <div>
                    <dt>Monedas</dt>
                    <dd>{input.primaryCurrencyCode}{input.secondaryCurrencyCode ? ` + ${input.secondaryCurrencyCode}` : ''}</dd>
                  </div>
                  <div>
                    <dt>Roles asignados</dt>
                    <dd>{hasOrganization ? 'condominium_admin' : 'organization_owner + condominium_admin'}</dd>
                  </div>
                </dl>

                {submitError ? <p className="access-message" data-tone="error" role="alert">{submitError}</p> : null}

                <div className="onboarding-card__actions">
                  <Button disabled={submitting} onClick={() => setStep('condominium')} type="button" variant="ghost">Editar</Button>
                  <Button disabled={submitting} onClick={() => void createWorkspace()} type="button">
                    {submitting ? 'Creando espacio…' : 'Crear condominio'}
                    {!submitting ? <ArrowRightIcon size={18} /> : null}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 'complete' ? (
              <div className="admin-onboarding-complete">
                <span className="admin-onboarding-success"><CheckCircleIcon size={34} /></span>
                <div>
                  <span className="access-kicker">Configuración completada</span>
                  <h2>Tu condominio tiene una base operativa real.</h2>
                  <p>Habitta ya conoce su identidad, ubicación y estructura física. Los siguientes módulos se configurarán sobre esa información.</p>
                </div>

                <section className="progressive-setup-card">
                  <div>
                    <SettingsIcon size={21} />
                    <div>
                      <strong>Configuración progresiva</strong>
                      <small>Completa estos pasos cuando tengas la información disponible.</small>
                    </div>
                  </div>
                  <ul>
                    {PROGRESSIVE_SETUP_ITEMS.map((item, index) => (
                      <li key={item}><span>{index + 1}</span>{item}</li>
                    ))}
                  </ul>
                </section>

                <Button onClick={() => void onComplete()} type="button">Ir al dashboard <ArrowRightIcon size={18} /></Button>
              </div>
            ) : null}
          </Surface>
        </section>
      </div>
    </main>
  );
}
