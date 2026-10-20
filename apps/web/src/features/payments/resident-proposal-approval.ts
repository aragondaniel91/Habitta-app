import { isPositiveMoneyAmount, moneyExceeds, moneyValueString } from './allocation-amounts';
import type { AllocationInput, PaymentAllocationIntent, Receivable } from './types';

export type ResidentProposalResolution =
  | { kind: 'legacy-manual' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'resident-proposal'; allocations: AllocationInput[] };

export function resolveResidentProposal({
  intent,
  paymentAmount,
  paymentCurrency,
  paymentId,
  receivables,
}: {
  intent: PaymentAllocationIntent | null;
  paymentAmount: string;
  paymentCurrency: string;
  paymentId: string;
  receivables: Receivable[];
}): ResidentProposalResolution {
  if (intent === null) return { kind: 'legacy-manual' };
  if (
    intent.payment_id !== paymentId ||
    !Array.isArray(intent.proposals) ||
    intent.proposals.length === 0
  ) {
    return {
      kind: 'invalid',
      reason: 'La propuesta del residente no está disponible o no corresponde a este pago.',
    };
  }
  const byId = new Map(receivables.map((charge) => [charge.id, charge]));
  const used = new Set<string>();
  const allocations: AllocationInput[] = [];
  let cents = 0n;
  for (const proposal of intent.proposals) {
    const charge = byId.get(proposal.receivable_item_id);
    if (!charge || used.has(proposal.receivable_item_id)) {
      return {
        kind: 'invalid',
        reason:
          'Una cuota propuesta ya no está disponible o aparece duplicada. Solicita corrección.',
      };
    }
    used.add(proposal.receivable_item_id);
    const proposedPaymentAmount = moneyValueString(proposal.payment_amount);
    const proposedReceivableAmount = moneyValueString(proposal.receivable_amount);
    const outstanding = moneyValueString(charge.outstanding_amount);
    if (
      proposal.payment_currency_code !== paymentCurrency ||
      proposal.receivable_currency_code !== paymentCurrency ||
      charge.currency_code !== paymentCurrency ||
      !isPositiveMoneyAmount(proposedPaymentAmount) ||
      !isPositiveMoneyAmount(proposedReceivableAmount) ||
      moneyExceeds(proposedPaymentAmount, proposedReceivableAmount) ||
      moneyExceeds(proposedReceivableAmount, proposedPaymentAmount)
    ) {
      return {
        kind: 'invalid',
        reason: 'La moneda o los importes de la propuesta no coinciden. Solicita corrección.',
      };
    }
    if (
      !isPositiveMoneyAmount(outstanding) ||
      moneyExceeds(proposedReceivableAmount, outstanding)
    ) {
      return {
        kind: 'invalid',
        reason: 'El saldo de una cuota cambió o ya fue pagada. Solicita una propuesta actualizada.',
      };
    }
    const [whole, fraction = ''] = proposedPaymentAmount.split('.');
    cents += BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'));
    allocations.push({
      receivableItemId: proposal.receivable_item_id,
      paymentAmount: proposedPaymentAmount,
      receivableAmount: proposedReceivableAmount,
      paymentCurrencyCode: paymentCurrency,
      receivableCurrencyCode: paymentCurrency,
      receivablePerPaymentRate: '1',
    });
  }
  const registeredAmount = moneyValueString(paymentAmount);
  if (!isPositiveMoneyAmount(registeredAmount)) {
    return { kind: 'invalid', reason: 'El importe del pago no es válido. Solicita corrección.' };
  }
  const [whole, fraction = ''] = registeredAmount.split('.');
  const paidCents = BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > paidCents) {
    return {
      kind: 'invalid',
      reason: 'La propuesta supera el monto del pago registrado. Solicita corrección.',
    };
  }
  return { kind: 'resident-proposal', allocations };
}
