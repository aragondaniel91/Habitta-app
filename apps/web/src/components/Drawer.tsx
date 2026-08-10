import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './ui';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Props = {
  /**
   * CSS prefix of the owning module, so each drawer keeps the styles it already had:
   * "payments" produces payments-drawer-layer, payments-drawer, payments-drawer__header…
   */
  prefix: string;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Rendered next to the close button, for actions that belong to the panel itself. */
  headerActions?: ReactNode;
};

/**
 * Every module had written its own drawer shell, and only three of the ten declared any dialog
 * semantics at all. This is the single implementation: it announces itself as a modal dialog,
 * closes on Escape, keeps Tab inside while open, and gives focus back where it came from.
 */
/**
 * Escape to close, Tab kept inside, focus returned on unmount. Exported so panels with their own
 * markup — the help drawer, for one — get the same behaviour without copying it.
 */
export function useDialogBehavior(
  panel: { current: HTMLElement | null },
  onClose: () => void,
): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;

      const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (!focusable.length) {
        event.preventDefault();
        panel.current.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [panel, onClose]);
}

export function Drawer({
  prefix,
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
  headerActions,
}: Props) {
  const panel = useRef<HTMLElement>(null);
  useDialogBehavior(panel, onClose);

  return (
    <div className={`${prefix}-drawer-layer`} role="presentation">
      <button
        aria-label="Cerrar panel"
        className={`${prefix}-drawer-backdrop`}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={title}
        aria-modal="true"
        className={`${prefix}-drawer`}
        data-wide={wide || undefined}
        ref={panel}
        role="dialog"
        tabIndex={-1}
      >
        <header className={`${prefix}-drawer__header`}>
          <div>
            {eyebrow ? <span>{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <div className="drawer-header-actions">
            {headerActions}
            <Button aria-label="Cerrar" onClick={onClose} size="sm" variant="ghost">
              ×
            </Button>
          </div>
        </header>
        <div className={`${prefix}-drawer__body`}>{children}</div>
      </aside>
    </div>
  );
}
