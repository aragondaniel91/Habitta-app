import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotificationBell } from './NotificationBell';
import { NotificationCenter } from './NotificationCenter';
import { NotificationItem } from './NotificationItem';
import type { Session } from '@supabase/supabase-js';

const session = { access_token: 'jwt' } as Session;
describe('notifications UI', () => {
  it('renders the accessible notification bell', () => {
    const html = renderToStaticMarkup(
      <NotificationBell session={session} onOpen={() => undefined} />,
    );
    expect(html).toContain('Abrir notificaciones');
  });
  it('renders center filters, empty state and administrative sections', () => {
    const html = renderToStaticMarkup(
      <NotificationCenter session={session} condominiumId="c" open onClose={() => undefined} />,
    );
    expect(html).toContain('Solo no leídas');
    expect(html).toContain('Solo condominio actual');
    expect(html).toContain('No tienes notificaciones');
    expect(html).toContain('Preferencias');
  });
  it('renders archive and action controls for internal actions', () => {
    const html = renderToStaticMarkup(
      <NotificationItem
        item={{
          id: 'n',
          condominium_id: 'c',
          notification_type: 'payment_approved',
          title: 'Pago aprobado',
          body: 'Listo',
          action_url: '/app/payments/p',
          read_at: null,
          created_at: '2026-07-27T00:00:00Z',
        }}
        onRead={() => undefined}
        onArchive={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    expect(html).toContain('Archivar');
    expect(html).toContain('Ver detalle');
  });
});
