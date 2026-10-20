type PaymentRow = Record<string, unknown>;
type AllocationRow = { payment_id: string; receivable_item_id: string };
type ReceivableRow = { id: string; concept_id: string | null };
type ConceptRow = { id: string; name: string };

/** Adds an authorized, singular applied charge concept to a payment read. */
export async function attachPaymentChargeConceptNames(
  condominiumId: string,
  payments: PaymentRow[],
  rest: (path: string) => Promise<Response>,
) {
  const paymentIds = payments.flatMap((payment) =>
    typeof payment.id === 'string' ? [payment.id] : [],
  );
  if (!paymentIds.length || !payments.some((payment) => typeof payment.status === 'string')) {
    return payments;
  }

  const allocationsResponse = await rest(
    `payment_allocations?condominium_id=eq.${condominiumId}&payment_id=in.(${paymentIds.join(',')})&select=payment_id,receivable_item_id`,
  );
  if (!allocationsResponse.ok) return payments;
  const allocations = (await allocationsResponse.json()) as AllocationRow[];
  const receivableIds = [...new Set(allocations.map((row) => row.receivable_item_id))];
  if (!receivableIds.length) return payments;

  const receivablesResponse = await rest(
    `receivable_items?condominium_id=eq.${condominiumId}&id=in.(${receivableIds.join(',')})&select=id,concept_id`,
  );
  if (!receivablesResponse.ok) return payments;
  const receivables = (await receivablesResponse.json()) as ReceivableRow[];
  const conceptsByReceivable = new Map(
    receivables.flatMap((row) => (row.concept_id ? [[row.id, row.concept_id]] : [])),
  );
  const conceptIds = [...new Set(conceptsByReceivable.values())];
  if (!conceptIds.length) return payments;

  const conceptsResponse = await rest(
    `charge_concepts?condominium_id=eq.${condominiumId}&id=in.(${conceptIds.join(',')})&select=id,name`,
  );
  if (!conceptsResponse.ok) return payments;
  const concepts = (await conceptsResponse.json()) as ConceptRow[];
  const namesByConcept = new Map(
    concepts.flatMap((row) => (row.name.trim() ? [[row.id, row.name.trim()]] : [])),
  );
  const namesByPayment = new Map<string, Set<string>>();
  allocations.forEach((allocation) => {
    const conceptId = conceptsByReceivable.get(allocation.receivable_item_id);
    const name = conceptId ? namesByConcept.get(conceptId) : undefined;
    if (!name) return;
    const names = namesByPayment.get(allocation.payment_id) ?? new Set<string>();
    names.add(name);
    namesByPayment.set(allocation.payment_id, names);
  });

  return payments.map((payment) => {
    const names = typeof payment.id === 'string' ? namesByPayment.get(payment.id) : undefined;
    return names?.size === 1 ? { ...payment, charge_concept_name: [...names][0] } : payment;
  });
}
