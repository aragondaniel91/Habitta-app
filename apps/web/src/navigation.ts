import type { ComponentType } from 'react';
import {
  AnnouncementsIcon,
  CommunityIcon,
  DashboardIcon,
  ExpensesIcon,
  FeesIcon,
  MaintenanceIcon,
  PaymentsIcon,
  PeopleIcon,
  ReportsIcon,
  RequestsIcon,
  SettingsIcon,
  UnitsIcon,
  VoteIcon,
} from './components/icons';
import type { IconProps } from './components/icons';
import type { CondominiumRole } from './lib/roles';

export type RouteSection = 'principal' | 'finanzas' | 'comunidad' | 'sistema';

export type AppRoute = {
  key:
    | 'dashboard'
    | 'units'
    | 'people'
    | 'maintenance'
    | 'fees'
    | 'payments'
    | 'treasury'
    | 'expenses'
    | 'budgets'
    | 'reports'
    | 'community'
    | 'documents'
    | 'governance'
    | 'requests'
    | 'announcements'
    | 'team'
    | 'audit'
    | 'settings';
  path: string;
  label: string;
  shortLabel: string;
  title: string;
  description: string;
  section: RouteSection;
  icon: ComponentType<IconProps>;
  scope: readonly string[];
  /** Roles allowed to open this module. Presentation only; RLS enforces the real boundary. */
  roles: readonly CondominiumRole[];
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
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
    roles: ['condominium_admin', 'accountant', 'assistant', 'board_member'],
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
    roles: ['condominium_admin', 'accountant', 'assistant'],
  },
  {
    key: 'maintenance',
    path: '/app/maintenance',
    label: 'Mantenimiento',
    shortLabel: 'Mantenimiento',
    title: 'Activos y mantenimiento',
    description: 'Controla equipos, planes preventivos, órdenes de trabajo e historial técnico.',
    section: 'principal',
    icon: MaintenanceIcon,
    scope: ['Inventario de activos', 'Planes recurrentes', 'Órdenes e historial de servicio'],
    roles: ['condominium_admin', 'accountant', 'assistant', 'board_member'],
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
  },
  {
    key: 'treasury',
    path: '/app/treasury',
    label: 'Tesorería',
    shortLabel: 'Tesorería',
    title: 'Tesorería',
    description: 'Controla bancos, caja, transferencias internas y conciliación.',
    section: 'finanzas',
    icon: PaymentsIcon,
    scope: ['Bancos y caja', 'Transferencias internas', 'Conciliación bancaria'],
    roles: ['condominium_admin', 'accountant', 'board_member'],
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
    roles: ['condominium_admin', 'accountant', 'board_member'],
  },
  {
    key: 'budgets',
    path: '/app/budgets',
    label: 'Presupuestos',
    shortLabel: 'Presupuestos',
    title: 'Presupuestos',
    description: 'Planifica, aprueba y compara el presupuesto con la ejecución real por moneda.',
    section: 'finanzas',
    icon: ExpensesIcon,
    scope: ['Períodos y versiones', 'Aprobación', 'Ejecución real vs. presupuesto'],
    roles: ['condominium_admin', 'accountant', 'board_member'],
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
    roles: ['condominium_admin', 'accountant', 'board_member'],
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
  },
  {
    key: 'documents',
    path: '/app/documents',
    label: 'Documentos',
    shortLabel: 'Documentos',
    title: 'Documentos',
    description:
      'Organiza archivos privados del condominio con versiones, permisos y trazabilidad.',
    section: 'comunidad',
    icon: CommunityIcon,
    scope: ['Carpetas y categorías', 'Versiones', 'Descargas auditadas'],
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
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
    roles: ['condominium_admin'],
  },
  {
    key: 'audit',
    path: '/app/audit',
    label: 'Auditoría',
    shortLabel: 'Auditoría',
    title: 'Registro de auditoría',
    description:
      'Consulta actividad administrativa consolidada sin modificar el historial original.',
    section: 'sistema',
    icon: ReportsIcon,
    scope: ['Actividad por módulo', 'Filtros y actores', 'Trazabilidad read-only'],
    roles: ['condominium_admin'],
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
    roles: [
      'condominium_admin',
      'accountant',
      'assistant',
      'payment_reviewer',
      'board_member',
      'owner',
      'tenant',
    ],
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
