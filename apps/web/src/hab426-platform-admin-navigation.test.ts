import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// HAB-426: Platform Admin is two areas of one backoffice, not two consoles that happen to share a
// logo. The operations view could not reach the commercial one at all, and still told the operator
// that commercial operations "will be enabled" -- copy written before HAB-424 shipped them.
//
// The other half of this file is a boundary, not a layout: only a customer is billable, and demo
// and internal organizations must stay visible and explicitly outside billing. That guard lives in
// commercial.js and predates this change; asserting it here keeps a navigation change from being
// the thing that quietly loosens it.

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const operations = read('../../platform-admin/index.html');
const commercial = read('../../platform-admin/commercial.html');
const commercialScript = read('../../platform-admin/commercial.js');

describe('HAB-426 Platform Admin navigation', () => {
  it('gives the operations view the same three destinations as the commercial one', () => {
    expect(operations).toContain('>Operación<');
    expect(operations).toContain('>Comercial<');
    expect(operations).toContain('href="/commercial.html"');
    expect(operations).toContain('Cerrar sesión');
  });

  it('marks Operación as the current page there', () => {
    expect(operations).toMatch(/aria-current="page"\s+href="\/"/);
  });

  it('keeps exactly one logout control', () => {
    // The button moved into the nav rather than being duplicated. Two elements sharing an id would
    // leave app.js wiring the first one and the visible one doing nothing.
    expect(operations.match(/id="logout-button"/g) ?? []).toHaveLength(1);
  });

  it('hides the administrative navigation until there is a session', () => {
    // index.html is also the login screen. The nav sits inside #dashboard-view, which carries
    // `hidden` until authentication succeeds, so an anonymous visitor is never offered it.
    const dashboardStart = operations.indexOf('id="dashboard-view"');
    const navStart = operations.indexOf('<nav class="nav"');
    expect(dashboardStart).toBeGreaterThan(0);
    expect(navStart).toBeGreaterThan(dashboardStart);
    expect(operations).toMatch(/<section hidden id="dashboard-view">/);

    const loginStart = operations.indexOf('id="login-view"');
    expect(loginStart).toBeGreaterThan(0);
    expect(loginStart).toBeLessThan(navStart);
  });

  it('renders the nav links without the browser underline, as the commercial view does', () => {
    // commercial.html gets this from a global `a { text-decoration: none }` reset. index.html has
    // no such reset, so the same markup rendered underlined on one page and plain on the other --
    // two consoles again, over one declaration.
    //
    // Matched on collapsed whitespace so the assertion survives reformatting, and it accepts the
    // property either in a rule of its own or in a shared block, as long as it reaches `.nav a`.
    const css = operations.replace(/\s+/g, '');
    expect(css).toMatch(/\.nava[^{}]*\{[^}]*text-decoration:none/);

    // Scoped, not global: links elsewhere on the page keep their underline.
    expect(css).not.toMatch(/(^|})a\{[^}]*text-decoration:none/);
  });

  it('keeps the commercial view reachable and self-identifying', () => {
    expect(commercial).toContain('>Operación<');
    expect(commercial).toContain('>Comercial<');
    expect(commercial).toContain('id="logout-button"');
    expect(commercial).toMatch(/aria-current="page"\s+href="\/commercial\.html"/);
  });
});

describe('HAB-426 Platform Admin copy', () => {
  it('no longer promises commercial operations as future work', () => {
    // HAB-424 shipped trials, coupons and gifted access. Telling an operator they "will be enabled"
    // sends them looking for something that is already one click away.
    expect(operations).not.toContain('se habilitarán');
    expect(operations).not.toContain('HAB-419');
    expect(operations).not.toContain('HAB-422');
  });

  it('still says the operations view is read-only, and where to act instead', () => {
    expect(operations).toContain('solo lectura');
    expect(operations).toMatch(/administran desde\s*<a href="\/commercial\.html">Comercial<\/a>/);
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
