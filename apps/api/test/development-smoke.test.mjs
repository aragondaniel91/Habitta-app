import { describe, expect, it } from 'vitest';
import {
  retryableSmokeErrors,
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

describe('issue #165: a web domain behind Cloudflare Access', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': baseOptions.expectedWebOrigin,
    'Content-Type': 'application/json',
  };
  const healthyApi = (url, init = {}) => {
    if (url.endsWith('/health'))
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
    if (url.endsWith('/not-a-route')) return new Response('{}', { status: 404 });
    if (url.endsWith('/v1/organizations') && init.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders });
    if (url.endsWith('/v1/organizations')) return new Response('{}', { status: 401 });
    return null;
  };

  it('names the access challenge instead of calling the site unavailable', async () => {
    /*
     * Reported as `web_unavailable` this reads as a deployment or DNS fault and sends whoever
     * investigates to check bindings that are perfectly healthy. That is where issue #165 spent
     * its time: DNS, the Pages attachment and the domain status all checked out, and the real
     * cause -- a Zero Trust policy in front of the domain -- was never in view.
     */
    const request = async (input, init = {}) => {
      const url = String(input);
      return (
        healthyApi(url, init) ??
        new Response(null, {
          status: 302,
          headers: {
            'WWW-Authenticate':
              'Cloudflare-Access resource_metadata="https://preview.test/.well-known/cloudflare-access-protected-resource/"',
          },
        })
      );
    };

    await expect(
      runDevelopmentSmoke({
        ...baseOptions,
        emailMode: 'sandbox',
        webUrl: 'https://preview.test',
        request,
      }),
    ).resolves.toEqual(['web_behind_access']);
  });

  it('still reports a genuinely unreachable site as unavailable', async () => {
    const request = async (input, init = {}) => {
      const url = String(input);
      return healthyApi(url, init) ?? new Response('nope', { status: 502 });
    };

    await expect(
      runDevelopmentSmoke({
        ...baseOptions,
        emailMode: 'sandbox',
        webUrl: 'https://preview.test',
        request,
      }),
    ).resolves.toEqual(['web_unavailable']);
  });

  it('does not retry an access policy, but keeps retrying a flaky site', () => {
    // No amount of waiting converges a Zero Trust policy.
    expect(retryableSmokeErrors.has('web_behind_access')).toBe(false);
    expect(retryableSmokeErrors.has('web_unavailable')).toBe(true);
  });
});
