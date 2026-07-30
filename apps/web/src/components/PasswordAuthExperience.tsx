import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRightIcon, CheckCircleIcon, HomeIcon, LogOutIcon } from './icons';
import { Button, Field, Surface } from './ui';
import { assessPassword, normalizeEmail, translateAuthError } from '../lib/auth';
import { getRememberSession, setRememberSession, supabase } from '../supabase';

type AccessMode = 'sign-in' | 'register' | 'forgot';
type AuthMessage = { tone: 'error' | 'info' | 'success'; text: string } | null;
type EmailConfirmation = { kind: 'signup' | 'recovery'; email: string } | null;

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

function AccessStory({ recovery = false }: { recovery?: boolean }) {
  return (
    <section className="access-story">
      <BrandLockup inverse />
      <div className="access-story__content">
        <span className="access-kicker">
          {recovery ? 'Protección de tu cuenta' : 'Administración clara y confiable'}
        </span>
        <h1>
          {recovery
            ? 'Recupera el acceso sin perder el control de tu comunidad.'
            : 'Todo tu condominio, organizado en un solo lugar.'}
        </h1>
        <p>
          {recovery
            ? 'Crea una contraseña nueva y cerraremos las demás sesiones activas para proteger tu información.'
            : 'Habitta reúne cobranza, pagos, residentes y comunicación comunitaria en una experiencia sencilla para equipos administrativos y propietarios.'}
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
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label}>
      <span className="password-input">
        <input
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className="input"
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="password-input__toggle"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
    </Field>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const assessment = useMemo(() => assessPassword(password), [password]);
  const labels = [
    ['minimumLength', '10 caracteres'],
    ['uppercase', 'Una mayúscula'],
    ['lowercase', 'Una minúscula'],
    ['number', 'Un número'],
  ] as const;

  return (
    <div className="password-strength" aria-live="polite">
      <div className="password-strength__meter" aria-label={`Seguridad ${assessment.score} de 4`}>
        {[1, 2, 3, 4].map((segment) => (
          <span data-active={segment <= assessment.score || undefined} key={segment} />
        ))}
      </div>
      <div className="password-strength__requirements">
        {labels.map(([key, label]) => (
          <span data-complete={assessment[key] || undefined} key={key}>
            <CheckCircleIcon size={14} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function AuthMessageBox({ message }: { message: AuthMessage }) {
  return message ? (
    <p
      className="access-message"
      data-tone={message.tone}
      role={message.tone === 'error' ? 'alert' : 'status'}
    >
      {message.text}
    </p>
  ) : null;
}

export function SignInGate({
  initialMode = 'sign-in',
  initialMessage = null,
}: {
  initialMode?: AccessMode;
  initialMessage?: AuthMessage;
}) {
  const [mode, setMode] = useState<AccessMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [rememberSession, setRememberSessionValue] = useState(() => getRememberSession());
  const [message, setMessage] = useState<AuthMessage>(initialMessage);
  const [confirmation, setConfirmation] = useState<EmailConfirmation>(null);
  const [submitting, setSubmitting] = useState(false);

  const changeMode = (nextMode: AccessMode) => {
    setMode(nextMode);
    setMessage(null);
    setConfirmation(null);
    setPassword('');
    setConfirmPassword('');
  };

  const requireSupabase = () => {
    if (supabase) return true;
    setMessage({
      tone: 'error',
      text: 'La configuración de acceso no está disponible en este ambiente.',
    });
    return false;
  };

  const submitSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireSupabase() || !supabase) return;

    setSubmitting(true);
    setMessage(null);
    setRememberSession(rememberSession);
    const result = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    setSubmitting(false);

    if (result.error) setMessage({ tone: 'error', text: translateAuthError(result.error) });
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireSupabase() || !supabase) return;

    const passwordAssessment = assessPassword(password);
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

    const normalizedEmail = normalizeEmail(email);
    setSubmitting(true);
    setMessage(null);
    setRememberSession(true);
    const result = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName.trim(),
          registration_source: 'public_admin_onboarding',
        },
      },
    });
    setSubmitting(false);

    if (result.error) {
      setMessage({ tone: 'error', text: translateAuthError(result.error) });
      return;
    }

    if (!result.data.session) {
      setConfirmation({ kind: 'signup', email: normalizedEmail });
      setMessage({ tone: 'info', text: 'El enlace puede tardar unos segundos en llegar.' });
    }
  };

  const submitRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireSupabase() || !supabase) return;

    const normalizedEmail = normalizeEmail(email);
    setSubmitting(true);
    setMessage(null);
    const result = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);

    if (result.error) {
      setMessage({ tone: 'error', text: translateAuthError(result.error) });
      return;
    }

    setConfirmation({ kind: 'recovery', email: normalizedEmail });
    setMessage({ tone: 'info', text: 'Por seguridad, el enlace tendrá una vigencia limitada.' });
  };

  const resendConfirmation = async () => {
    if (!confirmation || !requireSupabase() || !supabase) return;
    setSubmitting(true);
    setMessage(null);

    const result =
      confirmation.kind === 'signup'
        ? await supabase.auth.resend({
            type: 'signup',
            email: confirmation.email,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.resetPasswordForEmail(confirmation.email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });

    setSubmitting(false);
    setMessage(
      result.error
        ? { tone: 'error', text: translateAuthError(result.error) }
        : { tone: 'success', text: 'Enviamos un nuevo correo.' },
    );
  };

  const title =
    mode === 'sign-in'
      ? 'Bienvenido a Habitta'
      : mode === 'register'
        ? 'Crea tu cuenta administrativa'
        : 'Recupera tu contraseña';
  const description =
    mode === 'sign-in'
      ? 'Ingresa con el correo y la contraseña de tu cuenta.'
      : mode === 'register'
        ? 'Empieza con tus datos personales. El condominio se configurará después de confirmar tu correo.'
        : 'Te enviaremos un enlace seguro para crear una contraseña nueva.';

  return (
    <main className="access-shell">
      <AccessStory />
      <section className="access-panel">
        <div className="access-panel__mobile-brand">
          <BrandLockup />
        </div>
        <Surface className="access-card access-card--password">
          {confirmation ? (
            <div className="access-confirmation" aria-live="polite">
              <span className="access-confirmation__icon">
                <CheckCircleIcon size={28} />
              </span>
              <div>
                <span className="access-kicker">Revisa tu correo</span>
                <h2>
                  {confirmation.kind === 'signup'
                    ? 'Confirma tu cuenta para continuar'
                    : 'Tu enlace de recuperación está en camino'}
                </h2>
                <p>
                  Enviamos el correo a <strong>{confirmation.email}</strong>.
                  {confirmation.kind === 'signup'
                    ? ' Después de confirmar, podrás iniciar sesión y registrar tu primer condominio.'
                    : ' Ábrelo en este dispositivo para crear tu nueva contraseña.'}
                </p>
              </div>
              <AuthMessageBox message={message} />
              <div className="access-card__actions">
                <Button disabled={submitting} onClick={() => void resendConfirmation()} type="button">
                  {submitting ? 'Reenviando…' : 'Reenviar correo'}
                </Button>
                <Button onClick={() => changeMode('sign-in')} type="button" variant="ghost">
                  Volver a iniciar sesión
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="access-card__heading">
                <span className="access-kicker">
                  {mode === 'sign-in'
                    ? 'Acceso seguro'
                    : mode === 'register'
                      ? 'Nuevo administrador'
                      : 'Recuperación'}
                </span>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>

              {mode === 'sign-in' ? (
                <form className="access-form" onSubmit={submitSignIn}>
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
                  <PasswordField
                    autoComplete="current-password"
                    label="Contraseña"
                    onChange={setPassword}
                    value={password}
                  />
                  <div className="access-form__options">
                    <label className="access-checkbox">
                      <input
                        checked={rememberSession}
                        onChange={(event) => setRememberSessionValue(event.target.checked)}
                        type="checkbox"
                      />
                      <span>Recordar sesión</span>
                    </label>
                    <button
                      className="access-inline-action"
                      onClick={() => changeMode('forgot')}
                      type="button"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <Button disabled={submitting} type="submit">
                    {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
                    {!submitting ? <ArrowRightIcon size={18} /> : null}
                  </Button>
                </form>
              ) : null}

              {mode === 'register' ? (
                <form className="access-form" onSubmit={submitRegistration}>
                  <Field label="Nombre y apellido">
                    <input
                      autoComplete="name"
                      autoFocus
                      className="input"
                      maxLength={120}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Juan Pérez"
                      required
                      value={fullName}
                    />
                  </Field>
                  <Field label="Correo electrónico">
                    <input
                      autoCapitalize="none"
                      autoComplete="email"
                      className="input"
                      inputMode="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="nombre@correo.com"
                      required
                      type="email"
                      value={email}
                    />
                  </Field>
                  <PasswordField
                    autoComplete="new-password"
                    label="Contraseña"
                    onChange={setPassword}
                    value={password}
                  />
                  <PasswordStrength password={password} />
                  <PasswordField
                    autoComplete="new-password"
                    label="Confirmar contraseña"
                    onChange={setConfirmPassword}
                    value={confirmPassword}
                  />
                  <label className="access-checkbox access-checkbox--terms">
                    <input
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Acepto los términos y condiciones de Habitta.</span>
                  </label>
                  <Button disabled={submitting} type="submit">
                    {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
                    {!submitting ? <ArrowRightIcon size={18} /> : null}
                  </Button>
                </form>
              ) : null}

              {mode === 'forgot' ? (
                <form className="access-form" onSubmit={submitRecovery}>
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
                    {submitting ? 'Enviando enlace…' : 'Enviar enlace de recuperación'}
                    {!submitting ? <ArrowRightIcon size={18} /> : null}
                  </Button>
                </form>
              ) : null}

              <AuthMessageBox message={message} />

              <div className="access-mode-switch">
                {mode === 'sign-in' ? (
                  <>
                    <span>¿Administras un condominio nuevo?</span>
                    <button
                      className="access-inline-action"
                      onClick={() => changeMode('register')}
                      type="button"
                    >
                      Crear cuenta
                    </button>
                  </>
                ) : (
                  <>
                    <span>¿Ya tienes una cuenta Habitta?</span>
                    <button
                      className="access-inline-action"
                      onClick={() => changeMode('sign-in')}
                      type="button"
                    >
                      Iniciar sesión
                    </button>
                  </>
                )}
              </div>

              <p className="access-card__fine-print">
                Los propietarios, inquilinos y miembros de junta acceden únicamente mediante una
                invitación segura de su administración.
              </p>
            </>
          )}
        </Surface>
      </section>
    </main>
  );
}

export function PasswordRecoveryGate({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<AuthMessage>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setMessage({ tone: 'error', text: 'La configuración de acceso no está disponible.' });
      return;
    }
    if (!assessPassword(password).valid) {
      setMessage({ tone: 'error', text: 'La contraseña debe cumplir todos los requisitos.' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const result = await supabase.auth.updateUser({ password });
    if (!result.error) await supabase.auth.signOut({ scope: 'others' });
    setSubmitting(false);

    if (result.error) {
      setMessage({ tone: 'error', text: translateAuthError(result.error) });
      return;
    }

    setCompleted(true);
    setMessage({
      tone: 'success',
      text: 'Tu contraseña fue actualizada y las demás sesiones fueron cerradas.',
    });
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  return (
    <main className="access-shell">
      <AccessStory recovery />
      <section className="access-panel">
        <div className="access-panel__mobile-brand">
          <BrandLockup />
        </div>
        <Surface className="access-card access-card--password">
          <div className="access-card__heading">
            <span className="access-kicker">Nueva contraseña</span>
            <h2>{completed ? 'Tu acceso está protegido' : 'Crea una contraseña nueva'}</h2>
            <p>
              {completed
                ? 'Ya puedes continuar a tu espacio Habitta.'
                : 'Usa una contraseña que no hayas utilizado anteriormente.'}
            </p>
          </div>

          {!completed ? (
            <form className="access-form" onSubmit={submit}>
              <PasswordField
                autoComplete="new-password"
                autoFocus
                label="Nueva contraseña"
                onChange={setPassword}
                value={password}
              />
              <PasswordStrength password={password} />
              <PasswordField
                autoComplete="new-password"
                label="Confirmar contraseña"
                onChange={setConfirmPassword}
                value={confirmPassword}
              />
              <Button disabled={submitting} type="submit">
                {submitting ? 'Actualizando contraseña…' : 'Actualizar contraseña'}
                {!submitting ? <ArrowRightIcon size={18} /> : null}
              </Button>
            </form>
          ) : (
            <Button onClick={onComplete} type="button">
              Continuar a Habitta
              <ArrowRightIcon size={18} />
            </Button>
          )}

          <AuthMessageBox message={message} />
          <Button onClick={() => void signOut()} type="button" variant="ghost">
            <LogOutIcon size={17} />
            Cerrar sesión
          </Button>
        </Surface>
      </section>
    </main>
  );
}
