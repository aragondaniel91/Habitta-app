import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const residentCss = source('./resident-dashboard.css');
const adminCss = source('./dashboard.css');
const residentPage = source('./pages/ResidentDashboard.tsx');

const declaration = (css: string, selector: string, property: string) => {
  const start = css.indexOf(selector);
  if (start < 0) return null;
  const block = css.slice(start, css.indexOf('}', start));
  return new RegExp(`${property}:\\s*([^;]+)`).exec(block)?.[1]?.trim() ?? null;
};

describe('HAB-370 the resident dashboard reads as the same product', () => {
  it('shows an amount the way the administrative dashboard shows one', () => {
    // Same role, same treatment. The resident amount used to be bigger, in the body face, with
    // its own letter-spacing, which is what made the two look like different products.
    const resident = declaration(residentCss, '.resident-dashboard__balances strong', 'font-size');
    const admin = declaration(adminCss, '.dashboard-currency-values strong', 'font-size');
    expect(resident).toBe(admin);
    expect(declaration(residentCss, '.resident-dashboard__balances strong', 'font-family')).toBe(
      'var(--font-heading)',
    );
  });

  it('gives its hero cards the same anatomy as a metric card', () => {
    expect(residentPage).toContain('className="resident-dashboard__card-top"');
    expect(residentPage).toContain('className="resident-dashboard__card-icon"');
    expect(residentPage).toContain('data-tone=');
    // The icon chip is the circular, tone-tinted one the administrative cards use.
    expect(declaration(residentCss, '.resident-dashboard__card-icon', 'border-radius')).toBe(
      declaration(adminCss, '.dashboard-metric-card__icon', 'border-radius'),
    );
    expect(declaration(residentCss, '.resident-dashboard__card-icon', 'width')).toBe(
      declaration(adminCss, '.dashboard-metric-card__icon', 'width'),
    );
  });

  it('reads the palette directly like every other sheet', () => {
    // This sheet was the only one reaching the tokens through `--color-*` aliases with fallbacks.
    expect(residentCss).not.toContain('--color-');
    const rawRadii = (residentCss.match(/border-radius:\s*\d+px/g) ?? []).filter(
      (rule) => !rule.includes('999px'),
    );
    expect(rawRadii).toEqual([]);
  });

  it('puts its standing explanation behind the same marker as the rest of the app', () => {
    expect(residentPage).toContain('<InfoHint label="Cómo se agrupan las monedas">');
    expect(residentPage).toContain('Habitta mantiene cada moneda separada');
  });

  it('keeps the resident view honest about what it may show', () => {
    // Presentation only: the financial restrictions this page enforces must survive the redesign.
    // HAB-412 widened the restricted set from tenants to every role the database refuses payment
    // access to, so the gate is named for what it means rather than for one of the roles it covers
    // -- `tenantOnly` would have admitted family members and authorized occupants, neither of whom
    // is a tenant.
    expect(residentPage).toContain('const paymentsRoute = showsFinancialContext ? routeByKey(');
    expect(residentPage).toContain('Los pagos no están delegados al inquilino en el modo piloto.');
    expect(residentPage).toContain('{showsFinancialContext ? (');
    expect(residentPage).toContain('const paymentsRequest = !showsFinancialContext');
  });
});
