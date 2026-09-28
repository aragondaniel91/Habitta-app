import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmDialog, shouldPreventAccidentalDestructiveEnter } from './Dialog';

function targetMatching(...selectors: string[]) {
  return {
    closest: (selector: string) =>
      selectors.some((candidate) => selector.includes(candidate)) ? ({} as Element) : null,
  };
}

describe('destructive confirmation keyboard policy', () => {
  it('blocks Enter from passive dialog content and the dialog container', () => {
    expect(shouldPreventAccidentalDestructiveEnter('Enter', targetMatching(), true)).toBe(true);
  });

  it('does not treat Enter on Cancel as destructive confirmation', () => {
    expect(
      shouldPreventAccidentalDestructiveEnter(
        'Enter',
        targetMatching('[data-confirm-dialog-action]'),
        true,
      ),
    ).toBe(false);
  });

  it('allows explicit Enter and Space activation on the destructive confirm button', () => {
    const confirmButton = targetMatching('[data-confirm-dialog-action]', 'button');

    expect(shouldPreventAccidentalDestructiveEnter('Enter', confirmButton, true)).toBe(false);
    expect(shouldPreventAccidentalDestructiveEnter(' ', confirmButton, true)).toBe(false);
  });

  it('keeps both actions disabled while a destructive confirmation is busy', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        busy
        confirmLabel="Eliminar"
        description="Esta acción no se puede deshacer."
        destructive
        onCancel={() => undefined}
        onConfirm={() => undefined}
        title="Eliminar registro"
      />,
    );

    expect(html).toMatch(/data-confirm-dialog-action="cancel"[^>]*disabled=""/);
    expect(html).toMatch(/data-confirm-dialog-action="confirm"[^>]*disabled=""/);
    expect(html).toContain('Procesando');
  });

  it('leaves interactive children able to handle Enter themselves', () => {
    expect(shouldPreventAccidentalDestructiveEnter('Enter', targetMatching('textarea'), true)).toBe(
      false,
    );
    expect(shouldPreventAccidentalDestructiveEnter('Enter', targetMatching('a[href]'), true)).toBe(
      false,
    );
    expect(
      shouldPreventAccidentalDestructiveEnter('Enter', targetMatching('[role="button"]'), true),
    ).toBe(false);
  });

  it('does not alter Enter behavior for non-destructive confirmations', () => {
    expect(shouldPreventAccidentalDestructiveEnter('Enter', targetMatching(), false)).toBe(false);
  });
});
