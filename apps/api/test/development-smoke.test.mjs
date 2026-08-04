import { describe, expect, it } from 'vitest';
import {
  runDevelopmentSmoke,
  validateSmokeOptions,
} from '../../../scripts/release/development-smoke.mjs';

const baseOptions = {
  apiUrl: 'https://habitta-api-dev.example.workers.dev',
  expectedCommit: 'abc123',
  expectedWebOrigin: 'https://development.habitta-web-dev.pages.dev',
};

describe('development smoke email mode validation', () => {
  it('accepts disabled and sandbox but rejects live', () => {
    expect(validateSmokeOptions({ ...baseOptions, emailMode: 'disabled' })).toEqual([]);
    expect(validateSmokeOptions({ ...baseOptions, emailMode: 'sandbox' })).toEqual([]);
    expect(validateSmokeOptions({ ...baseOptions, emailMode: 'live' })).toContain(
      'notifications_email_mode_not_safe_for_development',
    );
  });

  it('passes when Worker health reports the requested sandbox mode', async () => {
    const request = async (input, init = {}) => {
      const url = String(input);
      const corsHeaders = {
        'Access-Control-Allow-Origin': baseOptions.expectedWebOrigin,
        'Content-Type': 'application/json',
      };

      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            status: 'ok',
            environment: 'development',
            commit: baseOptions.expectedCommit,
            version: '0.0.0',
            buildTimestamp: '2026-08-04T13:02:07Z',
            notificationsEmailMode: 'sandbox',
          }),
          { status: 200, headers: corsHeaders },
        );
      }
      if (url.endsWith('/not-a-route')) return new Response('{}', { status: 404 });
      if (url.endsWith('/v1/organizations') && init.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: corsHeaders });
      if (url.endsWith('/v1/organizations')) return new Response('{}', { status: 401 });

      throw new Error(`Unexpected request: ${url}`);
    };

    await expect(
      runDevelopmentSmoke({ ...baseOptions, emailMode: 'sandbox', request }),
    ).resolves.toEqual([]);
  });

  it('fails when the deployed Worker mode differs from the requested mode', async () => {
    const request = async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          environment: 'development',
          commit: baseOptions.expectedCommit,
          version: '0.0.0',
          buildTimestamp: '2026-08-04T13:02:07Z',
          notificationsEmailMode: 'disabled',
        }),
        {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': baseOptions.expectedWebOrigin,
            'Content-Type': 'application/json',
          },
        },
      );

    await expect(
      runDevelopmentSmoke({ ...baseOptions, emailMode: 'sandbox', request }),
    ).resolves.toEqual(['invalid_email_mode']);
  });
});
