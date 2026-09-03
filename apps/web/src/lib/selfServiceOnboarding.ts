export const SELF_SERVICE_PLAN_CODES = ['esencial', 'comunidad'] as const;
export const SELF_SERVICE_BILLING_PERIODS = ['monthly', 'annual'] as const;

export type SelfServicePlanCode = (typeof SELF_SERVICE_PLAN_CODES)[number];
export type SelfServiceBillingPeriod = (typeof SELF_SERVICE_BILLING_PERIODS)[number];

export type SelfServiceTrialIntent = {
  planCode: SelfServicePlanCode;
  billingPeriod: SelfServiceBillingPeriod;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type UserMetadata = Record<string, unknown> | null | undefined;

type StoredIdempotency = {
  planCode: SelfServicePlanCode;
  billingPeriod: SelfServiceBillingPeriod;
  key: string;
};

const PLAN_METADATA_KEY = 'habitta_plan_intent';
const BILLING_METADATA_KEY = 'habitta_billing_period_intent';
const STORAGE_PREFIX = 'habitta:self-service-trial:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memoryIdempotency = new Map<string, StoredIdempotency>();

function isPlanCode(value: unknown): value is SelfServicePlanCode {
  return (
    typeof value === 'string' && SELF_SERVICE_PLAN_CODES.includes(value as SelfServicePlanCode)
  );
}

function isBillingPeriod(value: unknown): value is SelfServiceBillingPeriod {
  return (
    typeof value === 'string' &&
    SELF_SERVICE_BILLING_PERIODS.includes(value as SelfServiceBillingPeriod)
  );
}

function intentFromValues(
  planCode: unknown,
  billingPeriod: unknown,
): SelfServiceTrialIntent | null {
  if (!isPlanCode(planCode) || !isBillingPeriod(billingPeriod)) return null;
  return { planCode, billingPeriod };
}

export function parseSelfServiceTrialIntent(search: string): SelfServiceTrialIntent | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.get('signup') !== '1') return null;
  return intentFromValues(params.get('plan'), params.get('period'));
}

export function selfServiceTrialIntentFromMetadata(
  metadata: UserMetadata,
): SelfServiceTrialIntent | null {
  if (!metadata) return null;
  return intentFromValues(metadata[PLAN_METADATA_KEY], metadata[BILLING_METADATA_KEY]);
}

export function selfServiceAuthMetadata(intent: SelfServiceTrialIntent | null) {
  if (!intent) return {};
  return {
    [PLAN_METADATA_KEY]: intent.planCode,
    [BILLING_METADATA_KEY]: intent.billingPeriod,
  };
}

export function selfServicePlanLabel(planCode: SelfServicePlanCode) {
  return planCode === 'esencial' ? 'Habitta Esencial' : 'Habitta Comunidad';
}

export function selfServiceBillingPeriodLabel(period: SelfServiceBillingPeriod) {
  return period === 'annual' ? 'anual' : 'mensual';
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readStored(storage: StorageLike | null, key: string): StoredIdempotency | null {
  const memory = memoryIdempotency.get(key);
  if (memory) return memory;
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIdempotency>;
    if (
      !isPlanCode(parsed.planCode) ||
      !isBillingPeriod(parsed.billingPeriod) ||
      typeof parsed.key !== 'string' ||
      !UUID_PATTERN.test(parsed.key)
    ) {
      return null;
    }
    const valid = parsed as StoredIdempotency;
    memoryIdempotency.set(key, valid);
    return valid;
  } catch {
    return null;
  }
}

function writeStored(storage: StorageLike | null, key: string, value: StoredIdempotency) {
  memoryIdempotency.set(key, value);
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory copy still keeps retries stable for this page session.
  }
}

export function browserSelfServiceStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getOrCreateSelfServiceIdempotencyKey(
  storage: StorageLike | null,
  userId: string,
  intent: SelfServiceTrialIntent,
  createUuid: () => string = () => crypto.randomUUID(),
) {
  const key = storageKey(userId);
  const existing = readStored(storage, key);

  // Once an onboarding attempt has a UUID, keep that same UUID until the authoritative RPC
  // confirms success. Reusing the same key after any payload change lets Postgres detect the
  // fingerprint conflict instead of silently opening a second provisioning attempt.
  if (existing) return existing.key;

  const generated = createUuid();
  if (!UUID_PATTERN.test(generated))
    throw new Error('No se pudo preparar un identificador seguro.');
  writeStored(storage, key, { ...intent, key: generated });
  return generated;
}

export function clearSelfServiceIdempotencyKey(
  storage: StorageLike | null,
  userId: string,
  _intent: SelfServiceTrialIntent,
) {
  const key = storageKey(userId);
  memoryIdempotency.delete(key);
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing else is required after a successful authoritative RPC response.
  }
}
