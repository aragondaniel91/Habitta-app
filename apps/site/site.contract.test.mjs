import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

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
    expect(page).not.toMatch(/\$\s?(29|49|79|129|169)(?:[,.]00)?/);
    expect(page).not.toMatch(/testimonio|clientes satisfechos|reseñas|estrellas|% de uptime/i);
  });

  it('uses an accurate operational descriptor for Habitta Comunidad', () => {
    expect(page).toMatch(/<p class="plan-badge">PARA LA OPERACIÓN DIARIA<\/p>/i);
    expect(page).not.toMatch(/MÁS COMPLETO/i);
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
    expect(styles).toContain('min-height: 48px');
    expect(styles).toContain(':focus-visible');
  });

  it('loads its static assets from the site directory', () => {
    expect(page).toContain('href="./styles.css"');
    expect(page).toContain('src="./site.js"');
    expect(page).toContain('src="./logo-mark.svg"');
    expect(page).not.toMatch(/(?:href|src)="\/(?:styles\.css|site\.js|logo-mark\.svg)"/);
  });
});
