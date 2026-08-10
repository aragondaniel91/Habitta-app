import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AdminInvitationExperience } from './components/AdminInvitationExperience';
import { AdminOnboardingWizard } from './components/AdminOnboardingWizard';
import { AppShell, type Condominium, type Organization } from './components/AppShell';
import { OnboardingLoading, WorkspaceLoadError } from './components/AuthExperience';
import { PasswordRecoveryGate, SignInGate } from './components/PasswordAuthExperience';
import { apiRequest } from './lib/api';
import {
  allowedRoutes,
  canAccessRoute,
  rolesForCondominium,
  RolesProvider,
  type Membership,
  type MembershipResponse,
} from './lib/roles';
import { APP_ROUTES, DEFAULT_ROUTE, getRouteFromPath, type AppRoute } from './navigation';
import { AddCondominiumPage } from './pages/AddCondominiumPage';
import { AdministrativeDashboard } from './pages/AdministrativeDashboard';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { CommunityDirectoryPage } from './pages/CommunityDirectoryPage';
import { CommunityPage } from './pages/CommunityPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { GovernancePage } from './pages/GovernancePage';
import { MaintenancePage } from './pages/MaintenancePage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { ReportsPage } from './pages/ReportsPage';
import { RequestsPage } from './pages/RequestsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StructureManagementPage } from './pages/StructureManagementPage';
import { TeamAccessPage } from './pages/TeamAccessPage';
import { TreasuryPage } from './pages/TreasuryPage';
import { supabase } from './supabase';

type ContextMessage = { tone: 'error' | 'info'; text: string } | null;

function invitationTokenFromPath(pathname: string) {
  const prefix = '/admin-invite/';
  if (!pathname.startsWith(prefix)) return '';
  try {
    return decodeURIComponent(pathname.slice(prefix.length).split('/')[0] ?? '');
  } catch {
    return '';
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(
    () => window.location.pathname === '/reset-password',
  );
  const [adminInvitationToken, setAdminInvitationToken] = useState(() =>
    invitationTokenFromPath(window.location.pathname),
  );
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
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
        setMemberships([]);
        setSelectedCondominiumId('');
        setAddingCondominium(false);
        setContextMessage(null);
        if (event === 'SIGNED_OUT') setPasswordRecoveryMode(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadWorkspace = useCallback(async (activeSession: Session, preferredCondominiumId = '') => {
    setWorkspaceLoading(true);
    setContextMessage(null);
    try {
      const [organizationItems, condominiumItems, membershipResponse] = await Promise.all([
        apiRequest<Organization[]>('/v1/organizations', activeSession),
        apiRequest<Condominium[]>('/v1/condominiums', activeSession),
        apiRequest<MembershipResponse>('/v1/memberships', activeSession),
      ]);
      setOrganizations(organizationItems);
      setCondominiums(condominiumItems);
      setMemberships(membershipResponse.condominiums);
      setSelectedCondominiumId((current) => {
        if (
          preferredCondominiumId &&
          condominiumItems.some((item) => item.id === preferredCondominiumId)
        ) {
          return preferredCondominiumId;
        }
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
    if (session && !passwordRecoveryMode && !adminInvitationToken) void loadWorkspace(session);
  }, [session, passwordRecoveryMode, adminInvitationToken, loadWorkspace]);

  useEffect(() => {
    const onPopState = () => {
      setAdminInvitationToken(invitationTokenFromPath(window.location.pathname));
      setCurrentRoute(getRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!session || passwordRecoveryMode || adminInvitationToken) return;
    const resolved = getRouteFromPath(window.location.pathname);
    if (window.location.pathname !== resolved.path) {
      window.history.replaceState({}, '', resolved.path);
      setCurrentRoute(resolved);
    }
  }, [session, passwordRecoveryMode, adminInvitationToken]);

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

  if (adminInvitationToken) {
    return (
      <AdminInvitationExperience
        onAccepted={async () => {
          if (session) await loadWorkspace(session);
          setAdminInvitationToken('');
          window.history.replaceState({}, '', DEFAULT_ROUTE.path);
          setCurrentRoute(DEFAULT_ROUTE);
        }}
        onSignOut={signOut}
        rawToken={adminInvitationToken}
        session={session}
      />
    );
  }

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
  const roles = rolesForCondominium(memberships, selectedCondominiumId);
  const visibleRoutes = allowedRoutes(APP_ROUTES, roles);
  // A deep link to a module this role cannot open lands on the first one it can, so the interface
  // never renders a module the API is going to refuse.
  const activeRoute = canAccessRoute(currentRoute, roles)
    ? currentRoute
    : (visibleRoutes[0] ?? currentRoute);
  let page;

  if (addingCondominium) {
    page = (
      <AddCondominiumPage
        onCancel={() => setAddingCondominium(false)}
        onCreated={async (condominiumId) => {
          await loadWorkspace(session, condominiumId);
          setAddingCondominium(false);
          window.history.replaceState({}, '', DEFAULT_ROUTE.path);
          setCurrentRoute(DEFAULT_ROUTE);
        }}
        organizations={organizations}
      />
    );
  } else if (activeRoute.key === 'dashboard') {
    page = (
      <AdministrativeDashboard
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        onNavigate={navigate}
        session={session}
      />
    );
  } else if (activeRoute.key === 'units') {
    page = (
      <StructureManagementPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'people') {
    page = (
      <CommunityDirectoryPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        mode="people"
        session={session}
      />
    );
  } else if (activeRoute.key === 'maintenance') {
    page = (
      <MaintenancePage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'fees') {
    page = (
      <ReceivablesPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'payments') {
    page = (
      <PaymentsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'treasury') {
    page = (
      <TreasuryPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'expenses') {
    page = (
      <ExpensesPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'reports') {
    page = (
      <ReportsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'requests') {
    page = (
      <RequestsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'announcements') {
    page = (
      <AnnouncementsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'community') {
    page = (
      <CommunityPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        onNavigate={navigate}
        session={session}
      />
    );
  } else if (activeRoute.key === 'governance') {
    page = (
      <GovernancePage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'team') {
    page = (
      <TeamAccessPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else if (activeRoute.key === 'settings') {
    page = (
      <SettingsPage
        condominiumId={selectedCondominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  } else {
    // Exhaustive by construction: every AppRoute key above is handled, so TypeScript narrows
    // currentRoute.key to never here and a new route cannot ship without its page.
    const unreachable: never = activeRoute.key;
    throw new Error(`Ruta sin página asignada: ${String(unreachable)}`);
  }

  return (
    <RolesProvider value={roles}>
      <AppShell
        condominiums={condominiums}
        contextMessage={contextMessage}
        currentRoute={activeRoute}
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
        visibleRoutes={visibleRoutes}
      >
        {page}
      </AppShell>
    </RolesProvider>
  );
}
