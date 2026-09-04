export type BillingSetupInput = {
  attemptId: string;
  subscriptionId: string;
  condominiumId: string;
  returnUrl: string;
};

export type BillingSetupSession = {
  provider: string;
  providerSetupRef: string;
  providerCustomerRef: string | null;
  expiresAt: string;
  action: {
    kind: 'redirect';
    url: string;
  };
};

export type BillingChargeInput = {
  billingAttemptId: string;
  subscriptionId: string;
  providerCustomerRef: string;
  paymentMethodRef: string;
  amount: number;
  currency: string;
  description: string;
};

export type BillingChargeResult = {
  provider: string;
  providerPaymentRef: string;
  status: 'processing' | 'succeeded' | 'failed';
  errorCode?: string;
};

export type NormalizedBillingProviderEvent = {
  provider: string;
  eventId: string;
  eventType:
    | 'payment_method_ready'
    | 'payment_method_removed'
    | 'setup_failed'
    | 'charge_succeeded'
    | 'charge_failed';
  subscriptionId: string | null;
  providerSetupRef: string | null;
  providerCustomerRef: string | null;
  paymentMethodRef: string | null;
  providerPaymentRef: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: string;
};

export interface BillingProviderAdapter {
  readonly name: string;
  createPaymentMethodSetup(input: BillingSetupInput): Promise<BillingSetupSession>;
  chargeSavedPaymentMethod(input: BillingChargeInput): Promise<BillingChargeResult>;
  verifyAndNormalizeWebhook(request: Request): Promise<NormalizedBillingProviderEvent>;
}

export class BillingProviderUnavailableError extends Error {
  constructor(message = 'Billing provider is not configured.') {
    super(message);
    this.name = 'BillingProviderUnavailableError';
  }
}

export class BillingProviderVerificationError extends Error {
  constructor(message = 'Billing provider webhook verification failed.') {
    super(message);
    this.name = 'BillingProviderVerificationError';
  }
}

export class BillingProviderIgnoredEventError extends Error {
  constructor(message = 'Billing provider event is not used by Habitta.') {
    super(message);
    this.name = 'BillingProviderIgnoredEventError';
  }
}

export class BillingProviderRequestError extends Error {
  constructor(message = 'Billing provider request failed.') {
    super(message);
    this.name = 'BillingProviderRequestError';
  }
}
