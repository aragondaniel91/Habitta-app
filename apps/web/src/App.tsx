import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { OnboardingLoading, WorkspaceLoadError } from './components/AuthExperience';
import { AdminOnboardingWizard } from './components/AdminOnboardingWizard';
import { PasswordRecoveryGate, SignInGate } from './components/PasswordAuthExperience';
import { AppShell, type Condominium, type Organization } from './components/AppShell';
import { AddCondominiumPage } from './pages/AddCondominiumPage';
import { AdministrativeDashboard } from './pages/AdministrativeDashboard';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { CommunityDirectoryPage } from './pages/CommunityDirectoryPage';
import { CommunityPage } from './pages/CommunityPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { ReportsPage } from './pages/ReportsPage';
import { RequestsPage } from './pages/RequestsPage';
import { SettingsPage } from './pages/SettingsPage';
import { apiRequest } from './lib/api';
import { DEFAULT_ROUTE, getRouteFromPath, type AppRoute } from './navigation';
import { ModulePlaceholderPage } from './pages/ModulePage';
import { supabase } from './supabase';

type ContextMessage = { tone: 'error' | 'info'; text: string } | null;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(
    () => window.location.pathname === '/reset-password',
  );
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [selectedCondominiumId, setSelectedCondominiumId] = useState('');
  const [addingCondominium, setAddingCondominium] = useState(false);
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
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthResolved(true);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryMode(true);
      if (!nextSession) {
        setOrganizations([]);
        setCondominiums([]);
        setSelectedCondominiumId('');
        setAddingCondominium(false);
        setContextMessage(null);
        if (event === 'SIGNED_OUT') setPasswordRecoveryMode(false);
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
    if (session && !passwordRecoveryMode) void loadWorkspace(session);
  }, [session, passwordRecoveryMode, loadWorkspace]);

  useEffect(() => {
    const onPopState = () => setCurrentRoute(getRouteFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!session || passwordRecoveryMode) return;
    const resolved = getRouteFromPath(window.location.pathname);
    if (window.location.pathname !== resolved.path) {
      window.history.replaceState({}, '', resolved.path);
      setCurrentRoute(resolved);
    }
  }, [session, passwordRecoveryMode]);

  const navigate = (route: AppRoute) => {
    setAddingCondominium(false);
    window.history.pushState({}, '', route.path);
    setCurrentRoute(route);
  };

  const signOut = () => void supabase?.auth.signOut();

  const completePasswordRecovery = () => {
    setPasswordRecoveryMode(false);
    window.history.replaceState({}, '', DEFAULT_ROUTE.path);
    setCurrentRoute(DEFAULT_ROUTE);
  };

  if (!authResolved) return <OnboardingLoading />;
  if (passwordRecoveryMode && session) {
    return <PasswordRecoveryGate onComplete={completePasswordRecovery} />;
  }
  if (!session) {
    const expiredRecoveryLink = window.location.pathname === '/reset-password';
    return (
      <SignInGate
        initialMessage={
          expiredRecoveryLink
            ? {
                tone: 'error',
                text: 'El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.',
              }
            : null
        }
        initialMode={expiredRecoveryLink ? 'forgot' : 'sign-in'}
      />
    );
  }
  if (workspaceLoading) return <OnboardingLoading />;

  if (contextMessage?.tone === 'error' && !organizations.length && !condominiums.length) {
    return (
      <WorkspaceLoadError
        message={contextMessage.text}
        onRetry={() => void loadWorkspace(session)}
        onSignOut={signOut}
      />
    );
  }

  if (!selectedCondominiumId) {
    return (
      <AdminOnboardingWizard
        onComplete={() => loadWorkspace(session)}
        onSignOut={signOut}
        organizations={organizations}
      />
    );
  }

  const selectedCondominium = condominiums.find((item) => item.id === selectedCondominiumId);
  const condominiumName = selectedCondominium?.name ?? 'Condominio';
  let page;

  if (addingCondominium) {
    page = (
      <AddCondominiumPage
        onCancel={() => setAddingCondominium(false)}
        onCreated={async () => {
          setSelectedCondominiumId('');
          await loadWorkspace(session);
          setAddingCondominium(false);
        }}
        organizations={organizations}
      />
    );
  } else if (currentRoute.key === DEFAULT_ROUTE.key) {
    page = (
      <AdministrativeDashboard
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        onNavigate={navigate}
        session={session}
      />
    );
  } else if (currentRoute.key === 'units' || currentRoute.key === 'people') {
    page = (
      <CommunityDirectoryPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        mode={currentRoute.key}
        session={session}
      />
    );
  } else if (currentRoute.key === 'fees') {
    page = (
      <ReceivablesPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (currentRoute.key === 'payments') {
    page = (
      <PaymentsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (currentRoute.key === 'reports') {
    page = (
      <ReportsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (currentRoute.key === 'requests') {
    page = (
      <RequestsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (currentRoute.key === 'announcements') {
    page = (
      <AnnouncementsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (currentRoute.key === 'community') {
    page = (
      <CommunityPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        onNavigate={navigate}
        session={session}
      />
    );
  } else if (currentRoute.key === 'settings') {
    page = (
      <SettingsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else {
    page = <ModulePlaceholderPage route={currentRoute} />;
  }

  return (
    <AppShell
      condominiums={condominiums}
      contextMessage={contextMessage}
      currentRoute={currentRoute}
      notificationOpen={notificationOpen}
      onAddCondominium={() => setAddingCondominium(true)}
      onCloseNotifications={() => setNotificationOpen(false)}
      onCondominiumChange={(condominiumId) => {
        setAddingCondominium(false);
        setSelectedCondominiumId(condominiumId);
      }}
      onNavigate={navigate}
      onOpenNotifications={() => setNotificationOpen(true)}
      onSignOut={signOut}
      organizations={organizations}
      selectedCondominiumId={selectedCondominiumId}
      session={session}
    >
      {page}
    </AppShell>
  );
}
