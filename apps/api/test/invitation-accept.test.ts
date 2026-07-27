import { describe, expect, it } from 'vitest';
import app from '../src/index';

describe('invitation acceptance', () => {
  it('sends only raw_token to the acceptance RPC', async () => {
    const calls: Request[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      calls.push(new Request(input, init));
      return new Response('{}', { status: 200 });
    };
    await app.request(
      '/v1/invitations/token-123/accept',
      { method: 'POST', headers: { Authorization: 'Bearer jwt' } },
      { SUPABASE_URL: 'http://localhost', SUPABASE_ANON_KEY: 'anon' },
    );
    globalThis.fetch = original;
    const rpc = calls.find((call) => call.url.includes('accept_invitation'))!;
    expect(await rpc.json()).toEqual({ raw_token: 'token-123' });
  });
});
