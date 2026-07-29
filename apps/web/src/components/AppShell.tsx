import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { NotificationCenter } from '../features/notifications/NotificationCenter';
import {
  APP_ROUTES,
  ROUTE_SECTION_LABELS,
  type AppRoute,
  type RouteSection,
} from '../navigation';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
} from './icons';
import { Button, Select } from './ui';

export type Organization = { id: string; name: string };
export type Condominium = { id: string; name: string; organization_id: string };

type ContextMessage = { tone: 'error' | 'info'; text: string } | null;

type Props = {
  session: Session;
  organizations: Organization[];
  condominiums: Condominium[];
  selectedCondominiumId: string;
  currentRoute: AppRoute;
  contextMessage: ContextMessage;
  notificationOpen: boolean;
  children: ReactNode;
  onCondominiumChange: (condominiumId: string) => void;
  onNavigate: (route: AppRoute) => void;
  onOpenNotifications: () => void;
  onCloseNotifications: () => void;
  onSignOut: () => void;
};

const sections: RouteSection[] = ['principal', 'finanzas', 'comunidad', 'sistema'];

const initialsFor = (value: string) => {
  const parts = value
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

export function AppShell({
  session,
  organizations,
  condominiums,
  selectedCondominiumId,
  currentRoute,
  contextMessage,
  notificationOpen,
  children,
  onCondominiumChange,
  onNavigate,
  onOpenNotifications,
  onCloseNotifications,
  onSignOut,
}: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('habitta:sidebar-collapsed') === 'true',
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const selectedCondominium = condominiums.find(
    (item) => item.id === selectedCondominiumId,
  );
  const selectedOrganization = organizations.find(
    (item) => item.id === selectedCondominium?.organization_id,
  );
  const userLabel =
    typeof session.user.user_metadata.full_name === 'string'
      ? session.user.user_metadata.full_name
      : (session.user.email ?? 'Usuario Habitta');
  const initials = initialsFor(userLabel) || 'HA';

  const optionsByOrganization = useMemo(
    () =>
      organizations
        .map((organization) => ({
          organization,
          condominiums: condominiums.filter(
            (condominium) => condominium.organization_id === organization.id,
          ),
        }))
        .filter((group) => group.condominiums.length > 0),
    [organizations, condominiums],
  );

  useEffect(() => {
    window.localStorage.setItem('habitta:sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [currentRoute.key]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        setProfileOpen(false);
        onCloseNotifications();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCloseNotifications]);

  const navContent = (mobile = false) => (
    <nav className="sidebar-nav" aria-label={mobile ? 'Navegación móvil' : 'Navegación principal'}>
      {sections.map((section) => {
        const routes = APP_ROUTES.filter((route) => route.section === section);
        return (
          <div className="nav-section" key={section}>
            <span className="nav-section__label">{ROUTE_SECTION_LABELS[section]}</span>
            {routes.map((route) => {
              const Icon = route.icon;
              return (
                <button
                  aria-current={currentRoute.key === route.key ? 'page' : undefined}
                  className="nav-item"
                  key={route.key}
                  onClick={() => onNavigate(route)}
                  title={sidebarCollapsed && !mobile ? route.label : undefined}
                  type="button"
                >
                  <Icon size={20} />
                  <span>{route.label}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className={sidebarCollapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="brand-mark">
            <HomeIcon size={20} />
          </span>
          <span className="brand-copy">
            <strong>Habitta</strong>
            <small>Gestión de condominios</small>
          </span>
        </div>
        {navContent()}
        <button
          aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
          className="sidebar-collapse"
          onClick={() => setSidebarCollapsed((value) => !value)}
          type="button"
        >
          <ChevronLeftIcon size={18} />
          <span>Contraer menú</span>
        </button>
      </aside>

      <div className="shell-body">
        <header className="topbar">
          <div className="topbar__start">
            <button
              aria-label="Abrir navegación"
              className="icon-button mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <MenuIcon size={21} />
            </button>
            <div className="condo-switcher">
              <span>Condominio</span>
              <Select
                aria-label="Seleccionar condominio"
                disabled={!condominiums.length}
                onChange={(event) => onCondominiumChange(event.target.value)}
                value={selectedCondominiumId}
              >
                {!condominiums.length ? <option value="">Sin condominios</option> : null}
                {optionsByOrganization.map(({ organization, condominiums: items }) => (
                  <optgroup key={organization.id} label={organization.name}>
                    {items.map((condominium) => (
                      <option key={condominium.id} value={condominium.id}>
                        {condominium.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
          </div>

          <div className="topbar__actions">
            <NotificationBell session={session} onOpen={onOpenNotifications} />
            <div className="profile-menu">
              <button
                aria-expanded={profileOpen}
                className="profile-trigger"
                onClick={() => setProfileOpen((value) => !value)}
                type="button"
              >
                <span className="avatar">{initials}</span>
                <span className="profile-trigger__copy">
                  <strong>{userLabel}</strong>
                  <small>{selectedOrganization?.name ?? 'Habitta'}</small>
                </span>
                <ChevronDownIcon size={16} />
              </button>
              {profileOpen ? (
                <div className="profile-popover">
                  <div>
                    <strong>{userLabel}</strong>
                    <span>{session.user.email}</span>
                  </div>
                  <Button onClick={onSignOut} variant="ghost">
                    <LogOutIcon size={17} />
                    Cerrar sesión
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <NotificationCenter
          condominiumId={selectedCondominiumId}
          onClose={onCloseNotifications}
          open={notificationOpen}
          session={session}
        />

        <main className="main-content">
          <div className="page-header">
            <div>
              <div className="breadcrumbs" aria-label="Ruta actual">
                <span>Habitta</span>
                <span aria-hidden="true">/</span>
                <strong>{currentRoute.label}</strong>
              </div>
              <h1>{currentRoute.title}</h1>
              <p>{currentRoute.description}</p>
            </div>
          </div>

          {contextMessage ? (
            <div className="alert" data-tone={contextMessage.tone} role="status">
              {contextMessage.text}
            </div>
          ) : null}

          {children}
        </main>
      </div>

      <button
        aria-label="Cerrar navegación"
        className={mobileOpen ? 'mobile-backdrop is-open' : 'mobile-backdrop'}
        onClick={() => setMobileOpen(false)}
        type="button"
      />
      <aside className={mobileOpen ? 'mobile-drawer is-open' : 'mobile-drawer'}>
        <div className="sidebar__brand">
          <span className="brand-mark">
            <HomeIcon size={20} />
          </span>
          <span className="brand-copy">
            <strong>Habitta</strong>
            <small>Gestión de condominios</small>
          </span>
        </div>
        {navContent(true)}
      </aside>
    </div>
  );
}
