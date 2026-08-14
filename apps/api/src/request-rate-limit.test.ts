import { describe, expect, it } from 'vitest';
import { requestRateLimitScope } from './request-rate-limit';

const request = (method: string, path: string, headers: Record<string, string> = {}) =>
  new Request(`https://api.habitta.test${path}`, { method, headers });

describe('requestRateLimitScope', () => {
  it('limits organization signup by caller IP', async () => {
    await expect(
      requestRateLimitScope(
        request('POST', '/v1/organizations', { 'CF-Connecting-IP': '203.0.113.10' }),
      ),
    ).resolves.toEqual({
      kind: 'organization-signup',
      key: 'organization-signup:203.0.113.10',
    });
  });

  it('does not rate-limit read-only financial requests', async () => {
    await expect(
      requestRateLimitScope(
        request('GET', '/v1/condominiums/11111111-1111-1111-1111-111111111111/payments'),
      ),
    ).resolves.toBeNull();
  });

  it('isolates financial write keys by condominium and bearer without exposing the token', async () => {
    const first = await requestRateLimitScope(
      request('POST', '/v1/condominiums/11111111-1111-1111-1111-111111111111/payments', {
        Authorization: 'Bearer secret-token-a',
      }),
    );
    const secondActor = await requestRateLimitScope(
      request('POST', '/v1/condominiums/11111111-1111-1111-1111-111111111111/payments', {
        Authorization: 'Bearer secret-token-b',
      }),
    );
    const secondCondo = await requestRateLimitScope(
      request('POST', '/v1/condominiums/22222222-2222-2222-2222-222222222222/payments', {
        Authorization: 'Bearer secret-token-a',
      }),
    );

    expect(first?.kind).toBe('financial-write');
    expect(first?.key).not.toContain('secret-token-a');
    expect(secondActor?.key).not.toBe(first?.key);
    expect(secondCondo?.key).not.toBe(first?.key);
  });

  it('covers expense and treasury writes but leaves unrelated writes alone', async () => {
    const condo = '11111111-1111-1111-1111-111111111111';
    await expect(
      requestRateLimitScope(request('PATCH', `/v1/condominiums/${condo}/expenses/expense-id`)),
    ).resolves.toMatchObject({ kind: 'financial-write' });
    await expect(
      requestRateLimitScope(request('POST', `/v1/condominiums/${condo}/treasury/transfers`)),
    ).resolves.toMatchObject({ kind: 'financial-write' });
    await expect(
      requestRateLimitScope(request('POST', `/v1/condominiums/${condo}/people`)),
    ).resolves.toBeNull();
  });
});
