import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './features/help/module-help';
import { getModuleHelpContent } from './features/help/module-help-ui';
import { APP_ROUTES } from './navigation';

const matrix = readFileSync(
  new URL('../../../docs/frontend/form-parity-matrix.md', import.meta.url),
  'utf8',
);
const structure = readFileSync(
  new URL('./pages/StructureManagementPage.tsx', import.meta.url),
  'utf8',
);
const dangerZone = readFileSync(
  new URL('./features/settings/CondominiumDangerZone.tsx', import.meta.url),
  'utf8',
);

const matrixLabels = {
  dashboard: 'Dashboard',
  units: 'Unidades',
  people: 'Personas',
  maintenance: 'Mantenimiento',
  fees: 'Cuentas por cobrar',
  payments: 'Pagos',
  treasury: 'Tesorería',
  expenses: 'Gastos',
  budgets: 'Presupuestos',
  reports: 'Reportes',
  community: 'Comunidad',
  documents: 'Documentos',
  governance: 'Gobernanza',
  requests: 'Solicitudes',
  announcements: 'Anuncios',
  team: 'Equipo y accesos',
  audit: 'Auditoría',
  settings: 'Configuración',
} as const;

const dangerZoneDeletedData = [
  'unidades',
  'personas',
  'cuotas',
  'pagos',
  'recibos',
  'tesorería',
  'gastos',
  'presupuestos',
  'mantenimiento',
  'documentos',
  'solicitudes',
  'anuncios',
  'votaciones',
  'auditoría',
  'archivos privados',
] as const;

describe('HAB-307 final administrator premium sweep', () => {
  it('certifies every one of the 18 administrator routes in the parity matrix', () => {
    expect(APP_ROUTES).toHaveLength(18);
    expect(Object.keys(matrixLabels)).toHaveLength(18);

    for (const route of APP_ROUTES) {
      expect(matrixLabels[route.key], route.key).toBeDefined();
      expect(matrix).toContain(`| ${matrixLabels[route.key]} |`);
    }
  });

  it('keeps contextual help complete and aligned with the current visible UI', () => {
    for (const route of APP_ROUTES) {
      const help = getModuleHelpContent(route.key, MODULE_HELP[route.key]);
      expect(help.purpose.length, `${route.key}: purpose`).toBeGreaterThan(40);
      expect(help.actions.length, `${route.key}: actions`).toBeGreaterThanOrEqual(3);
      expect(help.steps.length, `${route.key}: steps`).toBeGreaterThanOrEqual(5);
      expect(help.beforeConfirm.length, `${route.key}: beforeConfirm`).toBeGreaterThanOrEqual(2);
      expect(help.result.length, `${route.key}: result`).toBeGreaterThanOrEqual(2);
      expect(help.permissions.length, `${route.key}: permissions`).toBeGreaterThan(30);
    }

    const team = getModuleHelpContent('team', MODULE_HELP.team);
    expect(team.steps.join(' ')).toContain('Quitar acceso');
    expect(team.steps.join(' ')).not.toContain('Retirar/Eliminar acceso');

    const settings = getModuleHelpContent('settings', MODULE_HELP.settings);
    const settingsHelp = [
      ...settings.actions,
      ...settings.steps,
      ...settings.beforeConfirm,
      ...settings.result,
      settings.permissions,
    ].join(' ');

    for (const label of [
      'Quiero eliminar esta residencia',
      'Revisar eliminación',
      'Sí, eliminar residencia',
    ]) {
      expect(settingsHelp).toContain(label);
      expect(dangerZone).toContain(label);
    }

    expect(settingsHelp).toContain('ELIMINAR {nombre}');
    expect(dangerZone).toContain('ELIMINAR ${condominiumName}');
    expect(settingsHelp).toContain('irreversible');
    expect(settingsHelp).toContain('propietario de la organización');
    expect(settingsHelp).toContain('administradores normales no pueden');
    expect(settingsHelp).toContain('cuenta global de Habitta');
    expect(settingsHelp).toContain('correo');
    expect(settingsHelp).toContain('sesión');
    expect(settingsHelp).toContain('reintento seguro');

    for (const dataLabel of dangerZoneDeletedData) {
      expect(settings.beforeConfirm.join(' '), dataLabel).toContain(dataLabel);
      expect(dangerZone.toLowerCase(), dataLabel).toContain(dataLabel);
    }
  });

  it('keeps legacy unspecified topology remediation discoverable and fail-closed', () => {
    expect(structure).toContain("roles.includes('condominium_admin')");
    expect(structure).toContain("topology === 'unspecified' && canRemediate");
    expect(structure).toContain('Definir tipo de propiedad');
    expect(structure).toContain('/topology-remediation');
    expect(structure).toContain("method: 'POST'");
    expect(structure).toContain('await loadStructure()');
    expect(structure).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(structure).not.toContain('supabase.rpc');
    expect(structure).not.toContain('window.alert');
    expect(structure).not.toContain('window.confirm');
    expect(structure).not.toContain('window.prompt');
    expect(structure).not.toContain("method: 'DELETE'");
  });

  it('keeps financial help explicit about currency and history semantics', () => {
    for (const key of ['fees', 'payments', 'treasury', 'expenses', 'budgets', 'reports'] as const) {
      const help = getModuleHelpContent(key, MODULE_HELP[key]);
      expect(help.beforeConfirm.join(' '), key).toContain('moneda');
    }
    expect(MODULE_HELP.reports.tips.join(' ')).toContain('simulados');
    expect(MODULE_HELP.fees.beforeConfirm.join(' ')).toContain('histórico');
  });

  it('retains the premium certification state for the four final module slices', () => {
    for (const label of ['Comunidad', 'Equipo y accesos', 'Auditoría', 'Configuración']) {
      const row = matrix.split('\n').find((line) => line.startsWith(`| ${label} |`));
      expect(row, label).toBeDefined();
      expect(row).toContain('| compliant |');
      expect(row).toContain('| Certificada |');
    }
  });
});
