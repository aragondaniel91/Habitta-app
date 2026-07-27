import { notificationTemplates, type NotificationTemplateKey } from './templates';
import type { RenderedEmail } from './types';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const plain = (value: unknown) => (typeof value === 'string' ? value : '');

export const internalActionUrl = (baseUrl: string, actionUrl: unknown) => {
  const path = plain(actionUrl);
  if (!path.startsWith('/app/') || path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path))
    throw new Error('invalid_action_url');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('invalid_app_base_url');
  return `${base.origin}${path}`;
};

export const renderNotificationEmail = (
  templateKey: string,
  payload: Record<string, unknown>,
  baseUrl: string,
): RenderedEmail => {
  const template = notificationTemplates[templateKey as NotificationTemplateKey];
  if (!template) throw new Error('invalid_template');
  const action = internalActionUrl(baseUrl, payload.action_url);
  const details = [
    plain(payload.condominium_name),
    plain(payload.unit_code) && `Unidad ${plain(payload.unit_code)}`,
    plain(payload.payer_name),
    plain(payload.description),
    plain(payload.reason),
    plain(payload.amount) && `${plain(payload.currency_code)} ${plain(payload.amount)}`,
  ].filter(Boolean);
  const textDetails = details.join(' · ');
  const escapedDetails = escapeHtml(textDetails);
  const escapedAction = escapeHtml(action);
  const subject = `${template.subject} | Habitta`;
  const text = `${template.intro}${textDetails ? `\n${textDetails}` : ''}\nVer en Habitta: ${action}`;
  const html = `<main style="font-family:Poppins,Arial,sans-serif;color:#333D4B"><h1 style="color:#0D1B2A">${escapeHtml(template.subject)}</h1><p>${escapeHtml(template.intro)}</p>${escapedDetails ? `<p>${escapedDetails}</p>` : ''}<p><a href="${escapedAction}" style="background:#1B4F72;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Ver en Habitta</a></p></main>`;
  return { subject, html, text };
};
