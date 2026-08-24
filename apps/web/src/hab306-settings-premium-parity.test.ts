import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './features/help/module-help';

const page = readFileSync(new URL('./pages/SettingsPage.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./settings.css', import.meta.url), 'utf8');
const dangerZone = readFileSync(
  new URL('./features/settings/CondominiumDangerZone.tsx', import.meta.url),
  'utf8',
);
const matrix = readFileSync(
  new URL('../../../docs/frontend/form-parity-matrix.md', import.meta.url),
  'utf8',
);

describe('HAB-306 premium Settings parity', () => {
  it('uses the shared header and keeps global versus personal notification scope explicit', () => {
    expect(page).toContain('<PageHeader');
    expect(page).toContain('Automatización de recordatorios');
    expect(page).toContain('Canales por evento');
    expect(page).toContain("data.settingsAvailable ? 'Administrable' : 'Solo lectura'");
    expect(page).toContain('Configuración global restringida');
    expect(styles).not.toContain('.settings-overview');
  });

  it('keeps notification persistence and switch semantics intact', () => {
    expect(page).toContain('saveNotificationSettings(session, condominiumId, data.settings)');
    expect(page).toContain('savePreference(session, condominiumId, preference)');
    expect(page).toContain('role="switch"');
    expect(page).toContain('aria-checked={checked}');
    expect(page).toContain('aria-checked={preference.in_app_enabled}');
    expect(page).toContain('aria-checked={preference.email_enabled}');
  });

  it('provides intentional 44/48px targets and 4 to 2 to 1 responsive behavior', () => {
    expect(styles).toContain('min-width: 44px');
    expect(styles).toContain('height: 44px');
    expect(styles).toContain('min-height: 48px');
    expect(styles).toContain('.settings-switch:focus-visible');
    expect(styles).toContain('@media (max-width: 1180px)');
    expect(styles).toContain('@media (max-width: 930px)');
    expect(styles).toContain('@media (max-width: 720px)');
    expect(styles).toContain('@media (max-width: 470px)');
    expect(styles).toContain('grid-template-columns: 1fr');
  });

  it('preserves the guarded irreversible condominium deletion workflow', () => {
    expect(dangerZone).toContain('capability?.canDelete');
    expect(dangerZone).toContain('confirmation === expected');
    expect(dangerZone).toContain('deleteCondominium(condominiumId, confirmation, session)');
    expect(dangerZone).toContain('retryCondominiumStorageCleanup');
    expect(dangerZone).toContain('<ConfirmDialog');
    expect(dangerZone).toContain('Sí, eliminar residencia');
    expect(dangerZone).toContain('Solo el propietario de la organización');
  });

  it('keeps contextual help aligned with settings concepts', () => {
    const help = MODULE_HELP.settings;
    expect(help.steps.join(' ')).toContain('Guardar cambios');
    expect(help.beforeConfirm.join(' ')).toContain('Solo lectura');
    expect(help.result.join(' ')).toContain('preferencias');
  });

  it('records Settings as certified in the parity matrix', () => {
    expect(matrix).toContain('| Configuración |');
  });
});
