import { describe, expect, it } from 'vitest';
import { notificationTemplates } from '../src/notifications/templates';
import { internalActionUrl, renderNotificationEmail } from '../src/notifications/renderer';

describe('notification email templates', () => {
  for (const key of Object.keys(notificationTemplates)) {
    it(`renders ${key} as safe HTML and text`, () => {
      const rendered = renderNotificationEmail(
        key,
        { condominium_name: 'Habitta Norte', unit_code: 'A-1', action_url: '/app/condominiums/c' },
        'https://app.habitta.test/root',
      );
      expect(rendered.subject).toContain('Habitta');
      expect(rendered.html).toContain('https://app.habitta.test/app/');
      expect(rendered.text).toContain('Ver en Habitta');
      expect(rendered.html).not.toContain('tracking');
    });
  }
  it('escapes every user-controlled string and omits sensitive fields', () => {
    const rendered = renderNotificationEmail(
      'payment_rejected',
      {
        condominium_name: '<img src=x onerror=1>',
        reason: '<script>alert(1)</script>',
        object_key: 'private/object',
        bank_account: '123',
        action_url: '/app/payments/p',
      },
      'https://habitta.test',
    );
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(`${rendered.html}${rendered.text}`).not.toContain('private/object');
    expect(`${rendered.html}${rendered.text}`).not.toContain('123');
  });
  it('renders announcement details safely with an internal action', () => {
    const rendered = renderNotificationEmail(
      'announcement_published',
      {
        condominium_name: 'Habitta Norte',
        announcement_title: '<script>Aviso urgente</script>',
        announcement_summary: 'Mantenimiento preventivo',
        priority: 'urgent',
        action_url: '/app/announcements',
      },
      'https://habitta.test',
    );
    expect(rendered.html).toContain('&lt;script&gt;Aviso urgente&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain('Mantenimiento preventivo');
    expect(rendered.html).toContain('https://habitta.test/app/announcements');
  });
  it('accepts only internal application actions', () => {
    expect(internalActionUrl('https://habitta.test/path', '/app/payments/p')).toBe(
      'https://habitta.test/app/payments/p',
    );
    expect(() => internalActionUrl('https://habitta.test', 'https://evil.test/app/')).toThrow(
      'invalid_action_url',
    );
    expect(() => internalActionUrl('https://habitta.test', '//evil.test/app/')).toThrow(
      'invalid_action_url',
    );
  });
});
