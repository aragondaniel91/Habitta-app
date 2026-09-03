import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

describe('HAB-435 commercial checkout contract', () => {
  it('uses customer-scoped preview and consent RPCs without exposing Platform Admin promotion writes', async () => {
    const commercial = await read('./lib/commercial.ts');

    expect(commercial).toContain("supabase.rpc('get_customer_commercial_checkout_preview_v1'");
    expect(commercial).toContain("supabase.rpc('record_customer_commercial_consent_v1'");
    expect(commercial).not.toContain('platform_apply_commercial_offer');
    expect(commercial).not.toMatch(/service[_ -]?role/i);
  });

  it('shows the entire price timeline before consent', async () => {
    const card = await read('./features/settings/CommercialSummaryCard.tsx');

    expect(card).toContain('Precio de lista');
    expect(card).toContain('Precio contratado');
    expect(card).toContain('Debido hoy');
    expect(card).toContain('Primer cobro');
    expect(card).toContain('Después de la promoción');
    expect(card).toContain('checkout.amount_due_today');
    expect(card).toContain('checkout.first_billing_date');
    expect(card).toContain('checkout.first_period_amount');
    expect(card).toContain('checkout.post_promotion_period_amount');
    expect(card).toContain('checkout.promotion.duration_months');
  });

  it('keeps promotion entry as server-side preview until explicit consent', async () => {
    const card = await read('./features/settings/CommercialSummaryCard.tsx');

    expect(card).toContain('Código promocional (opcional)');
    expect(card).toContain('Aplicar código');
    expect(card).toContain('loadCommercialCheckoutPreview(condominiumId, nextOfferCode)');
    expect(card).toContain('previewMatchesInput');
    expect(card).toContain('checkout.terms_fingerprint');
    expect(card).toContain("checkout.promotion?.code ?? null");
    expect(card).not.toContain('platform_apply_commercial_offer');
  });

  it('requires a separate affirmative consent action and states the no-charge boundary', async () => {
    const card = await read('./features/settings/CommercialSummaryCard.tsx');

    expect(card).toContain('type="checkbox"');
    expect(card).toContain('consentAccepted');
    expect(card).toContain('Aceptar condiciones comerciales');
    expect(card).toMatch(/hoy no se\s+realiza ningún cobro/);
    expect(card).toMatch(/no agrega un método de pago/);
    expect(card).toMatch(/cobro\s+automático permanece deshabilitado/);
    expect(card).toMatch(/método de pago se configurará en un paso separado/);
  });

  it('keeps resident finance and automatic billing outside this slice', async () => {
    const sources = (
      await Promise.all([
        read('./lib/commercial.ts'),
        read('./features/settings/CommercialSummaryCard.tsx'),
      ])
    ).join('\n');

    expect(sources).not.toMatch(/\.from\(['"](?:payments|receivable_items|ledger_entries|treasury)/i);
    expect(sources).not.toMatch(/auto_bill_enabled\s*:\s*true/i);
    expect(sources).not.toMatch(/billing_method_ready_at\s*:/i);
  });

  it('adds a responsive review surface without creating a parallel checkout page', async () => {
    const card = await read('./features/settings/CommercialSummaryCard.tsx');
    const styles = await read('./features/settings/commercial-checkout.css');

    expect(card).toContain('settings-commercial-checkout');
    expect(card).toContain("import './commercial-checkout.css'");
    expect(styles).toContain('.settings-commercial-pricing-grid');
    expect(styles).toContain('.settings-commercial-timeline');
    expect(styles).toContain('.settings-commercial-consent');
    expect(styles).toContain('@media (max-width: 720px)');
    expect(card).not.toMatch(/navigate\([^)]*checkout|href=["'][^"']*checkout/i);
  });
});
