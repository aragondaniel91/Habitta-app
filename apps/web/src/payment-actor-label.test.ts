import { describe, expect, it } from 'vitest';
import { paymentActorLabel, type Payment } from './features/payments/types';

const payment = { actor_names: { 'other-user': 'Carlos Revisor' } } as Pick<Payment, 'actor_names'>;

describe('payment actor labels', () => {
  it('uses the authenticated user full name for the current payment actor', () => {
    expect(
      paymentActorLabel('current-user', payment, {
        id: 'current-user',
        user_metadata: { full_name: 'Ana Contadora' },
      }),
    ).toBe('Ana Contadora');
  });

  it('uses the authorized payment actor name for another user', () => {
    expect(paymentActorLabel('other-user', payment, { id: 'current-user' })).toBe('Carlos Revisor');
  });

  it('never falls back to generic actor labels', () => {
    expect(paymentActorLabel('unknown-user', payment, { id: 'current-user' })).toBe(
      'Nombre no disponible',
    );
  });
});
