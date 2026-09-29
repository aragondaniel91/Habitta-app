import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Field, Select } from './ui';

describe('Field', () => {
  it('puts required and invalid semantics on the input and links its error', () => {
    const html = renderToStaticMarkup(
      <Field error="Escribe el nombre para continuar." label="Nombre" required>
        <input className="input" />
      </Field>,
    );

    const inputId = /<input\b[^>]*\sid="([^"]+)"/.exec(html)?.[1];
    const errorId = /<span[^>]*id="([^"]+)"[^>]*role="alert"/.exec(html)?.[1];

    expect(inputId).toBeTruthy();
    expect(errorId).toBeTruthy();
    expect(html).toContain(`for="${inputId}"`);
    expect(html).toContain(`aria-describedby="${errorId}"`);
    expect(html).toMatch(/<input[^>]*required=""[^>]*aria-invalid="true"/);
    expect(html).toContain('data-invalid="true"');
    expect(html).not.toContain('field__hint');
    expect(html).toContain('role="alert"');
  });

  it('puts required and invalid semantics on a direct select while retaining caller descriptions', () => {
    const html = renderToStaticMarkup(
      <Field error="Elige una unidad activa." label="Unidad" required>
        <Select aria-describedby="existing-description">
          <option value="unit-1">Unidad 1</option>
        </Select>
      </Field>,
    );

    const errorId = /<span[^>]*id="([^"]+)"[^>]*role="alert"/.exec(html)?.[1];

    expect(errorId).toBeTruthy();
    expect(html).toContain(`aria-describedby="existing-description ${errorId}"`);
    expect(html).toContain(`for="${/<select\b[^>]*\sid="([^"]+)"/.exec(html)?.[1]}"`);
    expect(html).toMatch(/<select[^>]*required=""[^>]*aria-invalid="true"/);
  });

  it('links help text to a required direct textarea', () => {
    const html = renderToStaticMarkup(
      <Field hint="Incluye el detalle relevante." label="Detalle" required>
        <textarea />
      </Field>,
    );

    const textareaId = /<textarea\b[^>]*\sid="([^"]+)"/.exec(html)?.[1];
    const hintId = /<span[^>]*class="field__hint"[^>]*id="([^"]+)"/.exec(html)?.[1];

    expect(textareaId).toBeTruthy();
    expect(hintId).toBeTruthy();
    expect(html).toContain(`for="${textareaId}"`);
    expect(html).toContain(`aria-describedby="${hintId}"`);
    expect(html).toMatch(/<textarea[^>]*required=""/);
  });

  it('keeps a wrapped password input discoverable through its field label', () => {
    const html = renderToStaticMarkup(
      <Field label="Confirmar contraseña">
        <span className="password-input">
          <input className="input" type="password" />
          <button type="button">Mostrar</button>
        </span>
      </Field>,
    );

    expect(html).toMatch(
      /<label class="field"><span class="field__label">Confirmar contraseña<\/span><span class="password-input"><input/,
    );
    expect(html).not.toContain('<span class="password-input" id=');
  });
});
