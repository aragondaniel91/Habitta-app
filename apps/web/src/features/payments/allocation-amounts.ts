const POW10 = Array.from({ length: 13 }, (_, index) => 10n ** BigInt(index));

function scaledInteger(value: string, scale: number): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d*)?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > scale) return null;
  const padded = fraction.padEnd(scale, '0');
  return BigInt(whole) * POW10[scale]! + BigInt(padded || '0');
}

function formatCents(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

/**
 * Mirrors Postgres `round(payment_amount * receivable_per_payment_rate, 2)` for positive values
 * without routing financial arithmetic through binary floating point.
 *
 * The payment amount is limited to two decimals by the payment domain. FX rates may carry up to
 * ten decimals. The return value is always a two-decimal receivable amount suitable for the
 * existing preview/approval RPC contract.
 */
export function deriveReceivableAmount(paymentAmount: string, rate: string): string {
  const paymentCents = scaledInteger(paymentAmount, 2);
  const rateScaled = scaledInteger(rate, 10);
  if (paymentCents === null || rateScaled === null || paymentCents <= 0n || rateScaled <= 0n) {
    return '';
  }

  // cents (10^2) × rate (10^10) => receivable value at 10^12. To get receivable cents, divide
  // by 10^10 and round half-up. Payment/rate values are positive, matching the backend contract.
  const divisor = POW10[10]!;
  const product = paymentCents * rateScaled;
  const quotient = product / divisor;
  const remainder = product % divisor;
  const roundedCents = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  return formatCents(roundedCents);
}

export function allocationReceivableAmount({
  paymentAmount,
  paymentCurrency,
  receivableCurrency,
  rate,
}: {
  paymentAmount: string;
  paymentCurrency: string;
  receivableCurrency: string;
  rate?: string;
}): string {
  if (paymentCurrency === receivableCurrency) return paymentAmount;
  return deriveReceivableAmount(paymentAmount, rate ?? '');
}
