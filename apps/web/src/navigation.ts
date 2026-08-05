import type { ComponentType } from 'react';
import {
  AnnouncementsIcon,
  CommunityIcon,
  DashboardIcon,
  ExpensesIcon,
  FeesIcon,
  PaymentsIcon,
  PeopleIcon,
  ReportsIcon,
  RequestsIcon,
  SettingsIcon,
  UnitsIcon,
  VoteIcon,
} from './components/icons';
import type { IconProps } from './components/icons';

export type RouteSection = 'principal' | 'finanzas' | 'comunidad' | 'sistema';

export type AppRoute = {
  key:
    | 'dashboard'
    | 'units'
    | 'people'
    | 'fees'
    | 'payments'
    | 'expenses'
    | 'reports'
    | 'community'
    | 'governance'
    | 'requests'
    | 'announcements'
    | 'team'
    | 'settings';
  path: string;
  label: string;
  shortLabel: string;
  title: string;
  description: string;
  section: RouteSection;
  icon: ComponentType<IconProps>;
  scope: readonly string[];
};

export const ROUTE_SECTION_LABELS: Record<RouteSection, string> = {
  principal: 'Principal',
  finanzas: 'Finanzas',
  comunidad: 'Comunidad',
  sistema: 'Sistema',
};

export const APP_ROUTES = [
  {
    key: 'dashboard',
    path: '/app/dashboard',
    label: 'Dashboard',
    shortLabel: 'Inicio',
    title: 'Dashboard administrativo',
    description: 'Visión general de la operación, cobranza y actividad del condominio.',
    section: 'principal',
    icon: DashboardIcon,
    scope: ['Resumen financiero', 'Alertas operativas', 'Actividad reciente'],
  },
  {
    key: 'units',
    path: '/app/units',
    label: 'Unidades',
    shortLabel: 'Unidades',
    title: 'Unidades',
    description: 'Organiza apartamentos, casas, locales, depósitos y estacionamientos.',
    section: 'principal',
    icon: UnitsIcon,
    scope: ['Inventario de unidades', 'Torres y ubicación', 'Estado de ocupación'],
  },
  {
    key: 'people',
    path: '/app/people',
    label: 'Personas',
    shortLabel: 'Personas',
    title: 'Personas',
    description: 'Administra propietarios, inquilinos y relaciones históricas con las unidades.',
    section: 'principal',
    icon: PeopleIcon,
    scope: ['Propietarios', 'Inquilinos', 'Invitaciones y contactos'],
  },
  {
    key: 'fees',
    path: '/app/fees',
    label: 'Cuotas',
    shortLabel: 'Cuotas',
    title: 'Cuotas y cuentas por cobrar',
    description: 'Consulta obligaciones, saldos y movimientos sin mezclar monedas.',
    section: 'finanzas',
    icon: FeesIcon,
    scope: ['Obligaciones', 'Saldos VES y USD', 'Ajustes y reversos'],
  },
  {
    key: 'payments',
    path: '/app/payments',
    label: 'Pagos',
    shortLabel: 'Pagos',
    title: 'Pagos y comprobantes',
    description: 'Revisa comprobantes, asignaciones, pagos parciales y créditos disponibles.',
    section: 'finanzas',
    icon: PaymentsIcon,
    scope: ['Comprobantes', 'Revisión manual', 'Asignaciones y sobrepagos'],
  },
  {
    key: 'expenses',
    path: '/app/expenses',
    label: 'Gastos',
    shortLabel: 'Gastos',
    title: 'Gastos',
    description: 'Registra y consulta egresos operativos con trazabilidad.',
    section: 'finanzas',
    icon: ExpensesIcon,
    scope: ['Registro de gastos', 'Proveedores', 'Soportes y categorías'],
  },
  {
    key: 'reports',
    path: '/app/reports',
    label: 'Reportes',
    shortLabel: 'Reportes',
    title: 'Reportes',
    description: 'Convierte la operación financiera y comunitaria en información clara.',
    section: 'finanzas',
    icon: ReportsIcon,
    scope: ['Cobranza', 'Estado de cuenta', 'Exportaciones'],
  },
  {
    key: 'community',
    path: '/app/community',
    label: 'Comunidad',
    shortLabel: 'Comunidad',
    title: 'Comunidad',
    description: 'Centraliza información útil para residentes y junta de condominio.',
    section: 'comunidad',
    icon: CommunityIcon,
    scope: ['Directorio', 'Documentos', 'Información compartida'],
  },
  {
    key: 'governance',
    path: '/app/governance',
    label: 'Votaciones',
    shortLabel: 'Votaciones',
    title: 'Propuestas y votaciones',
    description:
      'Crea propuestas, adjunta presupuestos y registra decisiones con quórum y trazabilidad.',
    section: 'comunidad',
    icon: VoteIcon,
    scope: ['Propuestas', 'Votaciones', 'Quórum y resultados'],
  },
  {
    key: 'requests',
    path: '/app/requests',
    label: 'Solicitudes',
    shortLabel: 'Solicitudes',
    title: 'Solicitudes',
    description: 'Da seguimiento a requerimientos de residentes con estados claros.',
    section: 'comunidad',
    icon: RequestsIcon,
    scope: ['Bandeja de solicitudes', 'Prioridades', 'Seguimiento'],
  },
  {
    key: 'announcements',
    path: '/app/announcements',
    label: 'Anuncios',
    shortLabel: 'Anuncios',
    title: 'Anuncios',
    description: 'Publica comunicaciones importantes sin perder control de la audiencia.',
    section: 'comunidad',
    icon: AnnouncementsIcon,
    scope: ['Comunicados', 'Audiencias', 'Historial de publicación'],
  },
  {
    key: 'team',
    path: '/app/team',
    label: 'Equipo y accesos',
    shortLabel: 'Equipo',
    title: 'Equipo y accesos',
    description: 'Invita administradores, asigna roles y revisa accesos pendientes.',
    section: 'sistema',
    icon: PeopleIcon,
    scope: ['Administradores', 'Roles', 'Invitaciones y expiración'],
  },
  {
    key: 'settings',
    path: '/app/settings',
    label: 'Configuración',
    shortLabel: 'Ajustes',
    title: 'Configuración',
    description: 'Administra preferencias, permisos y parámetros del espacio.',
    section: 'sistema',
    icon: SettingsIcon,
    scope: ['Condominio', 'Preferencias', 'Notificaciones'],
  },
] as const satisfies readonly AppRoute[];

export const DEFAULT_ROUTE: AppRoute = APP_ROUTES[0];

const normalizePath = (pathname: string) => {
  if (!pathname || pathname === '/' || pathname === '/app') return DEFAULT_ROUTE.path;
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
};

export function getRouteFromPath(pathname: string): AppRoute {
  const normalized = normalizePath(pathname);
  return APP_ROUTES.find((route) => route.path === normalized) ?? DEFAULT_ROUTE;
}
