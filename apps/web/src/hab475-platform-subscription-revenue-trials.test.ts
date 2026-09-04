import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const overview = read('../../platform-admin/index.html');
const customers = read('../../platform-admin/customers.html');
const operations = read('../../platform-admin/subscriptions.html');
const operationsScript = read('../../platform-admin/subscriptions.js');
const operationsCss = read('../../platform-admin/subscription-ops.css');

describe('HAB-475 Platform Admin subscription/revenue/trial shell', () => {
  it('makes the new owner operations reachable from the existing shared shell', () => {
    for (const source of [overview, customers, operations]) {
      expect(source).toContain('href="/subscriptions.html"');
      expect(source).toContain('href="/subscriptions.html?view=trials"');
      expect(source).toContain('href="/subscriptions.html?view=revenue"');
      expect(source).toContain('>Suscripciones<');
      expect(source).toContain('>Trials<');
      expect(source).toContain('>Revenue<');
    }
  });

  it('reuses the approved HABITTA Platform Admin shell instead of introducing another console', () => {
    expect(operations).toContain('class="platform-layout"');
    expect(operations).toContain('class="platform-sidebar"');
    expect(operations).toContain('class="platform-topbar"');
    expect(operations).toContain('href="/platform-shell.css"');
    expect(operations).toContain('href="/subscription-ops.css"');
    expect(operations).toContain('id="ops-logout"');
  });

  it('ships dense operational filters, three retained views and direct Customer 360 drill-down', () => {
    expect(operations).toContain('data-ops-tab="subscriptions"');
    expect(operations).toContain('data-ops-tab="revenue"');
    expect(operations).toContain('data-ops-tab="trials"');
    expect(operations).toContain('id="ops-account-filter"');
    expect(operations).toContain('id="ops-status-filter"');
    expect(operations).toContain('id="ops-billing-filter"');
    expect(operationsScript).toContain('new URLSearchParams(window.location.search)');
    expect(operationsScript).toContain('/customers.html?organization=');
  });

  it('has a usable responsive fallback without replacing the desktop-first table', () => {
    expect(operationsCss).toContain('.ops-table');
    expect(operationsCss).toContain('min-width: 1500px');
    expect(operationsCss).toContain('@media (max-width: 1320px)');
    expect(operationsCss).toContain('@media (max-width: 760px)');
  });
});

describe('HAB-475 authoritative read boundary', () => {
  it('uses only the established platform identity/commercial read contracts', () => {
    expect(operationsScript).toContain("rpc('get_platform_operations_overview'");
    expect(operationsScript).toContain("rpc('get_platform_commercial_overview'");
    expect(operationsScript).toContain('/rest/v1/platform_admins?select=user_id');

    const rpcCalls = [
      ...operationsScript.matchAll(/rpc\('([^']+)'/g),
    ].map((match) => match[1]);
    expect([...new Set(rpcCalls)].sort()).toEqual([
      'get_platform_commercial_overview',
      'get_platform_operations_overview',
    ]);
  });

  it('never expands into tenant-private or privileged browser data paths', () => {
    expect(operationsScript).not.toContain('service_role');
    expect(operationsScript).not.toContain('/rest/v1/people');
    expect(operationsScript).not.toContain('/rest/v1/payments');
    expect(operationsScript).not.toContain('/rest/v1/receivables');
    expect(operationsScript).not.toContain('/rest/v1/ledger');
    expect(operationsScript).not.toContain('/rest/v1/treasury');
    expect(operationsScript).not.toContain("method: 'PATCH'");
    expect(operationsScript).not.toContain("method: 'DELETE'");
  });

  it('keeps identity bounded by operations data and only enriches matching condominiums', () => {
    expect(operationsScript).toContain('commercialByCondominium');
    expect(operationsScript).toContain('return operationsRows.map');
    expect(operationsScript).not.toContain('return commercialRows.map');
  });
});

describe('HAB-475 revenue semantics', () => {
  it('includes only confirmed billable customers in active/past_due run-rate', () => {
    expect(operationsScript).toContain("row.account_type === 'customer'");
    expect(operationsScript).toContain("row.commercial_status === 'confirmed'");
    expect(operationsScript).toContain("['active', 'past_due'].includes(row.subscription_status)");
    expect(operationsScript).toContain("aggregateRunRate(rows, 'effective_period_amount')");
  });

  it('normalizes annual terms to monthly and defines ARR as twelve times effective MRR', () => {
    expect(operationsScript).toContain("period === 'annual' ? amount / 12 : amount");
    expect(operationsScript).toContain("aggregateRunRate(rows, 'effective_period_amount', 12)");
    expect(operations).toContain('MRR efectivo × 12');
    expect(operations).toContain('no es revenue histórico reconocido');
  });

  it('does not silently sum different currencies', () => {
    expect(operationsScript).toContain("if (totals.size !== 1) return 'Monedas mixtas'");
  });

  it('keeps contracted, catalog and effective price context visibly distinct', () => {
    expect(operations).toContain('<th>Contratado</th>');
    expect(operations).toContain('<th>Catálogo</th>');
    expect(operations).toContain('<th>Efectivo</th>');
    expect(operationsScript).toContain("priceCell(tr, row, 'contracted_period_amount')");
    expect(operationsScript).toContain("priceCell(tr, row, 'catalog_reference_amount')");
    expect(operationsScript).toContain("priceCell(tr, row, 'effective_period_amount')");
  });
});

describe('HAB-475 trials and billing attention', () => {
  it('uses real trial dates for 7/14/30 day buckets and upcoming-customer actions', () => {
    expect(operationsScript).toContain("if (days <= 7) return '7'");
    expect(operationsScript).toContain("if (days <= 14) return '14'");
    expect(operationsScript).toContain("return '30'");
    expect(operations).toContain('id="ops-trial-7"');
    expect(operations).toContain('id="ops-trial-14"');
    expect(operations).toContain('id="ops-trial-30"');
    expect(operationsScript).toContain('row.trial_ends_at');
  });

  it('derives billing readiness only from authoritative consent/method/status fields', () => {
    expect(operationsScript).toContain('row.billing_consent_recorded');
    expect(operationsScript).toContain('row.billing_method_ready');
    expect(operationsScript).toContain('row.auto_bill_enabled');
    expect(operationsScript).toContain("['past_due', 'suspended'].includes(row.subscription_status)");
  });

  it('keeps demo/internal explicitly nonbillable and outside revenue urgency', () => {
    expect(operationsScript).toContain("if (!isCustomer(row)) return 'not_applicable'");
    expect(operationsScript).toContain("label: 'No facturable'");
    expect(operations).toContain('Demo, internal, trials, suspended y cancelled no inflan revenue');
  });
});
