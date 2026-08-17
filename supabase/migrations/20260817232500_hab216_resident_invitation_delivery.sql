-- HAB-216: resident invitations are explicit transactional messages initiated by an authorized
-- condominium operator. Invitation lifecycle and transport delivery are separate concerns:
-- public.invitations keeps pending/accepted/expired/revoked while this append-only table records
-- whether the email transport was sent, failed or disabled.

create table public.resident_invitation_delivery_events (
  id uuid primary key default gen_random_uuid(),
  sequence_number bigint generated always as identity,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  unit_id uuid not null references public.units(id),
  event_type text not null check (event_type in ('email_sent', 'email_failed', 'email_disabled')),
  actor_user_id uuid references auth.users(id),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  mode text not null check (char_length(btrim(mode)) between 1 and 40),
  error_code text check (error_code is null or char_length(error_code) between 1 and 120),
  provider_id text check (provider_id is null or char_length(provider_id) between 1 and 160),
  occurred_at timestamptz not null default clock_timestamp()
);

create index resident_invitation_delivery_invitation_idx
  on public.resident_invitation_delivery_events (invitation_id, sequence_number desc);
create index resident_invitation_delivery_condominium_idx
  on public.resident_invitation_delivery_events (condominium_id, sequence_number desc);
create index resident_invitation_delivery_person_idx
  on public.resident_invitation_delivery_events (person_id, sequence_number desc);

create or replace function public.resident_invitation_delivery_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'resident invitation delivery events are immutable';
end
$$;

revoke all on function public.resident_invitation_delivery_event_immutable()
  from public, anon, authenticated, service_role;

create trigger resident_invitation_delivery_events_immutable
before update or delete on public.resident_invitation_delivery_events
for each row execute function public.resident_invitation_delivery_event_immutable();

alter table public.resident_invitation_delivery_events enable row level security;

revoke all on table public.resident_invitation_delivery_events
  from public, anon, authenticated, service_role;
grant select on table public.resident_invitation_delivery_events to authenticated;

create policy resident_invitation_delivery_events_read
on public.resident_invitation_delivery_events
for select
to authenticated
using (public.can_manage_people(condominium_id));

create or replace function public.record_resident_invitation_delivery(
  target_invitation_id uuid,
  target_status text,
  target_provider text,
  target_mode text,
  target_error_code text default null,
  target_provider_id text default null
)
returns public.resident_invitation_delivery_events
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  invitation public.invitations;
  resolved_event_type text;
  event_record public.resident_invitation_delivery_events;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
    into invitation
  from public.invitations i
  where i.id = target_invitation_id;

  if invitation.id is null
    or invitation.invited_by <> auth.uid()
    or not public.can_manage_people(invitation.condominium_id)
  then
    raise exception 'resident invitation delivery audit denied';
  end if;

  resolved_event_type := case target_status
    when 'sent' then 'email_sent'
    when 'failed' then 'email_failed'
    when 'disabled' then 'email_disabled'
    else null
  end;

  if resolved_event_type is null then
    raise exception 'invalid resident invitation delivery status';
  end if;

  if coalesce(btrim(target_provider), '') = '' or coalesce(btrim(target_mode), '') = '' then
    raise exception 'invalid resident invitation delivery metadata';
  end if;

  insert into public.resident_invitation_delivery_events (
    invitation_id,
    condominium_id,
    person_id,
    unit_id,
    event_type,
    actor_user_id,
    provider,
    mode,
    error_code,
    provider_id
  ) values (
    invitation.id,
    invitation.condominium_id,
    invitation.person_id,
    invitation.unit_id,
    resolved_event_type,
    auth.uid(),
    left(btrim(target_provider), 80),
    left(btrim(target_mode), 40),
    nullif(left(btrim(coalesce(target_error_code, '')), 120), ''),
    nullif(left(btrim(coalesce(target_provider_id, '')), 160), '')
  )
  returning * into event_record;

  return event_record;
end
$$;

revoke all on function public.record_resident_invitation_delivery(uuid, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.record_resident_invitation_delivery(uuid, text, text, text, text, text)
  to authenticated;

comment on table public.resident_invitation_delivery_events is
  'Append-only delivery audit for explicit resident invitation email attempts. Never stores raw invitation tokens or recipient email.';
comment on function public.record_resident_invitation_delivery(uuid, text, text, text, text, text) is
  'Records a terminal resident invitation email delivery outcome for the authenticated invitation creator while they still manage People.';
