import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageChromeProvider, PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders one h1 with the eyebrow, description and page actions', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        actions={<button type="button">Registrar gasto</button>}
        description="Residencias Habitta · egresos y soportes."
        eyebrow="Operación financiera"
        title="Gastos"
      />,
    );

    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('>Gastos</h1>');
    expect(html).toContain('Operación financiera');
    expect(html).toContain('Residencias Habitta · egresos y soportes.');
    expect(html).toContain('Registrar gasto');
  });

  it('falls back to the title when no shell breadcrumb is provided', () => {
    const html = renderToStaticMarkup(<PageHeader title="Gastos" />);

    expect(html).toContain('aria-label="Ruta actual"');
    expect(html).toContain('<strong>Gastos</strong>');
  });

  it('uses the shell breadcrumb and appends the shell actions after the page ones', () => {
    const html = renderToStaticMarkup(
      <PageChromeProvider
        value={{ breadcrumb: 'Gastos', actions: <button type="button">Ayuda</button> }}
      >
        <PageHeader actions={<button type="button">Registrar gasto</button>} title="Gastos" />
      </PageChromeProvider>,
    );

    expect(html).toContain('<strong>Gastos</strong>');
    expect(html.indexOf('Registrar gasto')).toBeLessThan(html.indexOf('Ayuda'));
  });

  it('omits the actions container when neither the page nor the shell contributes any', () => {
    const html = renderToStaticMarkup(<PageHeader title="Gastos" />);

    expect(html).not.toContain('page-header__actions');
  });

  it('omits the eyebrow and description when they are not supplied', () => {
    const html = renderToStaticMarkup(<PageHeader title="Gastos" />);

    expect(html).not.toContain('page-header__eyebrow');
    expect(html).not.toContain('<p>');
  });
});
