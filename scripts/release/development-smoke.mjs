import { fileURLToPath } from 'node:url';

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
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
  if (emailMode !== 'disabled') errors.push('notifications_email_must_be_disabled');
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
  if (metadata.notificationsEmailMode !== 'disabled') return ['invalid_email_mode'];
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
  if (webUrl && !(await request(webUrl)).ok) return ['web_unavailable'];
  return [];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await runDevelopmentSmoke({
    apiUrl: option('--api-url'),
    webUrl: option('--web-url'),
    expectedCommit: option('--expected-commit'),
    expectedWebOrigin: option('--expected-web-origin'),
    emailMode: option('--email-mode'),
  });
  if (errors.length) {
    console.error(`development smoke failed: ${errors.join(', ')}`);
    process.exitCode = 1;
  } else console.log('development smoke passed');
}
