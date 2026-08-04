import { describe, expect, it } from 'vitest';
import { invitationDeliveryFailureMessage } from './TeamAccessPage';

describe('invitation delivery diagnostics', () => {
  it('explains invalid ZeptoMail authentication without exposing secrets', () => {
    const message = invitationDeliveryFailureMessage({
      status: 'failed',
      recipient: 'sandbox@example.com',
      provider: 'zeptomail',
      mode: 'sandbox',
      errorCode: 'zeptomail_401_TM_401',
      providerId: 'safe-request-reference',
    });

    expect(message).toContain('ZeptoMail rechazó la autenticación');
    expect(message).toContain('zeptomail_401_TM_401');
    expect(message).toContain('safe-request-reference');
    expect(message).not.toContain('sandbox@example.com');
  });

  it('identifies a missing Worker token', () => {
    const message = invitationDeliveryFailureMessage({
      status: 'failed',
      recipient: null,
      provider: 'zeptomail',
      mode: 'sandbox',
      errorCode: 'notifications_zeptomail_token_missing',
    });

    expect(message).toContain('Worker no recibió el Send Mail Token');
  });
});
