import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const onboardingScript = readFileSync(
  new URL('../../platform-admin/onboarding.js', import.meta.url),
  'utf8',
);

/*
 * Fase 11 UX audit (HAB-486 pilot readiness) found that blockerCode()/nextStep() kept a
 * "deployment-safety fallback" that infers a plausible blocker/next-action from client-derived state
 * whenever Postgres doesn't send an authoritative blocker_code/next_action_code. That inference made
 * sense during the brief HAB-486 rollout window, but the migration has been live in production since
 * PR #487 — today the fallback is dead code that would, if the authoritative RPC ever stopped
 * populating those fields (a bug, an RLS change, a rollback), silently show the operator a
 * plausible-looking guess instead of flagging that the state is unverified. Lock the queue to explicit
 * "not verified" behavior so a real regression is visible instead of indistinguishable from normal
 * operation.
 */

describe('Platform Admin onboarding queue never infers blocker/next-action state', () => {
  it('falls back to an explicit not-verified blocker code instead of guessing from client state', () => {
    expect(onboardingScript).toContain("return invitation.blocker_code || 'not_verified';");
    expect(onboardingScript).toContain("not_verified: 'Estado no verificado'");
    expect(onboardingScript).toContain("value === 'not_verified'");
  });

  it('falls back to an explicit not-verified next step instead of guessing from client state', () => {
    expect(onboardingScript).toContain("return coded ?? 'Estado no verificado';");
    expect(onboardingScript).not.toContain('Deployment-safety fallback');
    expect(onboardingScript).not.toContain("return 'Customer 360 disponible';");
    expect(onboardingScript).not.toContain(
      "state === 'pending' && invitation.delivery_status === 'failed') return 'Reenviar invitación';",
    );
    expect(onboardingScript).not.toContain("return 'Emitir una invitación nueva';");
  });

  it('no longer derives blocker/next-action fallbacks from effectiveState()', () => {
    const blockerCodeBody = onboardingScript.slice(
      onboardingScript.indexOf('function blockerCode('),
      onboardingScript.indexOf('function blockerLabel('),
    );
    const nextStepBody = onboardingScript.slice(
      onboardingScript.indexOf('function nextStep('),
      onboardingScript.indexOf('function searchable('),
    );
    expect(blockerCodeBody).not.toContain('effectiveState');
    expect(nextStepBody).not.toContain('effectiveState');
  });
});

