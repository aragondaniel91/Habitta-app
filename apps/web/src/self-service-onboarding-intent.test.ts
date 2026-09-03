import { describe, expect, it } from 'vitest';
import {
  clearSelfServiceIdempotencyKey,
  getOrCreateSelfServiceIdempotencyKey,
  parseSelfServiceTrialIntent,
  selfServiceAuthMetadata,
  selfServiceTrialIntentFromMetadata,
} from './lib/selfServiceOnboarding';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('HAB-468 self-service onboarding intent', () => {
  it('accepts only explicit Esencial/Comunidad signup intent and approved billing periods', () => {
    expect(parseSelfServiceTrialIntent('?signup=1&plan=esencial&period=monthly')).toEqual({
      planCode: 'esencial',
      billingPeriod: 'monthly',
    });
    expect(parseSelfServiceTrialIntent('?signup=1&plan=comunidad&period=annual')).toEqual({
      planCode: 'comunidad',
      billingPeriod: 'annual',
    });
    expect(parseSelfServiceTrialIntent('?signup=1&plan=pro&period=monthly')).toBeNull();
    expect(parseSelfServiceTrialIntent('?plan=esencial&period=monthly')).toBeNull();
    expect(parseSelfServiceTrialIntent('?signup=1&plan=esencial&period=weekly')).toBeNull();
  });

  it('round-trips the non-authoritative plan intent through Auth user metadata', () => {
    const intent = { planCode: 'comunidad', billingPeriod: 'annual' } as const;
    expect(selfServiceTrialIntentFromMetadata(selfServiceAuthMetadata(intent))).toEqual(intent);
    expect(
      selfServiceTrialIntentFromMetadata({
        habitta_plan_intent: 'pro',
        habitta_billing_period_intent: 'monthly',
      }),
    ).toBeNull();
  });

  it('reuses one UUID across retries and rotates it only after success clears the attempt', () => {
    const storage = new MemoryStorage();
    const intent = { planCode: 'esencial', billingPeriod: 'monthly' } as const;
    const firstUuid = '46800000-0000-4000-8000-000000000001';
    const secondUuid = '46800000-0000-4000-8000-000000000002';
    let calls = 0;
    const createUuid = () => {
      calls += 1;
      return calls === 1 ? firstUuid : secondUuid;
    };

    expect(getOrCreateSelfServiceIdempotencyKey(storage, 'user-a', intent, createUuid)).toBe(
      firstUuid,
    );
    expect(getOrCreateSelfServiceIdempotencyKey(storage, 'user-a', intent, createUuid)).toBe(
      firstUuid,
    );
    expect(calls).toBe(1);

    clearSelfServiceIdempotencyKey(storage, 'user-a', intent);
    expect(getOrCreateSelfServiceIdempotencyKey(storage, 'user-a', intent, createUuid)).toBe(
      secondUuid,
    );
    expect(calls).toBe(2);
  });

  it('does not mint another UUID when plan or billing intent changes during a retry', () => {
    const storage = new MemoryStorage();
    const firstUuid = '46800000-0000-4000-8000-000000000011';
    let calls = 0;
    const createUuid = () => {
      calls += 1;
      return firstUuid;
    };

    const first = getOrCreateSelfServiceIdempotencyKey(
      storage,
      'user-b',
      { planCode: 'esencial', billingPeriod: 'monthly' },
      createUuid,
    );
    const second = getOrCreateSelfServiceIdempotencyKey(
      storage,
      'user-b',
      { planCode: 'comunidad', billingPeriod: 'annual' },
      createUuid,
    );

    expect(first).toBe(firstUuid);
    expect(second).toBe(firstUuid);
    expect(calls).toBe(1);
  });
});
