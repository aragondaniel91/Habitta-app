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

create temporary table hab150_entities(
  condo_id uuid primary key,
  unit_id uuid not null,
  method_id uuid not null,
  payment_id uuid not null,
  concept_id uuid not null,
  receivable_id uuid not null
);
insert into hab150_entities
select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
from generate_series(1, 6);

insert into public.condominiums(id, organization_id, name, created_by)
select condo_id,
       'c1100000-0000-0000-0000-000000000001',
       'HAB-150 Condo ' || row_number() over (),
       'c1000000-0000-0000-0000-000000000001'
from hab150_entities;

insert into public.units(id, condominium_id, code, type, created_by)
select unit_id,
       condo_id,
       'HAB150-' || row_number() over (),
       'apartment',
       'c1000000-0000-0000-0000-000000000001'
from hab150_entities;

insert into public.condominium_payment_methods(
  id, condominium_id, method_type, display_name, currency_code,
  requires_reference, requires_proof, is_active, created_by
)
select method_id,
       condo_id,
       'cash',
       'HAB-150 Cash ' || row_number() over (),
       'USD',
       false,
       false,
       true,
       'c1000000-0000-0000-0000-000000000001'
from hab150_entities;

insert into public.payments(
  id, condominium_id, unit_id, submitted_by_user_id, payment_method_id,
  payment_date, original_amount, original_currency_code, payer_name, idempotency_key
)
select payment_id,
       condo_id,
       unit_id,
       'c1000000-0000-0000-0000-000000000001',
       method_id,
       current_date,
       1.00,
       'USD',
       'HAB-150 payer',
       'hab150-payment-' || payment_id::text
from hab150_entities;

insert into public.charge_concepts(id, condominium_id, code, name, category, created_by)
select concept_id,
       condo_id,
       'H150-' || row_number() over (),
       'HAB-150 fee ' || row_number() over (),
       'regular_dues',
       'c1000000-0000-0000-0000-000000000001'
from hab150_entities;

insert into public.receivable_items(
  id, condominium_id, unit_id, concept_id, item_type, description, issue_date,
  due_date, currency_code, original_amount, created_by
)
select receivable_id,
       condo_id,
       unit_id,
       concept_id,
       'charge',
       'HAB-150 due item',
       current_date,
       current_date + 7,
       'USD',
       10.00,
       'c1000000-0000-0000-0000-000000000001'
from hab150_entities;

update public.condominium_notification_settings
set email_enabled = true,
    live_email_enabled = true
where condominium_id in (select condo_id from hab150_entities);

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
  fixture record;
  event_id uuid;
  delivery_number integer;
begin
  for fixture in select condo_id, unit_id, payment_id from hab150_entities loop
    event_id := gen_random_uuid();
    insert into public.notification_events(
      id, condominium_id, event_type, aggregate_type, aggregate_id, unit_id, payload, deduplication_key
    ) values (
      event_id,
      fixture.condo_id,
      'payment_approved',
      'payment',
      fixture.payment_id,
      fixture.unit_id,
      jsonb_build_object('condominium_id', fixture.condo_id),
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
        fixture.condo_id,
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
    where d.condominium_id in (select condo_id from hab150_entities)
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
  fixture record;
  event_id uuid := gen_random_uuid();
begin
  select condo_id, unit_id, receivable_id
    into fixture
    from hab150_entities
    order by condo_id
    limit 1;

  insert into public.notification_events(
    id, condominium_id, event_type, aggregate_type, aggregate_id, unit_id, payload, deduplication_key
  ) values (
    event_id,
    fixture.condo_id,
    'receivable_overdue',
    'receivable',
    fixture.receivable_id,
    fixture.unit_id,
    jsonb_build_object('condominium_id', fixture.condo_id),
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
    fixture.condo_id,
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
