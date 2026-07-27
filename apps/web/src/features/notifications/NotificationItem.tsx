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
      <button onClick={onRead}>
        <strong>{item.title}</strong>
        <span>{item.body}</span>
        <small>{new Date(item.created_at).toLocaleString('es-VE')}</small>
      </button>
      <div>
        {item.action_url && <button onClick={onNavigate}>Ver detalle</button>}
        <button onClick={onArchive}>Archivar</button>
      </div>
    </article>
  );
}
