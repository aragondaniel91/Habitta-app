import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  OnboardingLoading,
  OnboardingWizard,
  SignInGate,
  WorkspaceLoadError,
} from './components/AuthExperience';
import { AppShell, type Condominium, type Organization } from './components/AppShell';
import { AdministrativeDashboard } from './pages/AdministrativeDashboard';
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
        setContextMessage(null);
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

  const signOut = () => void supabase?.auth.signOut();

  if (!authResolved) return <OnboardingLoading />;
  if (!session) return <SignInGate />;
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
      <OnboardingWizard
        onComplete={() => loadWorkspace(session)}
        onSignOut={signOut}
        organizations={organizations}
        session={session}
      />
    );
  }

  const selectedCondominium = condominiums.find((item) => item.id === selectedCondominiumId);
  const condominiumName = selectedCondominium?.name ?? 'Condominio';
  let page;

  if (currentRoute.key === DEFAULT_ROUTE.key) {
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
      onCloseNotifications={() => setNotificationOpen(false)}
      onCondominiumChange={setSelectedCondominiumId}
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
