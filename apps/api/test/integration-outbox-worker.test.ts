import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeIntegrationQueue,
  enqueuePendingIntegrationEvents,
  processIntegrationOutboxMessage,
} from '../src/integrations/worker';
import type { IntegrationBindings } from '../src/integrations/types';

const env = (send = vi.fn()) =>
  ({
    APP_ENV: 'development',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    NOTIFICATION_QUEUE: { send: vi.fn() },
    INTEGRATION_QUEUE: { send },
    NOTIFICATIONS_FROM_EMAIL: 'notifications@habitta.test',
    NOTIFICATIONS_FROM_NAME: 'Habitta',
    APP_BASE_URL: 'https://habitta.test',
  }) as unknown as IntegrationBindings;

afterEach(() => vi.restoreAllMocks());

describe('integration outbox scheduling', () => {
  it('queues only the durable outbox id and marks transport publication afterwards', async () => {
    const send = vi.fn();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('claim_due_integration_outbox')) return Response.json([{ id: 'event-1' }]);
        if (url.includes('mark_integration_outbox_queued')) return Response.json(true);
        throw new Error(url);
      }),
    );

    await enqueuePendingIntegrationEvents(env(send));

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ outboxId: 'event-1' });
    expect(Object.keys(send.mock.calls[0]![0])).toEqual(['outboxId']);
    expect(
      calls.findIndex((url) => url.includes('mark_integration_outbox_queued')),
    ).toBeGreaterThan(calls.findIndex((url) => url.includes('claim_due_integration_outbox')));
  });
});

describe('integration outbox consumption', () => {
  it('completes a claimed event without contacting an external provider', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('claim_integration_outbox_event')) {
        return Response.json({
          id: 'event-1',
          condominium_id: 'condo-1',
          event_type: 'payment.approved',
          aggregate_type: 'payment',
          aggregate_id: 'payment-1',
          payload: { paymentId: 'payment-1' },
          correlation_id: 'request-1',
          attempts: 1,
        });
      }
      if (url.includes('complete_integration_outbox_event')) return Response.json(true);
      throw new Error(`unexpected external request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await processIntegrationOutboxMessage({ outboxId: 'event-1' }, env())).toBe('consumed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an already-consumed duplicate as ignored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(null)),
    );
    expect(await processIntegrationOutboxMessage({ outboxId: 'event-1' }, env())).toBe('ignored');
  });

  it('retries the queue message when the database transport boundary fails', async () => {
    const retry = vi.fn();
    const ack = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('temporary network failure');
      }),
    );

    await consumeIntegrationQueue(
      {
        queue: 'habitta-integrations-dev',
        messages: [
          {
            id: 'message-1',
            timestamp: new Date(),
            attempts: 1,
            body: { outboxId: 'event-1' },
            ack,
            retry,
          },
        ],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      } as unknown as MessageBatch<{ outboxId: string }>,
      env(),
    );

    expect(retry).toHaveBeenCalledOnce();
    expect(ack).not.toHaveBeenCalled();
  });
});
