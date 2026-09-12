import { Button } from '../../components/ui';
import type { Notification } from './types';

export function NotificationItem({
  item,
  onRead,
  onArchive,
  onNavigate,
}: {
  item: Notification;
  onRead: () => void;
  onArchive: () => void;
  onNavigate: () => void;
}) {
  return (
    <article className={item.read_at ? 'notification read' : 'notification'}>
      <Button className="notification__body" onClick={onRead} variant="ghost">
        <strong>{item.title}</strong>
        <span>{item.body}</span>
        <small>{new Date(item.created_at).toLocaleString('es-VE')}</small>
      </Button>
      <div>
        {item.action_url && (
          <Button onClick={onNavigate} size="sm" variant="secondary">
            Ver detalle
          </Button>
        )}
        <Button onClick={onArchive} size="sm" variant="ghost">
          Archivar
        </Button>
      </div>
    </article>
  );
}
