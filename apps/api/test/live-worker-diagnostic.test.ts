import { describe, expect, it } from 'vitest';

const apiUrl = 'https://habitta-api-dev.aragondaniel91.workers.dev';
const origin = 'https://habitta-web-dev.pages.dev';

describe('temporary live Worker diagnostic', () => {
  it('prints the unauthenticated route status without mutating remote state', async () => {
    const health = await fetch(`${apiUrl}/health`, { headers: { Origin: origin } });
    expect(health.status).toBe(200);

    const response = await fetch(`${apiUrl}/v1/organizations`, {
      headers: { Origin: origin },
      redirect: 'manual',
    });
    const body = await response.text();

    console.log(
      `LIVE_WORKER_AUTH_DIAGNOSTIC status=${response.status} location=${response.headers.get('location') ?? ''} contentType=${response.headers.get('content-type') ?? ''} body=${body.slice(0, 500)}`,
    );

    expect(response.status).toBeGreaterThanOrEqual(100);
  }, 20_000);
});
