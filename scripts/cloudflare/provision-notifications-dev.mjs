import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

export const developmentQueues = ['habitta-notifications-dev', 'habitta-notifications-dlq-dev'];

export const buildProvisionPlan = (existingQueues) =>
  developmentQueues
    .filter((queue) => !existingQueues.includes(queue))
    .map((queue) => ({ action: 'create_queue', queue }));

const executeWrangler = (args) => {
  const result = spawnSync('pnpm', ['--filter', '@habitta/api', 'exec', 'wrangler', ...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error('cloudflare_command_failed');
  return result.stdout;
};

export const provisionNotificationsDevelopment = ({
  apply,
  run = executeWrangler,
  existingQueues,
}) => {
  if (!apply) return buildProvisionPlan([]);
  run(['whoami']);
  const queues =
    existingQueues ?? JSON.parse(run(['queues', 'list', '--json'])).map((item) => item.name);
  const plan = buildProvisionPlan(queues);
  for (const step of plan) run(['queues', 'create', step.queue]);
  return plan;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  if (!apply) {
    const plan = provisionNotificationsDevelopment({ apply: false });
    console.log(JSON.stringify({ mode: 'dry-run', plan }, null, 2));
  } else {
    const prompt = createInterface({ input, output });
    const answer = await prompt.question('Type APPLY to create missing development queues: ');
    prompt.close();
    if (answer !== 'APPLY') throw new Error('cloudflare_apply_not_confirmed');
    const plan = provisionNotificationsDevelopment({ apply: true });
    console.log(JSON.stringify({ mode: 'applied', plan }, null, 2));
  }
}
