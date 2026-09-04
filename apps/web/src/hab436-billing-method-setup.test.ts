import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const billingClient = read('./lib/billing.ts');
const card = read('./features/settings/BillingMethodSetupCard.tsx');
const settingsSurface = read('./features/settings/CondominiumDangerZone.tsx');

describe('HAB-436 payment-method setup UX contract', () => {
  it('renders payment setup as a separate step after the commercial summary', () => {
    expect(settingsSurface).toContain(
      "import { BillingMethodSetupCard } from './BillingMethodSetupCard'",
    );
    expect(settingsSurface.indexOf('<CommercialSummaryCard')).toBeLessThan(
      settingsSurface.indexOf('<BillingMethodSetupCard'),
    );
  });

  it('uses a stable browser idempotency key and the authenticated Habitta API', () => {
    expect(billingClient).toContain('window.sessionStorage.getItem(key)');
    expect(billingClient).toContain("headers: { 'Idempotency-Key': idempotencyKey }");
    expect(billingClient).toContain('/billing/setup`');
  });

  it('does not expose Stripe server credentials to the browser surface', () => {
    const browserSurface = `${billingClient}\n${card}\n${settingsSurface}`;
    expect(browserSurface).not.toMatch(/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|sk_live_|whsec_/);
  });

  it('does not trust the Stripe redirect as payment-method readiness', () => {
    expect(card).toContain("if (returnState !== 'success') return");
    expect(card).toContain('const value = await refresh()');
    expect(card).toContain('if (value.billing_method_ready)');
    expect(card).toContain('No repitas el pago');
  });

  it('tells the customer that Stripe hosts card capture and Habitta does not store full card data', () => {
    expect(card).toContain('Configuración segura alojada por Stripe');
    expect(card).toMatch(/datos completos de tu\s+tarjeta no se almacenan en Habitta/);
    expect(card).toContain('Hoy no se realiza ningún cobro');
  });
});
