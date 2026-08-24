import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODULE_HELP } from './features/help/module-help';

const page = readFileSync(new URL('./pages/AuditLogPage.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./audit-log.css', import.meta.url), 'utf8');
const matrix = readFileSync(
  new URL('../../../docs/frontend/form-parity-matrix.md', import.meta.url),
  'utf8',
);

describe('HAB-305 premium Audit responsive parity', () => {
  it('keeps the shared PageHeader and read-only server query behavior', () => {
    expect(page).toContain('<PageHeader');
    expect(page).toContain('/audit-events?');
    expect(page).not.toContain("method: 'POST'");
    expect(page).not.toContain("method: 'PATCH'");
    expect(page).not.toContain("method: 'PUT'");
    expect(page).not.toContain("method: 'DELETE'");
  });

  it('keeps the desktop table and adds a dedicated mobile card presentation', () => {
    expect(page).toContain('className="audit-table-scroll"');
    expect(page).toContain('className="audit-mobile-list"');
    expect(page).toContain('className="audit-mobile-card"');
    expect(page).toContain('aria-label="Eventos de auditoría"');
    expect(styles).toContain('.audit-mobile-list {\n  display: none;');
    expect(styles).toContain('@media (max-width: 720px)');
    expect(styles).toContain('.audit-table-scroll {\n    display: none;');
    expect(styles).toContain('.audit-mobile-list {\n    display: grid;');
  });

  it('shows the essential audit context on mobile without losing metadata', () => {
    expect(page).toContain('{moduleLabels[auditEvent.module]}');
    expect(page).toContain('{auditEvent.summary}');
    expect(page).toContain('{humanize(auditEvent.action)}');
    expect(page).toContain('Entidad');
    expect(page).toContain('Actor');
    expect(page).toContain('Correlación');
    expect(page).toContain('Ver Metadata segura');
    expect(page).toContain('JSON.stringify(auditEvent.metadata, null, 2)');
  });

  it('preserves actor filtering, pagination and validation on both form factors', () => {
    expect(page).toContain('useActorAsFilter');
    expect(page).toContain('El Actor ID debe ser un UUID válido.');
    expect(page).toContain('La fecha final no puede ser anterior a la fecha inicial.');
    expect(page).toContain('Aplicar filtros');
    expect(page).toContain('Limpiar');
    expect(page).toContain('Anterior');
    expect(page).toContain('Siguiente');
    expect(styles).toContain('min-height: 44px');
  });

  it('keeps contextual Help aligned with the read-only workflow', () => {
    const help = MODULE_HELP.audit;
    expect(help.steps.join(' ')).toContain('Aplicar filtros');
    expect(help.steps.join(' ')).toContain('Metadata segura');
    expect(help.steps.join(' ')).toContain('Actualizar');
    expect(help.steps.join(' ')).toContain('Limpiar');
    expect(help.result.join(' ')).toContain('Ninguna acción');
  });

  it('records Audit as certified in the parity matrix', () => {
    expect(matrix).toContain('| Auditoría |');
    expect(matrix).toContain('tabla desktop→cards móvil');
  });
});
