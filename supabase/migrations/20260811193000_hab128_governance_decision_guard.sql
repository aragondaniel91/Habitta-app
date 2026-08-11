-- HAB-128: governance decisions must follow quorum and the recorded winning option.
-- The first voting option is the affirmative/approval option; any other unique winner rejects.
-- Exceptional decisions use a separate override RPC with a mandatory reason and audit metadata.

create function public.get_governance_decision(
  target_condominium uuid,
  target_proposal uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  results jsonb;
  option_value jsonb;
  first_option_id uuid;
  winning_option_id uuid;
  winning_option_label text;
  maximum_votes bigint := -1;
  winning_count integer := 0;
  current_votes bigint;
  decision_value text;
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'governance membership required';
  end if;

  results := public.get_governance_results(target_condominium, target_proposal);

  for option_value in
    select value from jsonb_array_elements(results -> 'options')
  loop
    if first_option_id is null then
      first_option_id := (option_value ->> 'id')::uuid;
    end if;

    current_votes := (option_value ->> 'votes')::bigint;
    if current_votes > maximum_votes then
      maximum_votes := current_votes;
      winning_option_id := (option_value ->> 'id')::uuid;
      winning_option_label := option_value ->> 'label';
      winning_count := 1;
    elsif current_votes = maximum_votes then
      winning_count := winning_count + 1;
    end if;
  end loop;

  if not coalesce((results ->> 'quorum_met')::boolean, false) then
    decision_value := 'no_quorum';
    winning_option_id := null;
    winning_option_label := null;
  elsif winning_count <> 1 then
    decision_value := 'tie';
    winning_option_id := null;
    winning_option_label := null;
  elsif winning_option_id = first_option_id then
    decision_value := 'approve';
  else
    decision_value := 'reject';
  end if;

  return jsonb_build_object(
    'proposal_id', target_proposal,
    'decision', decision_value,
    'winning_option_id', winning_option_id,
    'winning_option_label', winning_option_label,
    'quorum_met', (results ->> 'quorum_met')::boolean,
    'eligible_count', (results ->> 'eligible_count')::bigint,
    'votes_cast', (results ->> 'votes_cast')::bigint,
    'participation_percentage', (results ->> 'participation_percentage')::numeric,
    'quorum_percentage', (results ->> 'quorum_percentage')::numeric
  );
end;
$$;

create or replace function public.transition_governance_proposal(
  target_condominium uuid,
  target_proposal uuid,
  action_name text,
  expected_version integer default null
)
returns public.governance_proposals
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
  next_status public.governance_proposal_status;
  event_name text;
  decision_snapshot jsonb;
  automatic_decision text;
begin
  if auth.uid() is null or not public.can_manage_governance(target_condominium) then
    raise exception 'governance manager required';
  end if;

  select *
  into proposal
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium
  for update;

  if proposal.id is null then
    raise exception 'proposal not found';
  end if;

  if expected_version is not null and proposal.version <> expected_version then
    raise exception 'proposal version conflict';
  end if;

  if action_name = 'open' then
    if proposal.status <> 'draft'
      or proposal.closes_at <= now()
      or (select count(*) from public.governance_options where proposal_id = proposal.id) < 2
    then
      raise exception 'proposal cannot be opened';
    end if;
    next_status := 'open';
    event_name := 'opened';
  elsif action_name = 'close' then
    if proposal.status <> 'open' then
      raise exception 'proposal cannot be closed';
    end if;
    next_status := 'closed';
    event_name := 'closed';
  elsif action_name in ('approve', 'reject') then
    if proposal.status <> 'closed' then
      raise exception 'proposal cannot be decided';
    end if;

    decision_snapshot := public.get_governance_decision(target_condominium, target_proposal);
    automatic_decision := decision_snapshot ->> 'decision';

    if automatic_decision = 'no_quorum' then
      raise exception 'proposal quorum not met';
    elsif automatic_decision = 'tie' then
      raise exception 'proposal result is tied';
    elsif automatic_decision <> action_name then
      raise exception 'proposal result requires %', automatic_decision;
    end if;

    next_status := action_name::public.governance_proposal_status;
    event_name := case when action_name = 'approve' then 'approved' else 'rejected' end;
  elsif action_name = 'archive' then
    if proposal.status = 'open' then
      raise exception 'open proposal cannot be archived';
    end if;
    next_status := 'archived';
    event_name := 'archived';
  else
    raise exception 'unknown proposal action';
  end if;

  update public.governance_proposals
  set
    status = next_status,
    opens_at = case
      when next_status = 'open' then coalesce(opens_at, now())
      else opens_at
    end,
    closed_at = case
      when next_status in ('closed', 'approved', 'rejected') then coalesce(closed_at, now())
      else closed_at
    end,
    version = version + 1,
    updated_at = now()
  where id = proposal.id
  returning * into proposal;

  insert into public.governance_events (
    proposal_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    proposal.id,
    target_condominium,
    event_name,
    auth.uid(),
    case
      when action_name in ('approve', 'reject') then
        coalesce(decision_snapshot, '{}'::jsonb) || jsonb_build_object('override', false)
      else '{}'::jsonb
    end
  );

  return proposal;
end;
$$;

create function public.override_governance_proposal_decision(
  target_condominium uuid,
  target_proposal uuid,
  decision_name text,
  reason_value text,
  expected_version integer default null
)
returns public.governance_proposals
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
  decision_snapshot jsonb;
  next_status public.governance_proposal_status;
  event_name text;
begin
  if auth.uid() is null or not public.can_manage_governance(target_condominium) then
    raise exception 'governance manager required';
  end if;

  if decision_name not in ('approve', 'reject')
    or nullif(trim(reason_value), '') is null
  then
    raise exception 'override decision and reason are required';
  end if;

  select *
  into proposal
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium
  for update;

  if proposal.id is null then
    raise exception 'proposal not found';
  end if;

  if proposal.status <> 'closed' then
    raise exception 'only closed proposals can be overridden';
  end if;

  if expected_version is not null and proposal.version <> expected_version then
    raise exception 'proposal version conflict';
  end if;

  decision_snapshot := public.get_governance_decision(target_condominium, target_proposal);
  next_status := decision_name::public.governance_proposal_status;
  event_name := case when decision_name = 'approve' then 'approved' else 'rejected' end;

  update public.governance_proposals
  set
    status = next_status,
    closed_at = coalesce(closed_at, now()),
    version = version + 1,
    updated_at = now()
  where id = proposal.id
  returning * into proposal;

  insert into public.governance_events (
    proposal_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    proposal.id,
    target_condominium,
    event_name,
    auth.uid(),
    decision_snapshot || jsonb_build_object(
      'override', true,
      'reason', trim(reason_value),
      'override_decision', decision_name
    )
  );

  return proposal;
end;
$$;

revoke execute on function public.get_governance_decision(uuid, uuid) from public;
revoke execute on function public.override_governance_proposal_decision(uuid, uuid, text, text, integer) from public;
grant execute on function public.get_governance_decision(uuid, uuid) to authenticated;
grant execute on function public.override_governance_proposal_decision(uuid, uuid, text, text, integer) to authenticated;
