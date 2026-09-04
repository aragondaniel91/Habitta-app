import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// HAB-426 originally locked the first Platform Admin navigation shell. HAB-464 evolves that shell
// into the approved owner backoffice IA: Overview -> Clientes -> Comercial. These assertions keep
// the original session/read-only/billing boundaries while validating the current product contract
// instead of pinning obsolete markup and labels from the pre-Customer-360 console.
//
// The billable boundary below is not a layout concern: only a customer is billable, and demo and
// internal organizations must stay visible and explicitly outside billing. That guard lives in
// commercial.js and remains authoritative.

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

  it('keeps exactly one logout control', () => {
    // Two elements sharing an id would leave app.js wiring the first one and the visible one doing
    // nothing.
    expect(operations.match(/id="logout-button"/g) ?? []).toHaveLength(1);
  });

  it('hides the administrative navigation until there is a session', () => {
    // index.html is also the login screen. The shell sits inside #dashboard-view, which carries
    // `hidden` until authentication succeeds, so an anonymous visitor is never offered it.
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
    // HAB-464 moved shell styling into a shared stylesheet so Overview and Customers cannot drift
    // into separate consoles again. Validate the scoped navigation rule at its new source.
    const css = platformShell.replace(/\s+/g, '');
    expect(css).toMatch(/\.platform-nava[^{}]*\{[^}]*text-decoration:none/);

    // Scoped, not global: links elsewhere on the page may keep their own treatment.
    expect(css).not.toMatch(/(^|})a\{[^}]*text-decoration:none/);
  });

  it('keeps the legacy commercial view reachable and self-identifying during incremental migration', () => {
    expect(commercial).toContain('>Operación<');
    expect(commercial).toContain('>Comercial<');
    expect(commercial).toContain('id="logout-button"');
    expect(commercial).toMatch(/aria-current="page"\s+href="\/commercial\.html"/);
  });
});

describe('HAB-426 Platform Admin copy', () => {
  it('no longer promises commercial operations as future work', () => {
    // HAB-424 shipped trials, coupons and gifted access. Telling an operator they "will be enabled"
    // sends them looking for something that is already available.
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
    // The guard itself, quoted. Anything that is not a customer gets a badge instead of controls.
    expect(commercialScript).toContain("row.account_type !== 'customer'");
    expect(commercialScript).toContain("badge('Fuera de billing'");
  });

  it('shows demo and internal organizations as explicitly nonbillable', () => {
    // Visible, and labelled for what they are. Hiding them would make the console disagree with the
    // database about how many organizations exist.
    expect(commercialScript).toContain("badge('Demo · no facturable'");
    expect(commercialScript).toContain("badge('Interno · no facturable'");
    expect(commercialScript).toContain("badge('Cliente'");
  });

  it('never attaches a commercial mutation outside the customer branch', () => {
    // Every mutation control is created in a branch the guard has already excluded. This reads the
    // nonbillable branch itself -- from the guard to where it hands over with `} else` -- rather
    // than a fixed window, which would have spilled into the customer branch that follows.
    const guard = commercialScript.indexOf("row.account_type !== 'customer'");
    expect(guard).toBeGreaterThan(0);
    const branchEnd = commercialScript.indexOf('} else', guard);
    expect(branchEnd).toBeGreaterThan(guard);
    const nonBillableBranch = commercialScript.slice(guard, branchEnd);
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

  it('states the billable rule in the interface, not only in the code', () => {
    expect(commercial).toContain('facturable');
    expect(commercial).toContain('fuera de billing');
  });
});
