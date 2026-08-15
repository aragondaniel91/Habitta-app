create type public.integration_outbox_status as enum (
  'pending',
  'claimed',
  'queued',
  'processing',
  'consumed',
  'dead'
);

create table public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid references public.condominiums(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  aggregate_type text not null check (aggregate_type ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  correlation_id uuid,
  deduplication_key text not null unique check (length(deduplication_key) between 1 and 200),
  status public.integration_outbox_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_until timestamptz,
  locked_by text,
  queued_at timestamptz,
  consumed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_outbox_payload_size check (pg_column_size(payload) <= 65536)
);

create index integration_outbox_due_idx
  on public.integration_outbox (status, available_at, created_at)
  where status in ('pending', 'claimed');

create index integration_outbox_condominium_idx
  on public.integration_outbox (condominium_id, created_at desc);

alter table public.integration_outbox enable row level security;

revoke all on table public.integration_outbox from anon, authenticated;
grant select, insert, update on table public.integration_outbox to service_role;

create or replace function public.emit_integration_outbox_event(
  target_condominium uuid,
  target_event_type text,
  target_aggregate_type text,
  target_aggregate_id uuid,
  target_payload jsonb,
  target_deduplication_key text,
  target_correlation_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_id uuid;
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'integration_payload_must_be_object';
  end if;

  insert into public.integration_outbox (
    condominium_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    deduplication_key,
    correlation_id
  )
  values (
    target_condominium,
    target_event_type,
    target_aggregate_type,
    target_aggregate_id,
    target_payload,
    target_deduplication_key,
    target_correlation_id
  )
  on conflict (deduplication_key) do update
    set deduplication_key = excluded.deduplication_key
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.claim_due_integration_outbox(limit_count integer default 50)
returns table (id uuid)
language sql
security invoker
set search_path = public
as $$
  with picked as (
    select o.id
    from public.integration_outbox o
    where o.available_at <= now()
      and (
        o.status = 'pending'
        or (o.status = 'claimed' and coalesce(o.locked_until, '-infinity'::timestamptz) <= now())
      )
    order by o.created_at, o.id
    for update skip locked
    limit greatest(1, least(coalesce(limit_count, 50), 100))
  ), claimed as (
    update public.integration_outbox o
    set status = 'claimed',
        attempts = o.attempts + 1,
        locked_at = now(),
        locked_until = now() + interval '5 minutes',
        locked_by = 'cloudflare-scheduler',
        updated_at = now()
    from picked
    where o.id = picked.id
    returning o.id
  )
  select claimed.id from claimed;
$$;

create or replace function public.mark_integration_outbox_queued(target uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.integration_outbox
  set status = 'queued',
      queued_at = coalesce(queued_at, now()),
      locked_at = null,
      locked_until = null,
      locked_by = null,
      updated_at = now()
  where id = target
    and status = 'claimed';

  if found then
    return true;
  end if;

  return exists (
    select 1
    from public.integration_outbox
    where id = target
      and status in ('queued', 'processing', 'consumed')
  );
end;
$$;

create or replace function public.claim_integration_outbox_event(target uuid, worker text)
returns public.integration_outbox
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed public.integration_outbox;
begin
  update public.integration_outbox o
  set status = 'processing',
      locked_at = now(),
      locked_until = now() + interval '5 minutes',
      locked_by = worker,
      updated_at = now()
  where o.id = target
    and (
      o.status in ('claimed', 'queued')
      or (
        o.status = 'processing'
        and (
          o.locked_by = worker
          or coalesce(o.locked_until, '-infinity'::timestamptz) <= now()
        )
      )
    )
  returning o.* into claimed;

  return claimed;
end;
$$;

create or replace function public.complete_integration_outbox_event(target uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.integration_outbox
  set status = 'consumed',
      consumed_at = coalesce(consumed_at, now()),
      locked_at = null,
      locked_until = null,
      locked_by = null,
      last_error_code = null,
      updated_at = now()
  where id = target
    and status = 'processing';

  if found then
    return true;
  end if;

  return exists (
    select 1 from public.integration_outbox where id = target and status = 'consumed'
  );
end;
$$;

revoke all on function public.emit_integration_outbox_event(uuid, text, text, uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_due_integration_outbox(integer) from public, anon, authenticated;
revoke all on function public.mark_integration_outbox_queued(uuid) from public, anon, authenticated;
revoke all on function public.claim_integration_outbox_event(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_integration_outbox_event(uuid) from public, anon, authenticated;

grant execute on function public.emit_integration_outbox_event(uuid, text, text, uuid, jsonb, text, uuid) to service_role;
grant execute on function public.claim_due_integration_outbox(integer) to service_role;
grant execute on function public.mark_integration_outbox_queued(uuid) to service_role;
grant execute on function public.claim_integration_outbox_event(uuid, text) to service_role;
grant execute on function public.complete_integration_outbox_event(uuid) to service_role;
