import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { invitationDeliveryFailureMessage } from './TeamAccessPage';

const pageSourceUrl = new URL('./TeamAccessPage.tsx', import.meta.url);
const teamAccessSourceUrl = new URL('../lib/teamAccess.ts', import.meta.url);

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

describe('team lifecycle controls', () => {
  it('exposes role changes, guarded suspension, reactivation and guarded access removal', async () => {
    const source = await readFile(pageSourceUrl, 'utf8');

    expect(source).toContain("runMemberAction(member, 'change_role')");
    expect(source).toContain("setPendingMemberAction({ member, action: 'suspend' })");
    expect(source).toContain("runMemberAction(member, 'reactivate')");
    expect(source).toContain("setPendingMemberAction({ member, action: 'remove' })");
    expect(source).toContain('<ConfirmDialog');
    expect(source).toContain(
      'runMemberAction(pendingMemberAction.member, pendingMemberAction.action)',
    );
    expect(source).toContain('Su cuenta global y el historial de acciones se conservarán.');
  });

  it('routes all member lifecycle changes through the guarded database RPC', async () => {
    const source = await readFile(teamAccessSourceUrl, 'utf8');

    expect(source).toContain("client.rpc('manage_condominium_team_member'");
    expect(source).toContain("'change_role' | 'suspend' | 'reactivate' | 'remove'");
    expect(source).toContain('Debe permanecer al menos un administrador activo del condominio.');
  });
});
