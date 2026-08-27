import { fileURLToPath } from 'node:url';

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const numberOption = (name, fallback) => {
  const value = Number(option(name));
  return Number.isFinite(value) ? value : fallback;
};
const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const detectsResendCall = (value) =>
  /api\.resend\.com|RESEND_API_KEY/i.test(JSON.stringify(value));
export const validateSmokeOptions = ({
  apiUrl,
  webUrl,
  expectedCommit,
  expectedWebOrigin,
  emailMode,
}) => {
  const errors = [];
  if (!apiUrl || !/^https:\/\//.test(apiUrl) || /localhost|production/.test(apiUrl))
    errors.push('invalid_development_api_url');
  if (webUrl && (!/^https:\/\//.test(webUrl) || /localhost|production/.test(webUrl)))
    errors.push('invalid_development_web_url');
  if (!expectedCommit) errors.push('expected_commit_required');
  if (!expectedWebOrigin || !/^https:\/\//.test(expectedWebOrigin))
    errors.push('expected_web_origin_required');
  if (!['disabled', 'sandbox'].includes(emailMode))
    errors.push('notifications_email_mode_not_safe_for_development');
  return errors;
};
export const runDevelopmentSmoke = async ({
  apiUrl,
  webUrl,
  expectedCommit,
  expectedWebOrigin,
  emailMode,
  request = fetch,
}) => {
  const errors = validateSmokeOptions({
    apiUrl,
    webUrl,
    expectedCommit,
    expectedWebOrigin,
    emailMode,
  });
  if (errors.length) return errors;
  const headers = { Origin: expectedWebOrigin };
  const health = await request(`${apiUrl}/health`, { headers });
  if (!health.ok) return ['health_failed'];
  const metadata = await health.json();
  if (metadata.status !== 'ok' || metadata.environment !== 'development')
    return ['invalid_health_environment'];
  if (metadata.commit !== expectedCommit) return ['commit_mismatch'];
  if (metadata.version === 'unknown' || Number.isNaN(Date.parse(metadata.buildTimestamp ?? '')))
    return ['invalid_build_metadata'];
  if (metadata.notificationsEmailMode !== emailMode) return ['invalid_email_mode'];
  if (detectsResendCall(metadata)) return ['resend_indicator_detected'];
  if (health.headers.get('Access-Control-Allow-Origin') !== expectedWebOrigin)
    return ['cors_origin_invalid'];
  if ((await request(`${apiUrl}/not-a-route`, { headers })).status !== 404)
    return ['unknown_route_not_404'];
  if ((await request(`${apiUrl}/v1/organizations`, { headers })).status !== 401)
    return ['unauthenticated_route_not_401'];
  const preflight = await request(`${apiUrl}/v1/organizations`, {
    method: 'OPTIONS',
    headers: { ...headers, 'Access-Control-Request-Method': 'GET' },
  });
  if (!preflight.ok || preflight.headers.get('Access-Control-Allow-Origin') !== expectedWebOrigin)
    return ['cors_preflight_invalid'];
  if (JSON.stringify({ deliveryId: 'synthetic' }) !== '{"deliveryId":"synthetic"}')
    return ['queue_message_invalid'];
  if (webUrl) {
    const web = await request(webUrl);
    if (!web.ok) {
      /*
       * A domain sitting behind Cloudflare Access answers an unauthenticated request with a
       * challenge, not with the app. Reported as `web_unavailable` it looks like a deployment or
       * DNS problem and sends whoever reads it to check bindings that are perfectly fine -- which
       * is exactly where issue #165 spent its time. Name it for what it is, and do not retry: an
       * access policy will not converge no matter how long the smoke waits.
       */
      const challenged =
        (web.headers.get('WWW-Authenticate') ?? '').includes('Cloudflare-Access') ||
        (web.headers.get('Location') ?? '').includes('cloudflareaccess.com');
      return [challenged ? 'web_behind_access' : 'web_unavailable'];
    }
  }
  return [];
};

export const retryableSmokeErrors = new Set([
  'network_error',
  'health_failed',
  'commit_mismatch',
  'invalid_build_metadata',
  'cors_origin_invalid',
  'unknown_route_not_404',
  'unauthenticated_route_not_401',
  'cors_preflight_invalid',
  'web_unavailable',
]);

export const runDevelopmentSmokeWithRetries = async ({
  attempts = 6,
  retryDelayMs = 5_000,
  sleep = defaultSleep,
  onRetry = () => {},
  ...options
}) => {
  const totalAttempts = Math.max(1, Math.trunc(attempts));
  const delay = Math.max(0, retryDelayMs);
  let errors = [];

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      errors = await runDevelopmentSmoke(options);
    } catch {
      errors = ['network_error'];
    }
    if (!errors.length) return { errors, attempts: attempt };

    const retryable = errors.every((error) => retryableSmokeErrors.has(error));
    if (!retryable || attempt === totalAttempts) return { errors, attempts: attempt };

    onRetry({ attempt, totalAttempts, errors, retryDelayMs: delay });
    await sleep(delay);
  }

  return { errors, attempts: totalAttempts };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runDevelopmentSmokeWithRetries({
    apiUrl: option('--api-url'),
    webUrl: option('--web-url'),
    expectedCommit: option('--expected-commit'),
    expectedWebOrigin: option('--expected-web-origin'),
    emailMode: option('--email-mode'),
    attempts: numberOption('--attempts', 6),
    retryDelayMs: numberOption('--retry-delay-ms', 5_000),
    onRetry: ({ attempt, totalAttempts, errors, retryDelayMs }) =>
      console.warn(
        `development smoke attempt ${attempt}/${totalAttempts} failed: ${errors.join(', ')}; retrying in ${retryDelayMs}ms`,
      ),
  });
  if (result.errors.length) {
    console.error(
      `development smoke failed after ${result.attempts} attempt(s): ${result.errors.join(', ')}`,
    );
    process.exitCode = 1;
  } else console.log(`development smoke passed after ${result.attempts} attempt(s)`);
}
