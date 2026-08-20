import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Drawer } from './Drawer';

const drawerSource = readFileSync(new URL('./Drawer.tsx', import.meta.url), 'utf8');

describe('Drawer', () => {
  it('announces itself as a modal dialog labelled by its title', () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={() => undefined} prefix="payments" title="Registrar pago">
        <p>contenido</p>
      </Drawer>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Registrar pago"');
    expect(html).toContain('<h2>Registrar pago</h2>');
  });

  it('keeps the class names each module already styles', () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={() => undefined} prefix="treasury" title="Nueva cuenta" wide>
        <p>contenido</p>
      </Drawer>,
    );

    expect(html).toContain('treasury-drawer-layer');
    expect(html).toContain('treasury-drawer-backdrop');
    expect(html).toContain('treasury-drawer__header');
    expect(html).toContain('treasury-drawer__body');
    expect(html).toContain('data-wide="true"');
  });

  it('leaves the backdrop out of the tab order so Tab stays inside the panel', () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={() => undefined} prefix="requests" title="Nueva solicitud">
        <button type="button">Guardar</button>
      </Drawer>,
    );

    expect(html).toMatch(/class="requests-drawer-backdrop"[^>]*tabindex="-1"/);
  });

  it('omits the eyebrow when the module does not supply one', () => {
    const html = renderToStaticMarkup(
      <Drawer onClose={() => undefined} prefix="expenses" title="Registrar gasto">
        <p>contenido</p>
      </Drawer>,
    );

    expect(html).not.toContain('<span></span>');
  });

  it('closes on Escape and restores focus to whatever opened it', () => {
    expect(drawerSource).toContain("event.key === 'Escape'");
    expect(drawerSource).toContain('onCloseRef.current();');
    expect(drawerSource).toContain('previouslyFocused?.focus?.()');
    expect(drawerSource).toContain("event.key !== 'Tab'");
  });

  it('does not rerun initial focus when a consumer passes a new onClose callback', () => {
    expect(drawerSource).toContain('const onCloseRef = useRef(onClose);');
    expect(drawerSource).toContain('onCloseRef.current = onClose;');
    expect(drawerSource).toContain('}, [onClose]);');
    expect(drawerSource).toContain('}, [panel]);');
    expect(drawerSource).not.toContain('}, [panel, onClose]);');
  });
});
