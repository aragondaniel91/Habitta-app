-- HAB-166: connect governance milestones to the shared notification outbox.
-- Ballot choices and voter identities are intentionally excluded from every notification payload.

alter type public.notification_event_type add value if not exists 'governance_opened';
alter type public.notification_event_type add value if not exists 'governance_due_soon';
alter type public.notification_event_type add value if not exists 'governance_result_available';
alter type public.notification_event_type add value if not exists 'governance_decision_final';

alter table public.notification_events
  drop constraint if exists notification_events_aggregate_type_check;

alter table public.notification_events
  add constraint notification_events_aggregate_type_check
  check (aggregate_type in (
    'receivable', 'payment', 'receipt', 'announcement', 'maintenance', 'service_request', 'governance'
  ));

create or replace function public.validate_notification_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expected_unit uuid;
  aggregate_found boolean := false;
begin
  if new.aggregate_type = 'receivable' then
    select unit_id, true into expected_unit, aggregate_found
    from public.receivable_items where id = new.aggregate_id and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'payment' then
    select unit_id, true into expected_unit, aggregate_found
    from public.payments where id = new.aggregate_id and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'receipt' then
    select p.unit_id, true into expected_unit, aggregate_found
    from public.payment_receipts r join public.payments p on p.id = r.payment_id
    where r.id = new.aggregate_id and r.condominium_id = new.condominium_id
      and p.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'announcement' then
    select null::uuid, true into expected_unit, aggregate_found
    from public.announcements a where a.id = new.aggregate_id and a.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'maintenance' then
    select null::uuid, true into expected_unit, aggregate_found
    from public.maintenance_work_orders w
    where w.id = new.aggregate_id and w.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'service_request' then
    select r.unit_id, true into expected_unit, aggregate_found
    from public.service_requests r
    where r.id = new.aggregate_id and r.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'governance' then
    select null::uuid, true into expected_unit, aggregate_found
    from public.governance_proposals p
    where p.id = new.aggregate_id and p.condominium_id = new.condominium_id;
  else
    raise exception 'invalid notification aggregate type';
  end if;

  if not coalesce(aggregate_found, false) then
    raise exception 'notification aggregate does not belong to condominium';
  end if;
  if new.unit_id is distinct from expected_unit then
    raise exception 'notification unit does not match aggregate';
  end if;
  return new;
end;
$$;

