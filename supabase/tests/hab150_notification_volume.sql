begin;
select plan(7);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
) values (
  'c1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'hab150@test.local',
  'x',
  now(),
  now()
);

insert into public.organizations (id, name, created_by)
values (
  'c1100000-0000-0000-0000-000000000001',
  'HAB-150 Volume Org',
  'c1000000-0000-0000-0000-000000000001'
);

create temporary table hab150_condos(id uuid primary key);
insert into hab150_condos(id)
select gen_random_uuid() from generate_series(1, 6);

insert into public.condominiums(id, organization_id, name, created_by)
select id,
       'c1100000-0000-0000-0000-000000000001',
       'HAB-150 Condo ' || row_number() over (),
       'c1000000-0000-0000-0000-000000000001'
from hab150_condos;

update public.condominium_notification_settings
set email_enabled = true,
    live_email_enabled = true
where condominium_id in (select id from hab150_condos);

select is(
  public.notification_email_uses_volume_window('receivable_overdue'),
  true,
  'bulk due email uses the volume window'
);
select is(
  public.notification_email_uses_volume_window('governance_opened'),
  true,
  'high-fanout governance email uses the volume window'
);
select is(
  public.notification_email_uses_volume_window('payment_approved'),
  false,
  'transactional payment email remains immediately eligible'
);

-- Create one immediate event per condominium, each with eight due deliveries.
-- A scheduler claim must select no more than five from one condominium and no more than 25 total.
do $$
declare
  condo uuid;
  event_id uuid;
  delivery_number integer;
begin
  for condo in select id from hab150_condos loop
    event_id := gen_random_uuid();
    insert into public.notification_events(
      id, condominium_id, event_type, aggregate_type, aggregate_id, payload, deduplication_key
    ) values (
      event_id,
      condo,
      'payment_approved',
      'payment',
      gen_random_uuid(),
      jsonb_build_object('condominium_id', condo),
      'hab150:event:' || event_id::text
    );

    for delivery_number in 1..8 loop
      insert into public.notification_deliveries(
        condominium_id,
        event_id,
        recipient_user_id,
        recipient_email,
        channel,
        template_key,
        payload,
        deduplication_key,
        next_attempt_at
      ) values (
        condo,
        event_id,
        'c1000000-0000-0000-0000-000000000001',
        'hab150@test.local',
        'email',
        'payment_approved',
        '{}'::jsonb,
        'hab150:delivery:' || event_id::text || ':' || delivery_number::text,
        now() - interval '1 minute'
      );
    end loop;
  end loop;
end $$;

select is(
  (select count(*) from public.claim_due_notification_deliveries(100)),
  25::bigint,
  'one scheduler cycle is globally capped at 25 queued emails even when asked for 100'
);

select ok(
  not exists (
    select 1
    from public.notification_deliveries d
    where d.condominium_id in (select id from hab150_condos)
      and d.status = 'queued'
    group by d.condominium_id
    having count(*) > 5
  ),
  'one condominium cannot contribute more than five emails to a scheduler cycle'
);

select ok(
  exists (
    select 1
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    where e.event_type = 'payment_approved'
      and d.status = 'pending'
      and d.next_attempt_at <= now()
  ),
  'unclaimed transactional email stays due for a later cycle instead of being dropped'
);

-- A high-fanout delivery is persisted immediately but its email eligibility moves to the
-- next 15-minute boundary. In-app notification creation is independent of this delivery field.
do $$
declare
  condo uuid;
  event_id uuid := gen_random_uuid();
begin
  select id into condo from hab150_condos order by id limit 1;
  insert into public.notification_events(
    id, condominium_id, event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    event_id,
    condo,
    'receivable_overdue',
    'receivable',
    gen_random_uuid(),
    jsonb_build_object('condominium_id', condo),
    'hab150:window:event:' || event_id::text
  );
  insert into public.notification_deliveries(
    condominium_id,
    event_id,
    recipient_user_id,
    recipient_email,
    channel,
    template_key,
    payload,
    deduplication_key,
    next_attempt_at
  ) values (
    condo,
    event_id,
    'c1000000-0000-0000-0000-000000000001',
    'hab150@test.local',
    'email',
    'receivable_overdue',
    '{}'::jsonb,
    'hab150:window:delivery:' || event_id::text,
    now()
  );
end $$;

select ok(
  exists (
    select 1
    from public.notification_deliveries d
    join public.notification_events e on e.id = d.event_id
    where e.event_type = 'receivable_overdue'
      and d.deduplication_key like 'hab150:window:delivery:%'
      and d.status = 'pending'
      and d.next_attempt_at > now()
  ),
  'high-fanout email waits for a bounded 15-minute delivery window'
);

select * from finish();
rollback;
