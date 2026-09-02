import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const foundation = read('./hq-design-system.css');
const main = read('./main.tsx');
const residentCss = read('./resident-dashboard.css');
const residentPage = read('./pages/ResidentDashboard.tsx');

describe('HAB-429 Premium HQ design-system foundation', () => {
  it('publishes semantic aliases instead of another independent brand palette', () => {
    for (const token of [
      '--hq-shell: var(--navy)',
      '--hq-canvas: var(--background)',
      '--hq-surface: var(--surface)',
      '--hq-ink: var(--text-strong)',
      '--hq-muted: var(--muted)',
      '--hq-line: var(--border)',
      '--hq-brand: var(--green)',
      '--hq-info: var(--blue)',
    ]) {
      expect(foundation).toContain(token);
    }
    expect(foundation).not.toMatch(/--navy:\s*#/);
    expect(foundation).not.toMatch(/--blue:\s*#/);
    expect(foundation).not.toMatch(/--green:\s*#/);
  });

  it('defines one shared geometry contract for controls, cards and spacing', () => {
    expect(foundation).toContain('--hq-control-compact: 36px');
    expect(foundation).toContain('--hq-control-standard: 44px');
    expect(foundation).toContain('--hq-touch-target: 44px');
    expect(foundation).toContain('--hq-radius-control:');
    expect(foundation).toContain('--hq-radius-card:');
    expect(foundation).toContain('.surface {');
    expect(foundation).toContain('.button {');
    expect(foundation).toContain('.input,');
    expect(foundation).toContain('.select {');
    expect(main.indexOf("import './brand-palette.css'")).toBeLessThan(
      main.indexOf("import './hq-design-system.css'"),
    );
  });

  it('makes the Resident Dashboard the first responsive reference surface', () => {
    expect(residentCss).toContain('width: min(100%, var(--hq-content-max))');
    expect(residentCss).toContain(".resident-dashboard__balance-card[data-tone='navy']");
    expect(residentCss).toContain('.resident-dashboard__property-grid');
    expect(residentCss).toContain('@media (max-width: 800px)');
    expect(residentCss).toContain('@media (max-width: 520px)');
    expect(residentCss).toContain('@media (max-width: 390px)');
    expect(residentCss).toContain('min-height: var(--hq-touch-target)');
    expect(residentCss).not.toMatch(/overflow-x:\s*auto/);
  });

  it('preserves the authoritative resident financial and role gates', () => {
    expect(residentPage).toContain('canAccessResidentPayments(roles)');
    expect(residentPage).toContain('canAccessResidentOperations(roles)');
    expect(residentPage).toContain('resident-financial-units');
    expect(residentPage).toContain('rowsForSelection');
    expect(residentPage).toContain('currencyRows');
    expect(residentPage).toContain('Cada moneda por separado');
    expect(residentPage).toContain('Habitta nunca suma saldos de monedas');
    expect(residentPage).toContain('propertyCards.length > 1');
    expect(residentPage).not.toMatch(/service[_-]?role/i);
  });

  it('keeps focus, dark theme and reduced-motion support in the shared layer', () => {
    expect(foundation).toContain("[data-theme='dark']");
    expect(foundation).toContain('@media (prefers-reduced-motion: reduce)');
    expect(residentCss).toContain(':focus-visible');
    expect(residentCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
