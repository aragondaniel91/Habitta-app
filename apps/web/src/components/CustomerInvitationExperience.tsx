import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRightIcon, CheckCircleIcon, HomeIcon, LogOutIcon, PeopleIcon } from './icons';
import { Button, Field, Surface } from './ui';
import { assessPassword, normalizeEmail, translateAuthError } from '../lib/auth';
import {
  acceptCustomerInvitation,
  customerBillingPeriodLabel,
  customerPlanLabel,
  getCustomerInvitationPreview,
  type CustomerInvitationPreview,
} from '../lib/customerInvitation';
import { setRememberSession, supabase } from '../supabase';

type Mode = 'sign-in' | 'register';
type Message = { tone: 'error' | 'info' | 'success'; text: string } | null;

type Props = {
  rawToken: string;
  session: Session | null;
  onAccepted: () => Promise<void>;
  onSignOut: () => void;
};

function BrandLockup() {
  return (
    <div className="access-brand" data-inverse>
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

export function CustomerInvitationExperience({ rawToken, session, onAccepted, onSignOut }: Props) {
  const [preview, setPreview] = useState<CustomerInvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('register');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getCustomerInvitationPreview(rawToken)
      .then((result) => {
        if (!active) return;
        setPreview(result);
        if (!result.found) {
          setMessage({ tone: 'error', text: 'Esta invitación venció, fue revocada o no existe.' });
        }
      })
      .catch((error) => {
        if (!active) return;
        setMessage({
          tone: 'error',
          text: error instanceof Error ? error.message : 'No se pudo validar la invitación.',
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rawToken, session?.user.id]);

  const passwordAssessment = useMemo(() => assessPassword(password), [password]);
  const invitedEmail = preview?.email?.toLowerCase() ?? '';
  const sessionEmail = session?.user.email?.toLowerCase() ?? '';
  const emailMatches = Boolean(invitedEmail && sessionEmail === invitedEmail);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !preview?.email) return;
    setSubmitting(true);
    setMessage(null);
    setRememberSession(true);
    const result = await supabase.auth.signInWithPassword({
      email: normalizeEmail(preview.email),
      password,
    });
    setSubmitting(false);
    if (result.error) setMessage({ tone: 'error', text: translateAuthError(result.error) });
  };

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !preview?.email) return;
    if (fullName.trim().length < 3) {
      setMessage({ tone: 'error', text: 'Escribe tu nombre y apellido.' });
      return;
    }
    if (!passwordAssessment.valid) {
      setMessage({ tone: 'error', text: 'La contraseña debe cumplir todos los requisitos.' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }
    if (!acceptedTerms) {
      setMessage({ tone: 'error', text: 'Debes aceptar los términos para crear la cuenta.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setRememberSession(true);
    const result = await supabase.auth.signUp({
      email: normalizeEmail(preview.email),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app/bienvenida?invitacion=${encodeURIComponent(rawToken)}`,
        data: {
          full_name: fullName.trim(),
          registration_source: 'customer_invitation',
        },
      },
    });
    setSubmitting(false);

    if (result.error) {
      setMessage({ tone: 'error', text: translateAuthError(result.error) });
      return;
    }
    if (!result.data.session) {
      setConfirmationSent(true);
      setMessage({
        tone: 'info',
        text: 'Confirma tu correo y vuelve a este mismo enlace para continuar con tu condominio.',
      });
    }
  };

  const accept = async () => {
    setAccepting(true);
    setMessage(null);
    try {
      await acceptCustomerInvitation(rawToken);
      setMessage({ tone: 'success', text: 'Invitación aceptada. Preparemos tu primer condominio.' });
      await onAccepted();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo aceptar la invitación.',
      });
    } finally {
      setAccepting(false);
    }
  };

  const continueAccepted = async () => {
    setAccepting(true);
    try {
      await onAccepted();
    } finally {
      setAccepting(false);
    }
  };

  return (
    <main className="admin-invite-shell">
      <section className="admin-invite-story">
        <BrandLockup />
        <div>
          <span className="access-kicker">Invitación de cliente</span>
          <h1>Tu comunidad empieza con una configuración clara.</h1>
          <p>
            Este enlace conecta tu cuenta con el plan preparado por Habitta. Después registrarás la
            estructura básica de tu primer condominio.
          </p>
          <ul className="access-trust-list">
            <li>
              <CheckCircleIcon size={19} />
              <span>Invitación individual y protegida por correo</span>
            </li>
            <li>
              <CheckCircleIcon size={19} />
              <span>30 días de prueba para planes self-service</span>
            </li>
            <li>
              <CheckCircleIcon size={19} />
              <span>Ningún cargo se realiza al aceptar la invitación</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="admin-invite-panel">
        <Surface className="admin-invite-card">
          {loading ? (
            <div className="admin-invite-loading">
              <span className="onboarding-spinner" />
              <p>Validando invitación…</p>
            </div>
          ) : preview?.found && preview.email ? (
            <>
              <div className="admin-invite-summary">
                <span>
                  <PeopleIcon size={26} />
                </span>
                <div>
                  <span className="access-kicker">Tu acceso a Habitta</span>
                  <h2>{customerPlanLabel(preview.plan_code)}</h2>
                  <p>
                    {preview.email} · facturación {customerBillingPeriodLabel(preview.billing_period)}
                  </p>
                </div>
              </div>

              {message ? (
                <p
                  className="access-message"
                  data-tone={message.tone}
                  role={message.tone === 'error' ? 'alert' : 'status'}
                >
                  {message.text}
                </p>
              ) : null}

              {preview.onboarding_completed ? (
                <div className="admin-invite-success">
                  <CheckCircleIcon size={34} />
                  <div>
                    <h2>Tu espacio ya fue configurado.</h2>
                    <p>Entra a Habitta para continuar con tu comunidad.</p>
                  </div>
                  <Button onClick={() => void continueAccepted()} type="button">
                    Entrar a Habitta <ArrowRightIcon size={18} />
                  </Button>
                </div>
              ) : session ? (
                emailMatches ? (
                  <div className="admin-invite-accept">
                    <p>
                      {preview.status === 'accepted'
                        ? 'La invitación ya está aceptada. Continúa con la configuración de tu primer condominio.'
                        : 'Iniciaste sesión con el correo correcto. Acepta para comenzar la configuración.'}
                    </p>
                    <Button
                      disabled={accepting}
                      onClick={() =>
                        void (preview.status === 'accepted' ? continueAccepted() : accept())
                      }
                      type="button"
                    >
                      {accepting
                        ? 'Preparando…'
                        : preview.status === 'accepted'
                          ? 'Configurar mi condominio'
                          : 'Aceptar y configurar'}
                    </Button>
                  </div>
                ) : (
                  <div className="admin-invite-email-mismatch">
                    <p>
                      Esta invitación pertenece a <strong>{preview.email}</strong>, pero la sesión
                      actual usa <strong>{session.user.email}</strong>.
                    </p>
                    <Button onClick={onSignOut} type="button" variant="secondary">
                      <LogOutIcon size={17} /> Cerrar sesión y continuar
                    </Button>
                  </div>
                )
              ) : confirmationSent ? (
                <div className="admin-invite-confirmation">
                  <CheckCircleIcon size={30} />
                  <h2>Revisa tu correo</h2>
                  <p>Confirma tu cuenta y vuelve a abrir este enlace para continuar.</p>
                </div>
              ) : (
                <>
                  <div className="admin-invite-tabs">
                    <button
                      data-active={mode === 'register' || undefined}
                      onClick={() => setMode('register')}
                      type="button"
                    >
                      Crear cuenta
                    </button>
                    <button
                      data-active={mode === 'sign-in' || undefined}
                      onClick={() => setMode('sign-in')}
                      type="button"
                    >
                      Ya tengo cuenta
                    </button>
                  </div>

                  {mode === 'sign-in' ? (
                    <form className="access-form ux-form" onSubmit={signIn}>
                      <Field label="Correo electrónico">
                        <input className="input" readOnly value={preview.email} />
                      </Field>
                      <Field label="Contraseña">
                        <input
                          autoComplete="current-password"
                          autoFocus
                          className="input"
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          type="password"
                          value={password}
                        />
                      </Field>
                      <Button disabled={submitting} type="submit">
                        {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
                      </Button>
                    </form>
                  ) : (
                    <form className="access-form ux-form" onSubmit={register}>
                      <Field label="Nombre y apellido">
                        <input
                          autoComplete="name"
                          autoFocus
                          className="input"
                          onChange={(event) => setFullName(event.target.value)}
                          required
                          value={fullName}
                        />
                      </Field>
                      <Field label="Correo electrónico">
                        <input className="input" readOnly value={preview.email} />
                      </Field>
                      <Field label="Contraseña">
                        <input
                          autoComplete="new-password"
                          className="input"
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          type="password"
                          value={password}
                        />
                      </Field>
                      <div className="password-strength__requirements">
                        <span data-complete={passwordAssessment.minimumLength || undefined}>10 caracteres</span>
                        <span data-complete={passwordAssessment.uppercase || undefined}>Mayúscula</span>
                        <span data-complete={passwordAssessment.lowercase || undefined}>Minúscula</span>
                        <span data-complete={passwordAssessment.number || undefined}>Número</span>
                      </div>
                      <Field label="Confirmar contraseña">
                        <input
                          autoComplete="new-password"
                          className="input"
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                          type="password"
                          value={confirmPassword}
                        />
                      </Field>
                      <label className="access-checkbox">
                        <input
                          checked={acceptedTerms}
                          onChange={(event) => setAcceptedTerms(event.target.checked)}
                          type="checkbox"
                        />
                        <span>Acepto los términos y el uso autorizado de Habitta.</span>
                      </label>
                      <Button disabled={submitting} type="submit">
                        {submitting ? 'Creando cuenta…' : 'Crear cuenta y continuar'}
                      </Button>
                    </form>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="admin-invite-invalid">
              <h2>Invitación no disponible</h2>
              <p className="access-message" data-tone="error">
                {message?.text ?? 'Solicita al equipo de Habitta una invitación nueva.'}
              </p>
              <Button onClick={() => (window.location.href = '/')} type="button" variant="secondary">
                Volver a Habitta
              </Button>
            </div>
          )}
        </Surface>
      </section>
    </main>
  );
}
