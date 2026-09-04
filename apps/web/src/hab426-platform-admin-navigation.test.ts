import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// HAB-426 originally locked the first Platform Admin navigation shell. HAB-464 and HAB-477 evolve
// that shell into the approved owner backoffice IA while preserving session, billing and security
// boundaries. These assertions intentionally follow the current product contract instead of the
// retired standalone commercial console.

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const operations = read('../../platform-admin/index.html');
const platformShell = read('../../platform-admin/platform-shell.css');
const commercial = read('../../platform-admin/commercial.html');
const commercialScript = read('../../platform-admin/commercial.js');

describe('HAB-426 Platform Admin navigation', () => {
  it('exposes the approved owner-backoffice destinations from Overview', () => {
    expect(operations).toContain('>Overview<');
    expect(operations).toContain('>Clientes<');
    expect(operations).toContain('>Comercial<');
    expect(operations).toContain('href="/customers.html"');
    expect(operations).toContain('href="/commercial.html"');
    expect(operations).toContain('Cerrar sesión');
  });

  it('marks Overview as the current page there', () => {
    expect(operations).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/"[^>]*>Overview<\/a>/);
  });

  it('keeps exactly one Overview logout control', () => {
    expect(operations.match(/id="logout-button"/g) ?? []).toHaveLength(1);
  });

  it('hides the administrative navigation until there is a session', () => {
    const dashboardStart = operations.indexOf('id="dashboard-view"');
    const navStart = operations.indexOf('<nav class="platform-nav"');
    expect(dashboardStart).toBeGreaterThan(0);
    expect(navStart).toBeGreaterThan(dashboardStart);
    expect(operations).toMatch(/<section hidden id="dashboard-view">/);

    const loginStart = operations.indexOf('id="login-view"');
    expect(loginStart).toBeGreaterThan(0);
    expect(loginStart).toBeLessThan(navStart);
  });

  it('renders shell navigation without browser underlines while keeping the rule scoped', () => {
    const css = platformShell.replace(/\s+/g, '');
    expect(css).toMatch(/\.platform-nava[^{}]*\{[^}]*text-decoration:none/);
    expect(css).not.toMatch(/(^|})a\{[^}]*text-decoration:none/);
  });

  it('migrates Commercial into the same shared shell and exposes Activity', () => {
    expect(commercial).toContain('class="platform-layout"');
    expect(commercial).toContain('class="platform-sidebar"');
    expect(commercial).toContain('>Comercial<');
    expect(commercial).toContain('>Actividad<');
    expect(commercial).toContain('id="commercial-logout"');
    expect(commercial).toContain('data-commercial-nav="actions"');
    expect(commercial).toContain('data-commercial-nav="activity"');
  });
});

describe('HAB-426 Platform Admin copy', () => {
  it('no longer promises commercial operations as future work', () => {
    expect(operations).not.toContain('se habilitarán');
    expect(operations).not.toContain('HAB-419');
    expect(operations).not.toContain('HAB-422');
  });

  it('still says Overview is read-only and points to the authoritative operating surfaces', () => {
    expect(operations).toContain('solo lectura');
    expect(operations).toContain('href="/customers.html"');
    expect(operations).toContain('Customer 360');
    expect(operations).toContain('<a href="/commercial.html">Comercial</a>');
  });
});

describe('HAB-426 billable boundary is unchanged', () => {
  it('offers commercial actions to customers only', () => {
    expect(commercialScript).toContain("row.account_type !== 'customer'");
    expect(commercialScript).toContain("badge('Fuera de billing'");
  });

  it('shows demo and internal organizations as explicitly nonbillable', () => {
    expect(commercialScript).toContain("demo: 'Demo · no facturable'");
    expect(commercialScript).toContain("internal: 'Interno · no facturable'");
    expect(commercialScript).toContain("customer: 'Cliente'");
  });

  it('does not expose mutation cards in the nonbillable branch', () => {
    const guard = commercialScript.indexOf("if (row.account_type !== 'customer')");
    expect(guard).toBeGreaterThan(0);
    const returnPoint = commercialScript.indexOf('return;', guard);
    expect(returnPoint).toBeGreaterThan(guard);
    const nonBillableBranch = commercialScript.slice(guard, returnPoint);
    expect(nonBillableBranch).toContain("badge('Fuera de billing'");
    for (const mutation of [
      'Iniciar 30 días',
      'Aplicar cupón',
      'Regalar meses',
      'Activar manual',
    ]) {
      expect(nonBillableBranch).not.toContain(mutation);
    }
  });

  it('states the billable rule in the interface, not only in code', () => {
    expect(commercial).toContain('no facturable');
    expect(commercial).toContain('operaciones SaaS ya autorizadas');
  });
});
