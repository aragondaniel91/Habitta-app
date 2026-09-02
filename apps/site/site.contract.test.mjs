import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const pricingStyles = await readFile(new URL('./pricing.css', import.meta.url), 'utf8');
const script = await readFile(new URL('./site.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('./_headers', import.meta.url), 'utf8');

describe('HAB-428 public site contract', () => {
  it('keeps the Spanish document, searchable metadata and a responsive viewport', () => {
    expect(page).toContain('<html lang="es">');
    expect(page).toContain('<title>Habitta — Software de administración de condominios</title>');
    expect(page).toMatch(/name="description" content="[^"]+"/);
    expect(page).toContain('name="viewport"');
  });

  it('keeps the main navigation, entry point and contact route', () => {
    expect(page).toContain('aria-label="Navegación principal"');
    for (const label of ['Producto', 'Para quién', 'Cómo funciona', 'Seguridad', 'Precios']) {
      expect(page).toContain(`>${label}<`);
    }
    expect(page).toContain('href="https://app.mihabitta.com"');
    expect(page).toContain('hola@mihabitta.com');
  });

  it('retains the required marketing story in semantic landmarks', () => {
    expect(page).toContain('<main id="contenido">');
    expect(page).toContain('<footer class="site-footer">');
    for (const id of ['producto', 'para-quien', 'como-funciona', 'seguridad', 'precios']) {
      expect(page).toContain(`id="${id}"`);
    }
    expect(page).toContain('Una plataforma.<br /><em>Dos experiencias que encajan.</em>');
  });

  it('does not introduce checkout, fabricated prices, fake proof or dead hash links', () => {
    expect(page).not.toMatch(/href="#"/);
    expect(page).not.toMatch(/comprar ahora|checkout|pagar ahora|activar suscripción/i);
    expect(`${page}\n${script}`).not.toMatch(/\$\s?(29|49|79|129|169)(?:[,.]00)?/);
    expect(page).not.toMatch(/testimonio|clientes satisfechos|reseñas|estrellas|% de uptime/i);
  });

  it('loads public prices from the authoritative API and never carries a price fallback', () => {
    expect(script).toContain(
      'https://habitta-api-prod.aragondaniel91.workers.dev/public/v1/plans',
    );
    expect(script).toContain("payload.currency !== 'USD'");
    expect(script).toContain('catalog_monthly_usd');
    expect(script).toContain('catalog_annual_usd');
    expect(script).toContain("nextPeriod !== 'monthly' && nextPeriod !== 'annual'");
    expect(script).toContain('Precios temporalmente no disponibles.');
    expect(script).not.toMatch(/fallbackPrice|defaultPrice|hardcodedPrice/i);
  });

  it('keeps billing choice accessible and the approved Comunidad descriptor accurate', () => {
    expect(script).toContain("monthly.setAttribute('aria-pressed', 'true')");
    expect(script).toContain("annual.setAttribute('aria-pressed', 'false')");
    expect(script).toContain("toggle.setAttribute('aria-label', 'Periodo de facturación')");
    expect(script).toContain('PARA LA OPERACIÓN DIARIA');
    expect(script).not.toMatch(/MÁS COMPLETO/i);
    expect(pricingStyles).toContain('min-height: 44px');
  });

  it('exposes the product composition as one labelled illustration', () => {
    const composition = page.match(/<div class="product-composition"([^>]*)>/i);
    expect(composition).not.toBeNull();
    expect(composition?.[1]).toMatch(/role="img"/i);
    expect(composition?.[1]).toMatch(/aria-label="[^"]+"/i);
    expect(page).toMatch(/<div class="product-visual"\s+aria-hidden="true">/i);
    expect(page).not.toMatch(/<button[^>]+tabindex="-1"/i);
    expect(page).not.toMatch(/<button[^>]*>\s*(?:\+ Registrar pago|Ver estado de cuenta)/i);
  });

  it('supports reduced motion and accessible interaction sizing', () => {
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(pricingStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(styles).toContain('min-height: 48px');
    expect(styles).toContain(':focus-visible');
    expect(pricingStyles).toContain(':focus-visible');
  });

  it('allows only the production catalogue endpoint through the marketing-site CSP', () => {
    expect(headers).toContain(
      "connect-src 'self' https://habitta-api-prod.aragondaniel91.workers.dev;",
    );
    expect(headers).not.toMatch(/connect-src[^;]*\*/);
  });

  it('loads its static assets from the site directory', () => {
    expect(page).toContain('href="./styles.css"');
    expect(page).toContain('src="./site.js"');
    expect(page).toContain('src="./logo-mark.svg"');
    expect(script).toContain("pricingStyles.href = './pricing.css'");
    expect(page).not.toMatch(/(?:href|src)="\/(?:styles\.css|site\.js|logo-mark\.svg)"/);
  });
});
