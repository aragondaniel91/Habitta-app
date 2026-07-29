import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Organization } from './AppShell';
import { ArrowRightIcon, CheckCircleIcon, HomeIcon, LogOutIcon } from './icons';
import { Button, Field, Surface } from './ui';
import { apiRequest } from '../lib/api';
import { buildOnboardingRequest } from '../lib/onboarding';
import { supabase } from '../supabase';

type SignInMessage = { tone: 'error' | 'info'; text: string } | null;
type OnboardingStep = 'welcome' | 'details' | 'review';
type FieldErrors = { organizationName: string; condominiumName: string; organizationId: string };

const emptyErrors: FieldErrors = {
  organizationName: '',
  condominiumName: '',
  organizationId: '',
};

function BrandLockup({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="access-brand" data-inverse={inverse || undefined}>
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

const trustItems = [
  'Información financiera separada por moneda',
  'Trazabilidad de pagos y comprobantes',
  'Acceso organizado para administración y comunidad',
];

export function SignInGate() {
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [message, setMessage] = useState<SignInMessage>(null);
  const [submitting, setSubmitting] = useState(false);

  const sendLink = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!supabase) {
      setMessage({
        tone: 'error',
        text: 'La configuración de acceso no está disponible en este ambiente.',
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const result = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    setSubmitting(false);

    if (result.error) {
      setMessage({ tone: 'error', text: result.error.message });
      return;
    }

    setSentEmail(normalizedEmail);
    setMessage({ tone: 'info', text: 'El enlace puede tardar unos segundos en llegar.' });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendLink();
  };

  return (
    <main className="access-shell">
      <section className="access-story">
        <BrandLockup inverse />
        <div className="access-story__content">
          <span className="access-kicker">Administración clara y confiable</span>
          <h1>Todo tu condominio, organizado en un solo lugar.</h1>
          <p>
            Habitta reúne cobranza, pagos, residentes y comunicación comunitaria en una experiencia
            sencilla para equipos administrativos y propietarios.
          </p>
          <ul className="access-trust-list">
            {trustItems.map((item) => (
              <li key={item}>
                <CheckCircleIcon size={19} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="access-story__footer">Diseñado para comunidades que necesitan claridad.</p>
      </section>

      <section className="access-panel">
        <div className="access-panel__mobile-brand">
          <BrandLockup />
        </div>
        <Surface className="access-card">
          {sentEmail ? (
            <div className="access-confirmation" aria-live="polite">
              <span className="access-confirmation__icon">
                <CheckCircleIcon size={28} />
              </span>
              <div>
                <span className="access-kicker">Revisa tu correo</span>
                <h2>Tu enlace de acceso está en camino</h2>
                <p>
                  Enviamos un enlace seguro a <strong>{sentEmail}</strong>. Ábrelo en este
                  dispositivo para entrar a Habitta.
                </p>
              </div>
              {message ? (
                <p className="access-message" data-tone={message.tone} role="status">
                  {message.text}
                </p>
              ) : null}
              <div className="access-card__actions">
                <Button disabled={submitting} onClick={() => void sendLink()} type="button">
                  {submitting ? 'Reenviando…' : 'Reenviar enlace'}
                </Button>
                <Button
                  onClick={() => {
                    setSentEmail('');
                    setMessage(null);
                  }}
                  type="button"
                  variant="ghost"
                >
                  Usar otro correo
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="access-card__heading">
                <span className="access-kicker">Acceso seguro</span>
                <h2>Bienvenido a Habitta</h2>
                <p>Ingresa tu correo y te enviaremos un enlace para continuar sin contraseña.</p>
              </div>
              <form className="access-form" onSubmit={submit}>
                <Field label="Correo electrónico">
                  <input
                    autoCapitalize="none"
                    autoComplete="email"
                    autoFocus
                    className="input"
                    inputMode="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nombre@correo.com"
                    required
                    type="email"
                    value={email}
                  />
                </Field>
                <Button disabled={submitting} type="submit">
                  {submitting ? 'Enviando enlace…' : 'Continuar con correo'}
                  {!submitting ? <ArrowRightIcon size={18} /> : null}
                </Button>
              </form>
              {message ? (
                <p className="access-message" data-tone={message.tone} role="alert">
                  {message.text}
                </p>
              ) : null}
              <p className="access-card__fine-print">
                Al continuar, aceptas usar Habitta únicamente para la gestión autorizada de tu
                comunidad.
              </p>
            </>
          )}
        </Surface>
      </section>
    </main>
  );
}

export function OnboardingLoading() {
  return (
    <main className="onboarding-loading" aria-label="Preparando tu espacio">
      <BrandLockup inverse />
      <span className="onboarding-spinner" aria-hidden="true" />
      <div>
        <h1>Preparando tu espacio</h1>
        <p>Estamos cargando la configuración de tu cuenta.</p>
      </div>
    </main>
  );
}

export function WorkspaceLoadError({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="onboarding-shell onboarding-shell--centered">
      <Surface className="workspace-error-card">
        <span className="access-kicker">No pudimos abrir tu espacio</span>
        <h1>La información de tu cuenta no cargó correctamente.</h1>
        <p>{message}</p>
        <div className="access-card__actions">
          <Button onClick={onRetry}>Intentar nuevamente</Button>
          <Button onClick={onSignOut} variant="ghost">
            Cerrar sesión
          </Button>
        </div>
      </Surface>
    </main>
  );
}

export function OnboardingWizard({
  session,
  organizations,
  onComplete,
  onSignOut,
}: {
  session: Session;
  organizations: Organization[];
  onComplete: () => Promise<void>;
  onSignOut: () => void;
}) {
  const hasOrganization = organizations.length > 0;
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '');
  const [organizationName, setOrganizationName] = useState('');
  const [condominiumName, setCondominiumName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(emptyErrors);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!organizationId && organizations[0]) setOrganizationId(organizations[0].id);
  }, [organizationId, organizations]);

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === organizationId),
    [organizationId, organizations],
  );

  const validateDetails = () => {
    const nextErrors: FieldErrors = { ...emptyErrors };
    if (!hasOrganization && organizationName.trim().length < 2)
      nextErrors.organizationName = 'Escribe un nombre de al menos 2 caracteres.';
    if (hasOrganization && !organizationId)
      nextErrors.organizationId = 'Selecciona la organización que administrará este condominio.';
    if (condominiumName.trim().length < 2)
      nextErrors.condominiumName = 'Escribe un nombre de al menos 2 caracteres.';
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const continueToReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validateDetails()) setStep('review');
  };

  const createWorkspace = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const request = buildOnboardingRequest({
        organizationId: hasOrganization ? organizationId : '',
        organizationName,
        condominiumName,
      });
      await apiRequest<unknown>(request.path, session, {
        method: 'POST',
        body: JSON.stringify(request.body),
      });
      await onComplete();
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

  const stepNumber = step === 'welcome' ? 1 : step === 'details' ? 2 : 3;

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <BrandLockup />
        <Button onClick={onSignOut} size="sm" type="button" variant="ghost">
          <LogOutIcon size={17} />
          Cerrar sesión
        </Button>
      </header>

      <div className="onboarding-layout">
        <aside className="onboarding-progress" aria-label="Progreso de configuración">
          <span className="access-kicker">Primeros pasos</span>
          <h1>Configuremos tu espacio de trabajo.</h1>
          <p>
            Solo necesitamos los datos básicos. Podrás completar torres, unidades y residentes
            después.
          </p>
          <ol>
            {['Bienvenida', 'Datos principales', 'Confirmación'].map((label, index) => {
              const itemNumber = index + 1;
              const active = itemNumber === stepNumber;
              const complete = itemNumber < stepNumber;
              return (
                <li
                  data-active={active || undefined}
                  data-complete={complete || undefined}
                  key={label}
                >
                  <span>{complete ? <CheckCircleIcon size={18} /> : itemNumber}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {itemNumber === 1
                        ? 'Conoce el flujo'
                        : itemNumber === 2
                          ? 'Crea la base'
                          : 'Revisa y termina'}
                    </small>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="onboarding-stage">
          <Surface className="onboarding-card">
            {step === 'welcome' ? (
              <div className="onboarding-welcome">
                <span className="onboarding-card__icon">
                  <HomeIcon size={28} />
                </span>
                <div>
                  <span className="access-kicker">Bienvenido a Habitta</span>
                  <h2>
                    {hasOrganization
                      ? 'Agrega tu primer condominio'
                      : 'Crea la base de tu administración'}
                  </h2>
                  <p>
                    {hasOrganization
                      ? 'Tu organización ya está disponible. Ahora crea el primer condominio para entrar al dashboard.'
                      : 'Crearemos tu organización administrativa y su primer condominio en un solo paso seguro.'}
                  </p>
                </div>
                <div className="onboarding-benefits">
                  <div>
                    <CheckCircleIcon size={19} />
                    <span>Sin formularios técnicos ni configuraciones innecesarias.</span>
                  </div>
                  <div>
                    <CheckCircleIcon size={19} />
                    <span>La estructura podrá crecer a múltiples condominios.</span>
                  </div>
                  <div>
                    <CheckCircleIcon size={19} />
                    <span>No se crearán cuotas, saldos ni movimientos financieros todavía.</span>
                  </div>
                </div>
                <Button onClick={() => setStep('details')}>
                  Comenzar configuración
                  <ArrowRightIcon size={18} />
                </Button>
              </div>
            ) : null}

            {step === 'details' ? (
              <form className="onboarding-form" onSubmit={continueToReview}>
                <div>
                  <span className="access-kicker">Datos principales</span>
                  <h2>
                    {hasOrganization
                      ? '¿Qué condominio deseas agregar?'
                      : '¿Cómo identificaremos tu administración?'}
                  </h2>
                  <p>Usa nombres claros; serán visibles en el selector principal de Habitta.</p>
                </div>

                {hasOrganization ? (
                  <Field
                    error={errors.organizationId}
                    hint="La organización agrupa uno o varios condominios."
                    label="Organización"
                  >
                    <select
                      className="select"
                      onChange={(event) => {
                        setOrganizationId(event.target.value);
                        setErrors((current) => ({ ...current, organizationId: '' }));
                      }}
                      value={organizationId}
                    >
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field
                    error={errors.organizationName}
                    hint="Ejemplo: Administradora Los Samanes"
                    label="Nombre de la organización"
                  >
                    <input
                      autoFocus
                      className="input"
                      maxLength={120}
                      onChange={(event) => {
                        setOrganizationName(event.target.value);
                        setErrors((current) => ({ ...current, organizationName: '' }));
                      }}
                      placeholder="Nombre de la administración"
                      value={organizationName}
                    />
                  </Field>
                )}

                <Field
                  error={errors.condominiumName}
                  hint="Ejemplo: Residencias Parque Central"
                  label="Nombre del condominio"
                >
                  <input
                    autoFocus={hasOrganization}
                    className="input"
                    maxLength={120}
                    onChange={(event) => {
                      setCondominiumName(event.target.value);
                      setErrors((current) => ({ ...current, condominiumName: '' }));
                    }}
                    placeholder="Nombre del condominio"
                    value={condominiumName}
                  />
                </Field>

                <div className="onboarding-card__actions">
                  <Button onClick={() => setStep('welcome')} type="button" variant="ghost">
                    Atrás
                  </Button>
                  <Button type="submit">
                    Revisar información
                    <ArrowRightIcon size={18} />
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'review' ? (
              <div className="onboarding-review">
                <div>
                  <span className="access-kicker">Confirmación</span>
                  <h2>Todo está listo para crear tu espacio.</h2>
                  <p>
                    Revisa los nombres antes de continuar. Podrás completar el resto desde
                    Configuración.
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>Organización</dt>
                    <dd>
                      {hasOrganization ? selectedOrganization?.name : organizationName.trim()}
                    </dd>
                  </div>
                  <div>
                    <dt>Primer condominio</dt>
                    <dd>{condominiumName.trim()}</dd>
                  </div>
                  <div>
                    <dt>Monedas financieras</dt>
                    <dd>Se configurarán después; no se mezclará VES con USD.</dd>
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
                    onClick={() => setStep('details')}
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
                    {submitting ? 'Creando espacio…' : 'Crear y entrar a Habitta'}
                    {!submitting ? <ArrowRightIcon size={18} /> : null}
                  </Button>
                </div>
              </div>
            ) : null}
          </Surface>
        </section>
      </div>
    </main>
  );
}
