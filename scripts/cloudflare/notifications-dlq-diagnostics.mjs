import { fileURLToPath } from 'node:url';

export const dlqDiagnostics = Object.freeze({
  queue: 'habitta-notifications-dlq-dev',
  steps: [
    'Run pnpm notifications:config:check to validate the Queue and DLQ declarations.',
    'Inspect the DLQ in the Cloudflare dashboard using delivery identifiers only.',
    'After fixing the cause, re-inject one message manually as {"deliveryId":"<uuid>"}.',
    'Verify the delivery status through the application, then acknowledge the DLQ message.',
  ],
});

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(dlqDiagnostics, null, 2));
