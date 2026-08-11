import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRightIcon, CheckCircleIcon, HomeIcon, LogOutIcon, PeopleIcon } from './icons';
import { Button, Field, Surface } from './ui';
import { assessPassword, normalizeEmail, translateAuthError } from '../lib/auth';
import {
  acceptResidentInvitation,
  getResidentInvitationPreview,
  residentRoleLabel,
  type ResidentInvitationPreview,
} from '../lib/residentAccess';
import { setRememberSession, supabase } from '../supabase';

type Mode = 'sign-in' | 'register';
type Message = { tone: 'error' | 'info' | 'success'; text: string } | null;

type Props = { rawToken: string };

export function ResidentInvitationExperience({ rawToken }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [preview, setPreview] = useState<ResidentInvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthResolved(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthResolved(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthResolved(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getResidentInvitationPreview(rawToken)
      .then((result) => {
        if (!active) return;
        setPreview(result);
        if (result.status !== 'pending') {
          setMessage({
            tone: result.status === 'accepted' ? 'success' : 'error',
            text:
              result.status === 'accepted'
                ? 'Esta invitación ya fue aceptada.'
                : 'Esta invitación venció o fue revocada.',
          });
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
  }, [rawToken]);

  const passwordAssessment = useMemo(() => assessPassword(password), [password]);
  const sessionEmail = session?.user.email?.toLowerCase() ?? '';
  const emailMatches = Boolean(preview && sessionEmail === preview.email.toLowerCase());

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !preview) return;
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
    if (!supabase || !preview) return;
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
        emailRedirectTo: `${window.location.origin}/invite/${rawToken}`,
        data: {
          full_name: fullName.trim(),
          registration_source: 'resident_invitation',
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
        text: 'Confirma tu correo y vuelve a abrir este mismo enlace para terminar el acceso.',
      });
    }
  };

  const accept = async () => {
    setAccepting(true);
    setMessage(null);
    try {
      await acceptResidentInvitation(rawToken);
      setAccepted(true);
      setMessage({ tone: 'success', text: 'Acceso activado correctamente.' });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo activar el acceso.',
      });
    } finally {
      setAccepting(false);
    }
  };

  const signOut = () => void supabase?.auth.signOut();

  if (!authResolved) {
    return (
      <main className="admin-invite-shell">
        <section className="admin-invite-panel">
          <Surface className="admin-invite-card">
            <div className="admin-invite-loading">
              <span className="onboarding-spinner" />
              <p>Preparando acceso…</p>
            </div>
          </Surface>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-invite-shell">
      <section className="admin-invite-story">
        <div className="access-brand" data-inverse>
          <span className="brand-mark">
            <HomeIcon size={21} />
          </span>
          <span>
            <strong>Habitta</strong>
            <small>Gestión de condominios</small>
          </span>
        </div>
        <div>
          <span className="access-kicker">Acceso de residente</span>
          <h1>Tu hogar, tus cuentas y tu comunidad en un solo lugar.</h1>
          <p>Activa únicamente el acceso que la administración asignó a tu perfil y unidad.</p>
          <ul className="access-trust-list">
            <li>
              <CheckCircleIcon size={19} />
              <span>Invitación ligada a tu correo y unidad</span>
            </li>
            <li>
              <CheckCircleIcon size={19} />
              <span>Datos separados por condominio</span>
            </li>
            <li>
              <CheckCircleIcon size={19} />
              <span>El acceso se invalida si termina la asignación</span>
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
          ) : preview ? (
            <>
              <div className="admin-invite-summary">
                <span>
                  <PeopleIcon size={26} />
                </span>
                <div>
                  <span className="access-kicker">{preview.condominium_name}</span>
                  <h2>{residentRoleLabel(preview.intended_role)}</h2>
                  <p>
                    {preview.person_name} · Unidad <strong>{preview.unit_code}</strong>
                  </p>
                  <p>
                    Acceso para <strong>{preview.email}</strong>
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

              {accepted ? (
                <div className="admin-invite-success">
                  <span>
                    <CheckCircleIcon size={34} />
                  </span>
                  <div>
                    <h2>Tu acceso está listo.</h2>
                    <p>Habitta mostrará únicamente la información autorizada para tu perfil.</p>
                  </div>
                  <Button onClick={() => (window.location.href = '/')} type="button">
                    Entrar a Habitta <ArrowRightIcon size={18} />
                  </Button>
                </div>
              ) : preview.status !== 'pending' ? (
                <Button
                  onClick={() => (window.location.href = '/')}
                  type="button"
                  variant="secondary"
                >
                  Volver a Habitta
                </Button>
              ) : session ? (
                emailMatches ? (
                  <div className="admin-invite-accept">
                    <p>
                      Iniciaste sesión con el correo correcto. Confirma para agregar la unidad{' '}
                      <strong>{preview.unit_code}</strong> a tu acceso.
                    </p>
                    <Button disabled={accepting} onClick={() => void accept()} type="button">
                      {accepting ? 'Activando…' : 'Aceptar y activar acceso'}
                    </Button>
                  </div>
                ) : (
                  <div className="admin-invite-email-mismatch">
                    <p>
                      Esta invitación pertenece a <strong>{preview.email}</strong>, pero tu sesión
                      usa <strong>{session.user.email}</strong>.
                    </p>
                    <Button onClick={signOut} type="button" variant="secondary">
                      <LogOutIcon size={17} /> Cerrar sesión y continuar
                    </Button>
                  </div>
                )
              ) : confirmationSent ? (
                <div className="admin-invite-confirmation">
                  <CheckCircleIcon size={30} />
                  <h2>Revisa tu correo</h2>
                  <p>Después de confirmar, vuelve a este enlace para terminar.</p>
                </div>
              ) : (
                <>
                  <div className="admin-invite-tabs">
                    <button
                      data-active={mode === 'sign-in' || undefined}
                      onClick={() => setMode('sign-in')}
                      type="button"
                    >
                      Ya tengo cuenta
                    </button>
                    <button
                      data-active={mode === 'register' || undefined}
                      onClick={() => setMode('register')}
                      type="button"
                    >
                      Crear cuenta
                    </button>
                  </div>

                  {mode === 'sign-in' ? (
                    <form className="access-form" onSubmit={signIn}>
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
                        {submitting ? 'Iniciando sesión…' : 'Iniciar sesión para aceptar'}
                      </Button>
                    </form>
                  ) : (
                    <form className="access-form" onSubmit={register}>
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
                        <span data-complete={passwordAssessment.minimumLength || undefined}>
                          10 caracteres
                        </span>
                        <span data-complete={passwordAssessment.uppercase || undefined}>
                          Mayúscula
                        </span>
                        <span data-complete={passwordAssessment.lowercase || undefined}>
                          Minúscula
                        </span>
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
              {message ? (
                <p className="access-message" data-tone="error">
                  {message.text}
                </p>
              ) : null}
              <Button
                onClick={() => (window.location.href = '/')}
                type="button"
                variant="secondary"
              >
                Volver a Habitta
              </Button>
            </div>
          )}
        </Surface>
      </section>
    </main>
  );
}
