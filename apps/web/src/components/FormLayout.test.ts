import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = () => readFile(new URL('./FormLayout.tsx', import.meta.url), 'utf8');

describe('shared administrator form primitives', () => {
  it('gives FormSection a semantic heading, optional description, actions and children', async () => {
    const component = await source();

    expect(component).toContain('<section');
    expect(component).toContain('className="form-section__heading"');
    expect(component).toContain('<h3>{title}</h3>');
    expect(component).toContain('{description ? <p>{description}</p> : null}');
    expect(component).toContain(
      '{actions ? <div className="form-section__actions">{actions}</div> : null}',
    );
    expect(component).toContain('{children}');
  });

  it('keeps FormGrid small: two columns by default, variants and direct-child full spans', async () => {
    const component = await source();

    expect(component).toContain('columns = 2');
    expect(component).toContain('columns?: 1 | 2 | 3');
    expect(component).toContain('data-columns={columns}');
    expect(component).toContain('data-span="full"');
    expect(component).toContain("['form-grid', className]");
  });

  it('marks sticky and alignment intent on FormActions without choosing button labels', async () => {
    const component = await source();

    expect(component).toContain('<footer');
    expect(component).toContain("align = 'end'");
    expect(component).toContain('data-align={align}');
    expect(component).toContain('data-sticky={sticky || undefined}');
  });
});
