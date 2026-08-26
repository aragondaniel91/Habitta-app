import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageChromeExtension, PageChromeProvider, PageHeader } from './components/PageHeader';

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(join(srcDir, 'page-header.css'), 'utf8');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return entry.endsWith('.tsx') ? [full] : [];
  });

const relative = (file: string) => file.slice(srcDir.length).split(sep).join('/');

describe('HAB-369 one header shape for every module', () => {
  it('keeps the heading order the same everywhere', () => {
    const html = renderToStaticMarkup(
      <PageChromeProvider
        value={{ breadcrumb: 'Mantenimiento', actions: <button type="button">Ayuda</button> }}
      >
        <PageHeader
          description="Residencia los Pinos · activos y planes."
          eyebrow="Operación técnica"
          title="Activos y mantenimiento"
        />
      </PageChromeProvider>,
    );

    const order = ['Mantenimiento', 'Operación técnica', '<h1', 'Residencia los Pinos', 'Ayuda'];
    const positions = order.map((needle) => html.indexOf(needle));
    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('renders a workspace switcher inside the header, never above it', () => {
    const html = renderToStaticMarkup(
      <PageChromeProvider value={{ breadcrumb: 'Mantenimiento' }}>
        <PageChromeExtension tabs={<nav>Operaciones</nav>}>
          <PageHeader title="Activos y mantenimiento" />
        </PageChromeExtension>
      </PageChromeProvider>,
    );

    expect(html).toContain('page-header__tabs');
    // The switcher has to follow the title, not precede the breadcrumb.
    expect(html.indexOf('Operaciones')).toBeGreaterThan(html.indexOf('<h1'));
    expect(html.indexOf('page-header__tabs')).toBeLessThan(html.indexOf('</header>'));
  });

  it('does not drop the shell chrome when a module adds its tabs', () => {
    // A wrapper providing its own context value would silently lose the breadcrumb and the
    // shell's own actions, which is why the extension merges instead of replacing.
    const html = renderToStaticMarkup(
      <PageChromeProvider
        value={{ breadcrumb: 'Gobernanza', actions: <button type="button">Ayuda</button> }}
      >
        <PageChromeExtension tabs={<nav>Asambleas</nav>}>
          <PageHeader title="Propuestas" />
        </PageChromeExtension>
      </PageChromeProvider>,
    );

    expect(html).toContain('Gobernanza');
    expect(html).toContain('Ayuda');
    expect(html).toContain('Asambleas');
  });

  it('anchors the actions to the top so every module puts them in the same place', () => {
    const header = css.slice(
      css.indexOf('.page-header {'),
      css.indexOf('}', css.indexOf('.page-header {')),
    );
    expect(header).toContain('align-items: start');
    expect(header).not.toContain('align-items: flex-end');
    expect(css).toContain('.page-header__tabs');
  });

  it('lets no module render its own switcher outside the header', () => {
    const offenders: string[] = [];
    for (const file of walk(srcDir)) {
      if (file.endsWith('.test.tsx')) continue;
      const source = readFileSync(file, 'utf8');
      if (!/<nav[^>]*(switcher|role="tablist")/.test(source)) continue;
      // A module-level switcher must reach the header through the chrome, not sit above the page.
      if (!source.includes('PageChromeExtension')) offenders.push(relative(file));
    }
    expect(offenders).toEqual([]);
  });
});
