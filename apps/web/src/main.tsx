import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import './styles.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  async function requestAccess(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return setMessage('Configura Supabase para habilitar el acceso.');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setMessage(error ? error.message : 'Revisa tu correo para continuar.');
  }

  return (
    <main>
      <nav>
        <a className="brand" href="#inicio">
          <span>H</span> Habitta
        </a>
        <a href="#producto">Producto</a>
        <a href="#acceso">Acceso</a>
      </nav>
      <section className="hero" id="inicio">
        <div>
          <p className="eyebrow">GESTIÓN QUE DA TRANQUILIDAD</p>
          <h1>
            Tu condominio,
            <br />
            <em>en armonía.</em>
          </h1>
          <p className="intro">
            Una forma clara, segura y humana de administrar comunidades, cuentas y decisiones.
          </p>
          <div className="actions">
            <a className="button" href="#acceso">
              Comenzar ahora <b>→</b>
            </a>
            <a className="text-link" href="#producto">
              Conocer Habitta
            </a>
          </div>
        </div>
        <div className="dashboard" aria-label="Resumen del condominio">
          <div className="dash-top">
            <span>Residencias Armonía</span>
            <i>● En orden</i>
          </div>
          <h2>Buenos días, Valentina</h2>
          <div className="balance">
            <small>Saldo disponible</small>
            <strong>
              $12.480<sup>,00</sup>
            </strong>
            <span>+8,4% este mes</span>
          </div>
          <div className="cards">
            <article>
              <small>Cuotas al día</small>
              <b>94%</b>
              <span>↑ 6% este mes</span>
            </article>
            <article>
              <small>Solicitudes</small>
              <b>08</b>
              <span>2 pendientes</span>
            </article>
          </div>
        </div>
      </section>
      <section className="proof" id="producto">
        <p>Todo lo esencial para que la comunidad avance con confianza.</p>
        <div>
          <span>Finanzas claras</span>
          <span>Pagos trazables</span>
          <span>Comunicación simple</span>
        </div>
      </section>
      <section className="access" id="acceso">
        <div>
          <p className="eyebrow">ACCESO SEGURO</p>
          <h2>Bienvenido a tu comunidad.</h2>
          <p>
            Ingresa con el correo de tu invitación. Usaremos un enlace seguro, sin contraseñas que
            recordar.
          </p>
        </div>
        <form onSubmit={requestAccess}>
          <label>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@correo.com"
              required
            />
          </label>
          <button type="submit">Enviar enlace de acceso</button>
          {message && <p className="message">{message}</p>}
          {session && (
            <button className="logout" type="button" onClick={() => void supabase?.auth.signOut()}>
              Cerrar sesión
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
