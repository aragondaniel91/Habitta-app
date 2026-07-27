import { fileURLToPath } from 'node:url';

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
export const validateSmokeOptions = ({ apiUrl, webUrl, expectedCommit, emailMode }) => {
  const errors = [];
  if (!apiUrl || !/^https:\/\//.test(apiUrl) || /localhost|production/.test(apiUrl))
    errors.push('invalid_development_api_url');
  if (webUrl && (!/^https:\/\//.test(webUrl) || /localhost|production/.test(webUrl)))
    errors.push('invalid_development_web_url');
  if (!expectedCommit) errors.push('expected_commit_required');
  if (emailMode !== 'disabled') errors.push('notifications_email_must_be_disabled');
  return errors;
};
export const detectsResendCall = (value) => /api\.resend\.com|resend/i.test(JSON.stringify(value));
export const runDevelopmentSmoke = async ({
  apiUrl,
  webUrl,
  expectedCommit,
  emailMode,
  request = fetch,
}) => {
  const errors = validateSmokeOptions({ apiUrl, webUrl, expectedCommit, emailMode });
  if (errors.length) return errors;
  const health = await request(`${apiUrl}/health`);
  if (!health.ok) return ['health_failed'];
  const metadata = await health.json();
  if (metadata.commit !== expectedCommit) return ['commit_mismatch'];
  if (metadata.environment !== 'development') return ['invalid_health_environment'];
  const unknown = await request(`${apiUrl}/not-a-route`);
  if (unknown.status !== 404) return ['unknown_route_not_404'];
  const protectedRoute = await request(`${apiUrl}/v1/organizations`);
  if (protectedRoute.status !== 401) return ['unauthenticated_route_not_401'];
  if (webUrl && !(await request(webUrl)).ok) return ['web_unavailable'];
  return [];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await runDevelopmentSmoke({
    apiUrl: option('--api-url'),
    webUrl: option('--web-url'),
    expectedCommit: option('--expected-commit'),
    emailMode: option('--email-mode'),
  });
  if (errors.length) {
    console.error(`development smoke failed: ${errors.join(', ')}`);
    process.exitCode = 1;
  } else console.log('development smoke passed');
}
