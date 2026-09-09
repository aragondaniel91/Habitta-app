import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useDialogBehavior } from '../../components/Drawer';
import { Button } from '../../components/ui';
import './NotificationDropdown.css';

export function NotificationDropdown({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useDialogBehavior(panel, onClose);

  if (!open) return null;
  return (
    <div className="notification-center-layer" role="presentation">
      <button
        aria-label="Cerrar centro de notificaciones"
        className="notification-center-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
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
    </div>
  );
}