create function public.emit_governance_notification(
  target_proposal uuid,
  target_type public.notification_event_type,
  target_actor uuid,
  target_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal_row public.governance_proposals;
  condo_name text;
  recipient record;
  created_event_id uuid;
  recipient_email text;
  in_app_allowed boolean;
  email_allowed boolean;
  title_value text;
  intro_value text;
  action_value text;
  payload_value jsonb;
begin
  select * into proposal_row from public.governance_proposals where id = target_proposal;
  if proposal_row.id is null then raise exception 'governance proposal not found'; end if;

  if target_type not in (
    'governance_opened', 'governance_due_soon',
    'governance_result_available', 'governance_decision_final'
  ) then
    raise exception 'invalid governance notification type';
  end if;

  select name into condo_name from public.condominiums where id = proposal_row.condominium_id;
  action_value := '/app/condominiums/' || proposal_row.condominium_id || '/governance/' || proposal_row.id;
  title_value := case target_type
    when 'governance_opened' then 'Nueva votación disponible'
    when 'governance_due_soon' then 'Votación próxima a cerrar'
    when 'governance_result_available' then 'Resultado de votación disponible'
    else 'Decisión comunitaria final'
  end;
  intro_value := case target_type
    when 'governance_opened' then 'Ya puedes revisar y votar esta propuesta.'
    when 'governance_due_soon' then 'La votación cerrará pronto.'
    when 'governance_result_available' then 'La votación fue cerrada y su resultado ya puede revisarse.'
    else case proposal_row.status
      when 'approved' then 'La propuesta fue aprobada.'
      when 'rejected' then 'La propuesta fue rechazada.'
      else 'La propuesta tiene una decisión final.'
    end
  end;

  -- Deliberately exclude votes, option ids/labels, voter ids and vote totals.
  payload_value := jsonb_strip_nulls(jsonb_build_object(
    'condominium_id', proposal_row.condominium_id,
    'condominium_name', condo_name,
    'proposal_id', proposal_row.id,
    'title', proposal_row.title,
    'category', proposal_row.category,
    'status', proposal_row.status,
    'voting_basis', proposal_row.voting_basis,
    'closes_at', proposal_row.closes_at,
    'action_url', action_value
  ));

  insert into public.notification_events(
    condominium_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload, deduplication_key, status, processed_at
  ) values (
    proposal_row.condominium_id, target_type, 'governance', proposal_row.id, target_actor,
    payload_value, target_key, 'expanded', now()
  )
  on conflict(deduplication_key) do nothing
  returning id into created_event_id;

  if created_event_id is null then return false; end if;

  for recipient in
    select distinct p.auth_user_id as user_id
    from public.people p
    join public.unit_owners uo on uo.person_id = p.id
    join public.units u on u.id = uo.unit_id and u.condominium_id = p.condominium_id
    where p.condominium_id = proposal_row.condominium_id
      and p.status = 'active'
      and p.auth_user_id is not null
      and u.status = 'active'
      and uo.ends_at is null
      and p.auth_user_id is distinct from target_actor
  loop
    select coalesce(pref.in_app_enabled, true), coalesce(pref.email_enabled, true)
      into in_app_allowed, email_allowed
    from (select 1) seed
    left join public.notification_preferences pref
      on pref.condominium_id = proposal_row.condominium_id
     and pref.user_id = recipient.user_id
     and pref.notification_type = target_type;

    if in_app_allowed then
      insert into public.notifications(
        condominium_id, recipient_user_id, event_id, notification_type,
        title, body, action_url, metadata
      ) values (
        proposal_row.condominium_id, recipient.user_id, created_event_id, target_type,
        title_value, condo_name || ' · ' || proposal_row.title || ' · ' || intro_value,
        action_value, jsonb_build_object('proposal_id', proposal_row.id)
      ) on conflict(event_id, recipient_user_id) do nothing;
    end if;

    select lower(coalesce(nullif(trim(u.email),''), nullif(trim(person.email),'')))
      into recipient_email
    from auth.users u
    left join lateral (
      select p.email
      from public.people p
      where p.auth_user_id = u.id
        and p.condominium_id = proposal_row.condominium_id
        and p.email is not null
      order by p.created_at
      limit 1
    ) person on true
    where u.id = recipient.user_id;

    if email_allowed
      and recipient_email is not null
      and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
      insert into public.notification_deliveries(
        condominium_id, event_id, recipient_user_id, recipient_email, channel,
        template_key, payload, status, deduplication_key
      ) values (
        proposal_row.condominium_id, created_event_id, recipient.user_id, recipient_email, 'email',
        target_type::text, payload_value, 'pending',
        'delivery:' || created_event_id || ':' || recipient.user_id || ':email'
      ) on conflict(deduplication_key) do nothing;
      -- HAB-130 converts pending email to skipped unless live delivery is explicitly enabled.
    end if;
  end loop;

  return true;
end;
$$;

create function public.capture_governance_notification()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.event_type = 'opened' then
    perform public.emit_governance_notification(
      new.proposal_id, 'governance_opened', new.actor_user_id,
      'governance-event:' || new.id
    );
  elsif new.event_type = 'closed' then
    perform public.emit_governance_notification(
      new.proposal_id, 'governance_result_available', new.actor_user_id,
      'governance-event:' || new.id
    );
  elsif new.event_type in ('approved', 'rejected') then
    perform public.emit_governance_notification(
      new.proposal_id, 'governance_decision_final', new.actor_user_id,
      'governance-event:' || new.id
    );
  end if;
  -- vote_cast, created and archived events never fan out notifications.
  return new;
end;
$$;

create trigger governance_notification_outbox
after insert on public.governance_events
for each row execute function public.capture_governance_notification();

create function public.generate_governance_due_notification_events(run_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal_row record;
  created_count integer := 0;
  emitted boolean;
begin
  for proposal_row in
    select p.id, p.closes_at
    from public.governance_proposals p
    where p.status = 'open'
      and p.closes_at > run_at
      and p.closes_at <= run_at + interval '24 hours'
  loop
    emitted := public.emit_governance_notification(
      proposal_row.id,
      'governance_due_soon',
      null,
      'governance:due-soon:' || proposal_row.id || ':' || proposal_row.closes_at::text
    );
    if emitted then created_count := created_count + 1; end if;
  end loop;
  return created_count;
end;
$$;

revoke all on function public.emit_governance_notification(uuid,public.notification_event_type,uuid,text)
  from public, anon, authenticated;
revoke all on function public.capture_governance_notification()
  from public, anon, authenticated;
revoke all on function public.generate_governance_due_notification_events(timestamptz)
  from public, anon, authenticated;
grant execute on function public.generate_governance_due_notification_events(timestamptz) to service_role;
