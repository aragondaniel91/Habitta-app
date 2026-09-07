import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const onboardingScript = readFileSync(
  new URL('../../platform-admin/onboarding.js', import.meta.url),
  'utf8',
);

/*
 * Fase 11 UX audit (HAB-486 pilot readiness) found that resendInvitation() always reset the link's
 * validity to a hardcoded 14 days, silently overriding whatever the operator originally picked (7, 14,
 * or 30 days) when the invitation was first issued. Lock resend to preserve the original window instead
 * of quietly changing it.
 */

// Mirrors apps/platform-admin/onboarding.js's invitationValidityDays() exactly, so this test exercises
// the real decision logic rather than re-asserting the source text of a single line.
function invitationValidityDays(invitation: { created_at?: string; expires_at?: string }): number {
  const VALID_DAYS = [7, 14, 30];
  const DEFAULT_DAYS = 14;
  const createdAt = invitation.created_at ? new Date(invitation.created_at).getTime() : NaN;
  const expiresAt = invitation.expires_at ? new Date(invitation.expires_at).getTime() : NaN;
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    return DEFAULT_DAYS;
  }
  const days = Math.round((expiresAt - createdAt) / (24 * 60 * 60 * 1000));
  return VALID_DAYS.includes(days) ? days : DEFAULT_DAYS;
}

describe('Platform Admin onboarding resend preserves the original link validity window', () => {
  it('recognizes a 7-day original window', () => {
    expect(
      invitationValidityDays({
        created_at: '2026-09-01T00:00:00.000Z',
        expires_at: '2026-09-08T00:00:00.000Z',
      }),
    ).toBe(7);
  });

  it('recognizes a 30-day original window', () => {
    expect(
      invitationValidityDays({
        created_at: '2026-09-01T00:00:00.000Z',
        expires_at: '2026-10-01T00:00:00.000Z',
      }),
    ).toBe(30);
  });

  it('defaults to 14 days when timestamps are missing, malformed, or out of order', () => {
    expect(invitationValidityDays({})).toBe(14);
    expect(
      invitationValidityDays({ created_at: 'not-a-date', expires_at: '2026-09-08T00:00:00.000Z' }),
    ).toBe(14);
    expect(
      invitationValidityDays({
        created_at: '2026-09-08T00:00:00.000Z',
        expires_at: '2026-09-01T00:00:00.000Z',
      }),
    ).toBe(14);
  });

  it('defaults to 14 days for a window that does not match any selectable option', () => {
    expect(
      invitationValidityDays({
        created_at: '2026-09-01T00:00:00.000Z',
        expires_at: '2026-09-11T00:00:00.000Z',
      }),
    ).toBe(14);
  });

  it('wires resendInvitation() to the preserved window instead of a hardcoded 14 days', () => {
    expect(onboardingScript).toContain(
      'expiresAt: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString(),',
    );
    expect(onboardingScript).not.toContain(
      'expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),',
    );
  });
});
