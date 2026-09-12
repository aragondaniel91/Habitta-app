import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useDialogBehavior } from '../../components/Drawer';
import { Button } from '../../components/ui';

/**
 * Only mounted while the panel is open, so useDialogBehavior's mount-time focus handling (and its
 * cleanup, which restores focus on close) runs freshly every time the panel opens -- not just once
 * for the lifetime of the parent.
 */
function NotificationDropdownPanel({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  // Escape, Tab-trap and return-focus, matching the same shared behaviour Dialog and Drawer use.
  // Click-outside is handled one level up, by AppShell, since it also owns the bell trigger that
  // must be excluded from the "outside" check.
  useDialogBehavior(panel, onClose);

  return (
    <section
      aria-label="Centro de notificaciones"
      aria-modal="true"
      className="notification-center"
      ref={panel}
      role="dialog"
      tabIndex={-1}
    >
      <header>
        <h2>Notificaciones</h2>
        <Button onClick={onClose} size="sm" variant="ghost">
          Cerrar
        </Button>
      </header>
      {children}
    </section>
  );
}

export function NotificationDropdown({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return <NotificationDropdownPanel onClose={onClose}>{children}</NotificationDropdownPanel>;
}
