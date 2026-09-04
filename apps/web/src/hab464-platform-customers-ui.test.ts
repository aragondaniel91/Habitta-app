import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const customersHtml = readFileSync(
  fileURLToPath(new URL('../../platform-admin/customers.html', import.meta.url)),
  'utf8',
);
const customersJs = readFileSync(
  fileURLToPath(new URL('../../platform-admin/customers.js', import.meta.url)),
  'utf8',
);
const overviewHtml = readFileSync(
  fileURLToPath(new URL('../../platform-admin/index.html', import.meta.url)),
  'utf8',
);

describe('HAB-464 Platform Admin customer portfolio and Customer 360', () => {
  it('ships the approved dense portfolio and selected-customer states in one coherent shell', () => {
    expect(customersHtml).toContain('class="platform-sidebar"');
    expect(customersHtml).toContain('aria-current="page" data-icon="customers"');
    expect(customersHtml).toContain('id="customers-list-view"');
    expect(customersHtml).toContain('id="customer-detail-view"');
    expect(customersHtml).toContain('Customer 360');
    expect(customersHtml).toContain('Suscripción y términos');
    expect(customersHtml).toContain('Ajustes comerciales');
    expect(customersHtml).toContain('Historial comercial');
    expect(customersHtml).toContain('Uso seguro');
    expect(overviewHtml).toContain('href="/customers.html">Clientes</a>');
  });

  it('uses only hardened Postgres read boundaries with the operator JWT', () => {
    expect(customersJs).toContain("rpc('get_platform_operations_overview'");
    expect(customersJs).toContain("rpc('get_platform_commercial_overview'");
    expect(customersJs).toContain("rpc('get_platform_customer_360'");
    expect(customersJs).toContain('/rest/v1/platform_admins?select=user_id');
    expect(customersJs).not.toContain('service_role');
    expect(customersJs).not.toContain('/rest/v1/payments');
    expect(customersJs).not.toContain('/rest/v1/receivables');
    expect(customersJs).not.toContain('/rest/v1/ledger');
    expect(customersJs).not.toContain('/rest/v1/profiles');
  });

  it('keeps demo and internal accounts explicitly nonbillable and outside revenue urgency', () => {
    expect(customersJs).toContain("const isCustomer = organization.accountType === 'customer';");
    expect(customersJs).toContain("billingState = 'not_applicable'");
    expect(customersJs).toContain("return 'No facturable';");
    expect(customersJs).toContain("'Cuenta no facturable: las señales de revenue no aplican.'");
  });

  it('preserves portfolio context while drilling into Customer 360', () => {
    expect(customersJs).toContain("params.set('organization', organizationId);");
    expect(customersJs).toContain("params.delete('organization');");
    expect(customersJs).toContain("params.set('q', value)").toBe(false);
    expect(customersJs).toContain('q: searchInput.value.trim()');
    expect(customersJs).toContain("window.addEventListener('popstate', route)");
  });

  it('makes the customer rows keyboard-operable instead of mouse-only', () => {
    expect(customersJs).toContain('row.tabIndex = 0;');
    expect(customersJs).toContain(
      "row.setAttribute('aria-label', `Abrir Customer 360 de ${organization.name}`)",
    );
    expect(customersJs).toContain("event.key !== 'Enter' && event.key !== ' '");
  });
});
