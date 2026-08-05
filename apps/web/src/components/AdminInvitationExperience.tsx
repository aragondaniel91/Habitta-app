import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRightIcon, CheckCircleIcon, HomeIcon, LogOutIcon, PeopleIcon } from './icons';
import { Button, Field, Surface } from './ui';
import { assessPassword, normalizeEmail, translateAuthError } from '../lib/auth';
import {
  acceptAdminInvitation,
  administrativeRoleLabel,
  getAdminInvitationPreview,
  type AdminInvitationPreview,
} from '../lib/teamAccess';
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

export function AdminInvitationExperience({ rawToken, session, onAccepted, onSignOut }: Props) {
  const [preview, setPreview] = useState<AdminInvitationPreview | null>(null);
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
    let active = true;
    setLoading(true);
    void getAdminInvitationPreview(rawToken)
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
        emailRedirectTo: `${window.location.origin}/admin-invite/${rawToken}`,
        data: {
          full_name: fullName.trim(),
          registration_source: 'admin_invitation',
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
        text: 'Confirma tu correo y vuelve a abrir este mismo enlace para aceptar la invitación.',
      });
    }
  };

  const accept = async () => {
    setAccepting(true);
    setMessage(null);
    try {
      await acceptAdminInvitation(rawToken);
      setAccepted(true);
      setMessage({ tone: 'success', text: 'Invitación aceptada correctamente.' });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo aceptar la invitación.',
      });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <main className="admin-invite-shell">
      <section className="admin-invite-story">
        <BrandLockup />
        <div>
          <span className="access-kicker">Invitación administrativa</span>
          <h1>Únete al equipo sin compartir contraseñas.</h1>
          <p>
            El enlace asigna únicamente el condominio y el rol autorizados por la administración.
          </p>
          <ul className="access-trust-list">
            <li>
              <CheckCircleIcon size={19} />
              <span>Token único con fecha de expiración</span>
            </li>
            <li>
              <CheckCircleIcon size={19} />
              <span>Correo validado antes de asignar el rol</span>
            </li>
            <li>
              <CheckCircleIcon size={19} />
              <span>Datos separados por comunidad</span>
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
                  <h2>{administrativeRoleLabel(preview.intended_role)}</h2>
                  <p>
                    Invitación para <strong>{preview.email}</strong>
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
                    <h2>Ya formas parte del equipo.</h2>
                    <p>El condominio aparecerá en tu selector de Habitta.</p>
                  </div>
                  <Button onClick={() => void onAccepted()} type="button">
                    Entrar al condominio <ArrowRightIcon size={18} />
                  </Button>
                </div>
              ) : preview.status !== 'pending' ? (
                <Button
                  onClick={() => {
                    window.location.href = '/';
                  }}
                  type="button"
                  variant="secondary"
                >
                  Volver a Habitta
                </Button>
              ) : session ? (
                emailMatches ? (
                  <div className="admin-invite-accept">
                    <p>
                      Iniciaste sesión con el correo correcto. Confirma para agregar este condominio
                      a tu cuenta.
                    </p>
                    <Button disabled={accepting} onClick={() => void accept()} type="button">
                      {accepting ? 'Aceptando…' : 'Aceptar invitación'}
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
                  <p>Después de confirmar, vuelve a este enlace para terminar.</p>
                  <Button
                    onClick={() => {
                      window.location.href = '/';
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Ir al inicio de sesión
                  </Button>
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
                      Crear contraseña
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

                  <div className="access-card__actions">
                    <Button
                      onClick={() => {
                        window.location.href = '/';
                      }}
                      type="button"
                      variant="ghost"
                    >
                      Entrar con otro correo
                    </Button>
                  </div>
                  <p className="access-card__fine-print">
                    El correo mostrado está protegido porque esta invitación pertenece únicamente a
                    esa dirección. Para usar otra cuenta, vuelve al inicio de sesión.
                  </p>
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
                onClick={() => {
                  window.location.href = '/';
                }}
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
