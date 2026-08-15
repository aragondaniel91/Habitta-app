begin;

select plan(14);

select has_table('public', 'integration_outbox', 'integration outbox table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.integration_outbox'::regclass),
  'integration outbox has RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.integration_outbox', 'INSERT'),
  'authenticated cannot insert outbox rows directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.emit_integration_outbox_event(uuid,text,text,uuid,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the outbox emitter'
);

create temporary table hab48_ids (id uuid primary key);

insert into hab48_ids (id)
select public.emit_integration_outbox_event(
  null,
  'payment.approved',
  'payment',
  null,
  '{"paymentId":"00000000-0000-0000-0000-000000000001"}'::jsonb,
  'hab48-payment-approved-1',
  '00000000-0000-0000-0000-000000000101'::uuid
);

select is(
  (
    select public.emit_integration_outbox_event(
      null,
      'payment.approved',
      'payment',
      null,
      '{"paymentId":"00000000-0000-0000-0000-000000000001"}'::jsonb,
      'hab48-payment-approved-1',
      '00000000-0000-0000-0000-000000000101'::uuid
    )
  ),
  (select id from hab48_ids),
  'deduplication returns the original durable event id'
);

select is(
  (select count(*)::integer from public.integration_outbox where deduplication_key = 'hab48-payment-approved-1'),
  1,
  'deduplication key creates only one durable row'
);

select is(
  (select id from public.claim_due_integration_outbox(10) limit 1),
  (select id from hab48_ids),
  'scheduler claims the pending event'
);

select is(
  (select status::text from public.integration_outbox where id = (select id from hab48_ids)),
  'claimed',
  'claimed event has claimed status'
);

select ok(
  public.mark_integration_outbox_queued((select id from hab48_ids)),
  'scheduler can mark a claimed event queued'
);

select is(
  (select (public.claim_integration_outbox_event((select id from hab48_ids), 'cloudflare-queue')).id),
  (select id from hab48_ids),
  'queue consumer claims the durable event'
);

select is(
  (select (public.claim_integration_outbox_event((select id from hab48_ids), 'cloudflare-queue')).id),
  (select id from hab48_ids),
  'same consumer can safely reclaim processing event after a retry'
);

select ok(
  public.complete_integration_outbox_event((select id from hab48_ids)),
  'consumer completes the event'
);

select ok(
  public.complete_integration_outbox_event((select id from hab48_ids)),
  'completion is idempotent'
);

select is(
  (select (public.claim_integration_outbox_event((select id from hab48_ids), 'cloudflare-queue')).id),
  null::uuid,
  'consumed event cannot be claimed again'
);

select * from finish();
rollback;
