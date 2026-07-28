import { StrictMode, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import { PeoplePanel } from './features/people/PeoplePanel';
import { ReceivablesPanel } from './features/receivables/ReceivablesPanel';
import { PaymentsPanel } from './features/payments/PaymentsPanel';
import { NotificationBell } from './features/notifications/NotificationBell';
import { NotificationCenter } from './features/notifications/NotificationCenter';
import './styles.css';
type Org = { id: string; name: string };
type Condo = { id: string; name: string; organization_id: string };
type Building = { id: string; name: string };
type Unit = { id: string; code: string; type: string; status: string };
const api = async <T,>(path: string, session: Session, init?: RequestInit) => {
  const r = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error('No tienes permisos para realizar esta acción.');
  return r.json() as Promise<T>;
};
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [orgs, setOrgs] = useState<Org[]>([]),
    [condos, setCondos] = useState<Condo[]>([]),
    [org, setOrg] = useState(''),
    [condo, setCondo] = useState(''),
    [buildings, setBuildings] = useState<Building[]>([]),
    [units, setUnits] = useState<Unit[]>([]),
    [notificationOpen, setNotificationOpen] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then((x) => setSession(x.data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const load = async (s: Session) => {
    try {
      const [o, c] = await Promise.all([
        api<Org[]>('/v1/organizations', s),
        api<Condo[]>('/v1/condominiums', s),
      ]);
      setOrgs(o);
      setCondos(c);
      setOrg(o[0]?.id ?? '');
      setCondo(c[0]?.id ?? '');
    } catch {
      setMessage('No se pudo cargar tu espacio.');
    }
  };
  useEffect(() => {
    if (session) void load(session);
  }, [session]);
  useEffect(() => {
    if (!session || !condo) return;
    void Promise.all([
      api<Building[]>(`/v1/condominiums/${condo}/buildings`, session),
      api<Unit[]>(`/v1/condominiums/${condo}/units`, session),
    ]).then(([b, u]) => {
      setBuildings(b);
      setUnits(u);
    });
  }, [session, condo]);
  const submit = async (e: React.FormEvent<HTMLFormElement>, path: string) => {
    e.preventDefault();
    if (!session) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(path, session, {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          organizationId: org,
          ownershipPercentage: data.ownershipPercentage
            ? Number(data.ownershipPercentage)
            : undefined,
        }),
      });
      e.currentTarget.reset();
      setMessage('Guardado correctamente.');
      await load(session);
      if (condo) {
        setBuildings(await api(`/v1/condominiums/${condo}/buildings`, session));
        setUnits(await api(`/v1/condominiums/${condo}/units`, session));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error');
    }
  };
  if (!session)
    return (
      <main className="auth">
        <h1>Habitta</h1>
        <p>Gestiona tu comunidad con claridad.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supabase) return;
            const r = await supabase.auth.signInWithOtp({
              email,
              options: { emailRedirectTo: location.origin, shouldCreateUser: true },
            });
            setMessage(r.error ? r.error.message : 'Revisa tu correo.');
          }}
        >
          <input
            type="email"
            required
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button>Enviar acceso</button>
        </form>
        <p>{message}</p>
      </main>
    );
  const selected = condos.filter((c) => c.organization_id === org);
  return (
    <main>
      <nav>
        <b>Habitta</b>
        <NotificationBell session={session} onOpen={() => setNotificationOpen(true)} />
        <button onClick={() => void supabase?.auth.signOut()}>Salir</button>
      </nav>
      <NotificationCenter
        session={session}
        condominiumId={condo}
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
      />
      <section className="app">
        <aside>
          <h2>Tu espacio</h2>
          <label>
            Organización
            <select
              value={org}
              onChange={(e) => {
                const nextOrg = e.target.value;
                setOrg(nextOrg);
                setCondo(condos.find((item) => item.organization_id === nextOrg)?.id ?? '');
              }}
            >
              {orgs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condominio
            <select value={condo} onChange={(e) => setCondo(e.target.value)}>
              {selected.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={(e) => void submit(e, '/v1/organizations')}>
            <h3>Crear organización</h3>
            <input name="name" required placeholder="Nombre" />
            <input name="condominiumName" placeholder="Primer condominio (opcional)" />
            <button>Crear</button>
          </form>
          <form onSubmit={(e) => void submit(e, '/v1/condominiums')}>
            <h3>Crear condominio</h3>
            <input name="name" required placeholder="Nombre" />
            <button>Crear</button>
          </form>
        </aside>
        <article>
          <p>{message}</p>
          {!orgs.length ? (
            <div className="empty">
              <h1>Bienvenido a Habitta</h1>
              <p>Crea tu organización para comenzar.</p>
            </div>
          ) : (
            <>
              <h1>{condos.find((x) => x.id === condo)?.name ?? 'Selecciona un condominio'}</h1>
              <div className="grid">
                <section>
                  <h2>Torres</h2>
                  {buildings.length ? (
                    buildings.map((b) => <p key={b.id}>{b.name}</p>)
                  ) : (
                    <p>Sin torres todavía.</p>
                  )}
                  {condo && (
                    <form onSubmit={(e) => void submit(e, `/v1/condominiums/${condo}/buildings`)}>
                      <input name="name" required placeholder="Nombre de torre" />
                      <button>Agregar torre</button>
                    </form>
                  )}
                </section>
                <section>
                  <h2>Unidades</h2>
                  {units.length ? (
                    units.map((u) => (
                      <p key={u.id}>
                        {u.code} · {u.type}
                      </p>
                    ))
                  ) : (
                    <p>Sin unidades todavía.</p>
                  )}
                  {condo && (
                    <form onSubmit={(e) => void submit(e, `/v1/condominiums/${condo}/units`)}>
                      <input name="code" required placeholder="Código" />
                      <select name="type">
                        <option value="apartment">Apartamento</option>
                        <option value="house">Casa</option>
                        <option value="commercial">Local</option>
                        <option value="parking">Estacionamiento</option>
                        <option value="storage">Depósito</option>
                      </select>
                      <button>Agregar unidad</button>
                    </form>
                  )}
                </section>
              </div>
              {condo && <PeoplePanel condominiumId={condo} units={units} session={session} />}
              {condo && <ReceivablesPanel condominiumId={condo} units={units} session={session} />}
              {condo && <PaymentsPanel condominiumId={condo} units={units} session={session} />}
            </>
          )}
        </article>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
