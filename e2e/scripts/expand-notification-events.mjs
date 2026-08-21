const supabaseUrl = process.env.E2E_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const fail = (message) => {
  throw new Error(`Financial notification expansion refused: ${message}`);
};

if (!supabaseUrl || !serviceRoleKey) fail('local Supabase URL and service-role key are required');

const target = new URL(supabaseUrl);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '54321') {
  fail(`only local Supabase at localhost:54321 is allowed, received ${target.host}`);
}

const rpc = async (name, payload) => {
  const response = await fetch(`${target.origin}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) fail(`${name} returned ${response.status}: ${await response.text()}`);
  return response.json();
};

const events = await rpc('claim_notification_events', { limit_count: 50 });
for (const event of events) await rpc('process_notification_event', { target: event.id });

console.log(`expanded ${events.length} local notification event(s)`);
