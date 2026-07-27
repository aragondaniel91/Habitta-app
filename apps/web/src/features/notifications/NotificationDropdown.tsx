import type { ReactNode } from 'react';

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
  return (
    <section className="notification-center" aria-label="Centro de notificaciones">
      <header>
        <h2>Notificaciones</h2>
        <button onClick={onClose}>Cerrar</button>
      </header>
      {children}
    </section>
  );
}
