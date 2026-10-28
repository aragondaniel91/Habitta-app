// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  consumeDeepLinkParams,
  paymentsDeepLinkSearch,
  readPaymentsDeepLink,
  readReceivablesDeepLink,
  receivablesDeepLinkSearch,
} from './dashboard-deep-links';

const unit = '33333333-3333-4333-8333-333333333331';

describe('Dashboard KPI deep links', () => {
  it('encodes and decodes a payments filter round trip', () => {
    const search = paymentsDeepLinkSearch({ status: 'submitted', currencyCode: 'USD' });
    expect(search).toBe('status=submitted&currency=USD');
    expect(readPaymentsDeepLink('?' + search)).toEqual({
      status: 'submitted',
      currencyCode: 'USD',
    });
  });

  it('encodes and decodes a receivables filter round trip, including a unit hint', () => {
    const search = receivablesDeepLinkSearch({ currencyCode: 'VES', due: 'overdue', unitId: unit });
    expect(search).toBe(`currency=VES&due=overdue&unit=${unit}`);
    expect(readReceivablesDeepLink('?' + search)).toEqual({
      status: undefined,
      currencyCode: 'VES',
      due: 'overdue',
      unitId: unit,
    });
  });

  it('omits unknown or invalid values instead of passing them through', () => {
    expect(paymentsDeepLinkSearch({ status: 'draft' as never, currencyCode: 'usd' })).toBe('');
    expect(receivablesDeepLinkSearch({ due: 'yesterday' as never, unitId: 'not-a-uuid' })).toBe('');
  });

  it('rejects duplicate or malformed query parameters when reading back', () => {
    expect(readPaymentsDeepLink('?status=submitted&status=approved')).toEqual({
      status: undefined,
      currencyCode: undefined,
    });
    expect(readPaymentsDeepLink('?status=draft')).toEqual({
      status: undefined,
      currencyCode: undefined,
    });
    expect(readReceivablesDeepLink('?unit=not-a-uuid')).toEqual({
      status: undefined,
      currencyCode: undefined,
      due: undefined,
      unitId: undefined,
    });
  });

  it('strips only the consumed keys, preserving everything else in the URL', () => {
    window.history.replaceState(
      { checkpoint: 'existing' },
      '',
      '/app/payments?status=submitted&currency=USD&condominium=' + unit + '#panel',
    );
    consumeDeepLinkParams(['status', 'currency']);
    expect(window.location.pathname).toBe('/app/payments');
    expect(window.location.search).toBe('?condominium=' + unit);
    expect(window.location.hash).toBe('#panel');
    expect(window.history.state).toEqual({ checkpoint: 'existing' });

    // A second consumption with nothing left to strip is a no-op, not a history entry.
    const before = window.location.href;
    consumeDeepLinkParams(['status', 'currency']);
    expect(window.location.href).toBe(before);
  });
});
