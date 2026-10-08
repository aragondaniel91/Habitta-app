type PaymentRow = Record<string, unknown>;

type ActorName = { user_id: string; full_name: string };
const paymentActorFields = [
  'submitted_by_user_id',
  'reviewed_by',
  'approved_by',
  'rejected_by',
  'reversed_by',
];

/** Adds only names of users already recorded as actors on payments visible to the caller. */
export async function attachPaymentActorNames(
  condominiumId: string,
  payments: PaymentRow[],
  rpc: (name: string, payload: Record<string, unknown>) => Promise<Response>,
) {
  const paymentIds = payments.flatMap((payment) =>
    typeof payment.id === 'string' ? [payment.id] : [],
  );
  if (
    !paymentIds.length ||
    !payments.some((payment) =>
      paymentActorFields.some((field) => typeof payment[field] === 'string'),
    )
  ) {
    return payments;
  }

  const response = await rpc('list_payment_actor_names', {
    target_condominium: condominiumId,
    target_payment_ids: paymentIds,
  });
  if (!response.ok) return payments;

  const rows = (await response.json()) as ActorName[];
  const names = Object.fromEntries(
    rows.flatMap((row) =>
      typeof row.user_id === 'string' && typeof row.full_name === 'string' && row.full_name.trim()
        ? [[row.user_id, row.full_name.trim()]]
        : [],
    ),
  );
  if (!Object.keys(names).length) return payments;
  return payments.map((payment) => ({ ...payment, actor_names: names }));
}
