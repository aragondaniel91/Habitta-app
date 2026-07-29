import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppShell, type Condominium, type Organization } from './components/AppShell';
import { HomeIcon } from './components/icons';
import { Button, EmptyState, Field, Skeleton, Surface } from './components/ui';
import { apiRequest } from './lib/api';
import { DEFAULT_ROUTE, getRouteFromPath, type AppRoute } from './navigation';
import { DashboardFoundationPage, ModulePlaceholderPage } from './pages/ModulePage';
import { supabase } from './supabase';

type ContextMessage = { tone: 'error' | 'info'; text: string } | null;

function LoadingWorkspace() {
  return (
    <div className="page-stack" aria-label="Cargando espacio">
      <Surface className="loading-surface">
        <Skeleton className="skeleton--badge" />
        <Skeleton className="skeleton--title" />
        <Skeleton className="skeleton--line" />
        <Skeleton className="skeleton--line skeleton--short" />
      </Surface>
      <div className="metric-grid">
        <Skeleton className="skeleton--card" />
        <Skeleton className="skeleton--card" />
        <Skeleton className="skeleton--card" />
      </div>
    </div>
  );
}

function SignInGate() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setMessage('La configuración de acceso no está disponible en este ambiente.');
      return;
    }

    setSubmitting(true);
    const result = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    setSubmitting(false);
    setMessage(result.error ? result.error.message : 'Revisa tu correo para continuar.');
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <span className="brand-mark">
            <HomeIcon size={22} />
          </span>
          <strong>Habitta</strong>
        </div>
        <div>
          <span className="auth-eyebrow">Gestión de condominios</span>
          <h1>Administración clara para comunidades mejor organizadas.</h1>
          <p>
            La experiencia completa de acceso y onboarding se trabajará en el PR 2. Esta pantalla ya
            utiliza la nueva base visual sin alterar el flujo actual de autenticación.
          </p>
        </div>
      </section>
      <section className="auth-form-panel">
        <Surface className="auth-card">
          <div>
            <span className="auth-eyebrow">Acceso seguro</span>
            <h2>Entra a tu espacio</h2>
            <p>Te enviaremos un enlace de acceso a tu correo.</p>
          </div>
          <form onSubmit={(event) => void submit(event)}>
            <Field label="Correo electrónico">
              <input
                autoComplete="email"
                className="input"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                required
                type="email"
                value={email}
              />
            </Field>
            <Button disabled={submitting} type="submit">
              {submitting ? 'Enviando…' : 'Enviar enlace de acceso'}
            </Button>
          </form>
          {message ? (
            <p className="form-message" role="status">
              {message}
            </p>
          ) : null}
        </Surface>
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [selectedCondominiumId, setSelectedCondominiumId] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [contextMessage, setContextMessage] = useState<ContextMessage>(null);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() =>
    getRouteFromPath(window.location.pathname),
  );
  const [notificationOpen, setNotificationOpen] = useState(false);

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
      if (!nextSession) {
        setOrganizations([]);
        setCondominiums([]);
        setSelectedCondominiumId('');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadWorkspace = useCallback(async (activeSession: Session) => {
    setWorkspaceLoading(true);
    setContextMessage(null);
    try {
      const [organizationItems, condominiumItems] = await Promise.all([
        apiRequest<Organization[]>('/v1/organizations', activeSession),
        apiRequest<Condominium[]>('/v1/condominiums', activeSession),
      ]);
      setOrganizations(organizationItems);
      setCondominiums(condominiumItems);
      setSelectedCondominiumId((current) => {
        if (condominiumItems.some((item) => item.id === current)) return current;
        return condominiumItems[0]?.id ?? '';
      });
      if (!organizationItems.length) {
        setContextMessage({
          tone: 'info',
          text: 'Tu cuenta todavía no tiene una organización configurada. El onboarding guiado llegará en el PR 2.',
        });
      }
    } catch (error) {
      setContextMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo cargar tu espacio.',
      });
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void loadWorkspace(session);
  }, [session, loadWorkspace]);

  useEffect(() => {
    const onPopState = () => setCurrentRoute(getRouteFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!session) return;
    const resolved = getRouteFromPath(window.location.pathname);
    if (window.location.pathname !== resolved.path) {
      window.history.replaceState({}, '', resolved.path);
      setCurrentRoute(resolved);
    }
  }, [session]);

  const navigate = (route: AppRoute) => {
    window.history.pushState({}, '', route.path);
    setCurrentRoute(route);
  };

  if (!authResolved) {
    return (
      <main className="boot-screen" aria-label="Cargando Habitta">
        <span className="brand-mark">
          <HomeIcon size={22} />
        </span>
        <strong>Habitta</strong>
      </main>
    );
  }

  if (!session) return <SignInGate />;

  const page = workspaceLoading ? (
    <LoadingWorkspace />
  ) : !selectedCondominiumId ? (
    <Surface>
      <EmptyState
        description="La creación de organizaciones ya no ocupa la pantalla principal. El flujo guiado se incorporará en el próximo PR."
        icon={<HomeIcon size={26} />}
        title="Tu espacio está listo para configurarse"
      />
    </Surface>
  ) : currentRoute.key === DEFAULT_ROUTE.key ? (
    <DashboardFoundationPage />
  ) : (
    <ModulePlaceholderPage route={currentRoute} />
  );

  return (
    <AppShell
      condominiums={condominiums}
      contextMessage={contextMessage}
      currentRoute={currentRoute}
      notificationOpen={notificationOpen}
      onCloseNotifications={() => setNotificationOpen(false)}
      onCondominiumChange={setSelectedCondominiumId}
      onNavigate={navigate}
      onOpenNotifications={() => setNotificationOpen(true)}
      onSignOut={() => void supabase?.auth.signOut()}
      organizations={organizations}
      selectedCondominiumId={selectedCondominiumId}
      session={session}
    >
      {page}
    </AppShell>
  );
}
