import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InfoHint } from './ui';

const uiSource = readFileSync(new URL('./ui.tsx', import.meta.url), 'utf8');

describe('InfoHint', () => {
  it('starts closed so the copy does not compete with the content', () => {
    const html = renderToStaticMarkup(
      <InfoHint label="Qué significa el monto de un plan">
        El monto significa presupuesto total cuando se distribuye por alícuota.
      </InfoHint>,
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-open="false"');
    // The text still ships in the markup: hidden from sight, not from a reader that wants it.
    expect(html).toContain('El monto significa presupuesto total');
  });

  it('wires the marker to its panel for assistive technology', () => {
    const html = renderToStaticMarkup(
      <InfoHint label="Cómo se agrupan las monedas">Nunca se combinan monedas.</InfoHint>,
    );

    const controls = /aria-controls="([^"]+)"/.exec(html);
    const panelId = /<span[^>]*id="([^"]+)"[^>]*role="tooltip"/.exec(html);
    expect(controls).not.toBeNull();
    expect(panelId).not.toBeNull();
    expect(controls?.[1]).toBe(panelId?.[1]);
    expect(html).toContain('aria-label="Cómo se agrupan las monedas"');
    expect(html).toContain('type="button"');
  });

  it('marks the glyph decorative so the label is what gets announced', () => {
    const html = renderToStaticMarkup(<InfoHint label="Ayuda">Texto</InfoHint>);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/aria-hidden="true">\?</);
  });

  it('offers a warning tone with its own glyph', () => {
    const html = renderToStaticMarkup(
      <InfoHint label="Cuidado" tone="warning">
        Texto
      </InfoHint>,
    );
    expect(html).toContain('data-tone="warning"');
    expect(html).toMatch(/aria-hidden="true">!</);
  });

  /*
   * The project has no DOM test environment (no jsdom, no testing-library), so opening cannot be
   * driven here. These assertions pin the three input paths instead: pointer, keyboard and touch.
   * A touch device never fires hover, which is why the click toggle has to exist.
   */
  it('opens on hover, on focus and on click', () => {
    const component = uiSource.slice(uiSource.indexOf('export function InfoHint'));
    expect(component).toContain('onMouseEnter');
    expect(component).toContain('onFocus');
    expect(component).toContain('onClick');
    expect(component).toContain("event.key !== 'Escape'");
    expect(component).toContain("document.addEventListener('pointerdown'");
    // A pinned hint must survive the mouse leaving, or a click-to-open would close instantly.
    expect(component).toContain('if (!pinned) setOpen(false);');
  });
});
