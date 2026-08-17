-- HAB-202: separate participation quorum from the affirmative approval threshold.
-- Existing non-draft proposals retain legacy plurality semantics with threshold 0;
-- new/draft proposals default to an explicit 50% approval threshold.

alter table public.governance_proposals
  add column approval_threshold_percentage numeric(5, 2) not null default 50
  check (approval_threshold_percentage >= 0 and approval_threshold_percentage <= 100);

-- Do not retroactively change the decision rule of voting that already opened or finished.
update public.governance_proposals
set approval_threshold_percentage = 0
where status <> 'draft';

alter table public.governance_events
  drop constraint if exists governance_events_event_type_check;

alter table public.governance_events
  add constraint governance_events_event_type_check check (
    event_type in (
      'created',
      'rules_updated',
      'opened',
      'vote_cast',
      'closed',
      'approved',
      'rejected',
      'archived'
    )
  );

-- Normalize only drafts. Open/finalized proposals keep their historical ordering untouched.
with ranked as (
  select
    go.id,
    row_number() over (
      partition by go.proposal_id
      order by go.sort_order, lower(go.label), go.id
    ) - 1 as normalized_sort_order
  from public.governance_options go
  join public.governance_proposals gp on gp.id = go.proposal_id
  where gp.status = 'draft'
)
update public.governance_options go
set sort_order = ranked.normalized_sort_order
from ranked
where ranked.id = go.id
  and go.sort_order is distinct from ranked.normalized_sort_order;

create function public.normalize_governance_option_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.governance_options existing
    where existing.proposal_id = new.proposal_id
      and existing.sort_order = new.sort_order
      and existing.id <> new.id
  ) then
    select coalesce(max(existing.sort_order), -1) + 1
    into new.sort_order
    from public.governance_options existing
    where existing.proposal_id = new.proposal_id;
  end if;

  return new;
end;
$$;

create trigger governance_options_normalize_order
before insert on public.governance_options
for each row execute function public.normalize_governance_option_order();

create function public.guard_governance_option_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_proposal_id uuid := coalesce(new.proposal_id, old.proposal_id);
  proposal_status public.governance_proposal_status;
begin
  select status
  into proposal_status
  from public.governance_proposals
  where id = target_proposal_id;

  if proposal_status is distinct from 'draft'::public.governance_proposal_status then
    raise exception 'governance voting options are immutable after opening';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger governance_options_immutable_after_open
before insert or update or delete on public.governance_options
for each row execute function public.guard_governance_option_immutability();

create function public.guard_governance_voting_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    new.approval_threshold_percentage is distinct from old.approval_threshold_percentage
    or new.quorum_percentage is distinct from old.quorum_percentage
    or new.voting_basis is distinct from old.voting_basis
  ) and (old.status <> 'draft' or new.status <> 'draft') then
    raise exception 'governance voting rules are immutable after opening';
  end if;

  return new;
end;
$$;

create trigger governance_voting_configuration_immutable
before update on public.governance_proposals
for each row execute function public.guard_governance_voting_configuration();

create function public.validate_governance_open_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  option_count integer;
  ordered_count integer;
begin
  if old.status = 'draft' and new.status = 'open' then
    select count(*), count(distinct sort_order)
    into option_count, ordered_count
    from public.governance_options
    where proposal_id = new.id;

    if option_count < 2 or ordered_count <> option_count then
      raise exception 'governance voting option ordering must be deterministic before opening';
    end if;

    if new.approval_threshold_percentage <= 0 then
      raise exception 'approval threshold must be configured before opening';
    end if;
  end if;

  return new;
end;
$$;

create trigger governance_open_configuration_guard
before update of status on public.governance_proposals
for each row execute function public.validate_governance_open_configuration();

create function public.configure_governance_voting_rules(
  target_condominium uuid,
  target_proposal uuid,
  quorum_value numeric,
  approval_threshold_value numeric,
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
  previous_quorum numeric;
  previous_threshold numeric;
begin
  if auth.uid() is null or not public.can_manage_governance(target_condominium) then
    raise exception 'governance manager required';
  end if;

  if quorum_value is null or quorum_value < 0 or quorum_value > 100 then
    raise exception 'quorum percentage must be between 0 and 100';
  end if;

  if approval_threshold_value is null
    or approval_threshold_value <= 0
    or approval_threshold_value > 100
  then
    raise exception 'approval threshold must be greater than 0 and at most 100';
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

  if proposal.status <> 'draft' then
    raise exception 'governance voting rules can only be edited in draft';
  end if;

  if expected_version is not null and proposal.version <> expected_version then
    raise exception 'proposal version conflict';
  end if;

  previous_quorum := proposal.quorum_percentage;
  previous_threshold := proposal.approval_threshold_percentage;

  update public.governance_proposals
  set
    quorum_percentage = quorum_value,
    approval_threshold_percentage = approval_threshold_value,
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
    'rules_updated',
    auth.uid(),
    jsonb_build_object(
      'previous_quorum_percentage', previous_quorum,
      'quorum_percentage', proposal.quorum_percentage,
      'previous_approval_threshold_percentage', previous_threshold,
      'approval_threshold_percentage', proposal.approval_threshold_percentage
    )
  );

  return proposal;
end;
$$;

-- Atomic compatibility wrapper: the existing create RPC remains valid and defaults to 50%;
-- the Worker uses v2 so the chosen threshold is committed in the same transaction.
create function public.create_governance_proposal_v2(
  target_condominium uuid,
  proposal_title text,
  proposal_summary text,
  proposal_description text,
  proposal_category text,
  proposal_voting_basis text,
  proposal_quorum numeric,
  proposal_budget_amount numeric,
  proposal_currency text,
  opens_on timestamptz,
  closes_on timestamptz,
  options_value jsonb,
  attachments_value jsonb default '[]'::jsonb,
  approval_threshold numeric default 50
)
returns public.governance_proposals
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
begin
  if approval_threshold is null or approval_threshold <= 0 or approval_threshold > 100 then
    raise exception 'approval threshold must be greater than 0 and at most 100';
  end if;

  proposal := public.create_governance_proposal(
    target_condominium,
    proposal_title,
    proposal_summary,
    proposal_description,
    proposal_category,
    proposal_voting_basis,
    proposal_quorum,
    proposal_budget_amount,
    proposal_currency,
    opens_on,
    closes_on,
    options_value,
    attachments_value
  );

  return public.configure_governance_voting_rules(
    target_condominium,
    proposal.id,
    proposal_quorum,
    approval_threshold,
    proposal.version
  );
end;
$$;

create or replace function public.get_governance_results(
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
  proposal public.governance_proposals;
  eligible_count bigint;
  vote_count bigint;
  options_result jsonb;
  quorum_value numeric;
  approval_option_id uuid;
  approval_vote_count bigint := 0;
  approval_percentage_value numeric := 0;
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'governance membership required';
  end if;

  select *
  into proposal
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium;

  if proposal.id is null then
    raise exception 'proposal not found';
  end if;

  if proposal.eligibility_captured_at is not null then
    if proposal.voting_basis = 'one_per_owner' then
      select count(distinct s.eligible_user_id)
      into eligible_count
      from public.governance_eligibility_snapshots s
      where s.proposal_id = proposal.id;
    else
      select count(distinct s.unit_id)
      into eligible_count
      from public.governance_eligibility_snapshots s
      where s.proposal_id = proposal.id;
    end if;
  elsif proposal.status <> 'draft' then
    raise exception 'governance eligibility snapshot required';
  elsif proposal.voting_basis = 'one_per_owner' then
    select count(distinct p.auth_user_id)
    into eligible_count
    from public.people p
    join public.unit_owners uo
      on uo.person_id = p.id
      and uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
    join public.units u
      on u.id = uo.unit_id
      and u.condominium_id = target_condominium
      and u.status = 'active'
    where p.condominium_id = target_condominium
      and p.auth_user_id is not null
      and p.status = 'active';
  else
    select count(distinct u.id)
    into eligible_count
    from public.units u
    join public.unit_owners uo
      on uo.unit_id = u.id
      and uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
    join public.people p
      on p.id = uo.person_id
      and p.auth_user_id is not null
      and p.status = 'active'
    where u.condominium_id = target_condominium
      and u.status = 'active';
  end if;

  select count(*)
  into vote_count
  from public.governance_votes gv
  where gv.proposal_id = proposal.id;

  quorum_value := case
    when eligible_count = 0 then 0
    else round((vote_count::numeric / eligible_count::numeric) * 100, 2)
  end;

  select go.id
  into approval_option_id
  from public.governance_options go
  where go.proposal_id = proposal.id
  order by go.sort_order, lower(go.label), go.id
  limit 1;

  if approval_option_id is not null then
    select count(*)
    into approval_vote_count
    from public.governance_votes gv
    where gv.proposal_id = proposal.id
      and gv.option_id = approval_option_id;
  end if;

  approval_percentage_value := case
    when vote_count = 0 then 0
    else round((approval_vote_count::numeric / vote_count::numeric) * 100, 2)
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', option_rows.id,
        'label', option_rows.label,
        'description', option_rows.description,
        'sort_order', option_rows.sort_order,
        'votes', option_rows.votes,
        'percentage', case
          when vote_count = 0 then 0
          else round((option_rows.votes::numeric / vote_count::numeric) * 100, 2)
        end
      )
      order by option_rows.sort_order, lower(option_rows.label), option_rows.id
    ),
    '[]'::jsonb
  )
  into options_result
  from (
    select
      go.id,
      go.label,
      go.description,
      go.sort_order,
      count(gv.id) as votes
    from public.governance_options go
    left join public.governance_votes gv
      on gv.option_id = go.id
      and gv.proposal_id = go.proposal_id
    where go.proposal_id = proposal.id
    group by go.id, go.label, go.description, go.sort_order
  ) option_rows;

  return jsonb_build_object(
    'proposal_id', proposal.id,
    'status', proposal.status,
    'voting_basis', proposal.voting_basis,
    'eligible_count', eligible_count,
    'votes_cast', vote_count,
    'participation_percentage', quorum_value,
    'quorum_percentage', proposal.quorum_percentage,
    'quorum_met', quorum_value >= proposal.quorum_percentage,
    'approval_option_id', approval_option_id,
    'approval_vote_count', approval_vote_count,
    'approval_percentage', approval_percentage_value,
    'approval_threshold_percentage', proposal.approval_threshold_percentage,
    'approval_threshold_met', approval_percentage_value >= proposal.approval_threshold_percentage,
    'snapshot_captured_at', proposal.eligibility_captured_at,
    'snapshot_source', proposal.eligibility_snapshot_source,
    'options', options_result
  );
end;
$$;

create or replace function public.get_governance_decision(
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
  approval_option_id uuid;
  winning_option_id uuid;
  winning_option_label text;
  maximum_votes bigint := -1;
  winning_count integer := 0;
  current_votes bigint;
  decision_value text;
  approval_threshold_met boolean;
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'governance membership required';
  end if;

  results := public.get_governance_results(target_condominium, target_proposal);
  approval_option_id := nullif(results ->> 'approval_option_id', '')::uuid;
  approval_threshold_met := coalesce((results ->> 'approval_threshold_met')::boolean, false);

  for option_value in
    select value from jsonb_array_elements(results -> 'options')
  loop
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
  elsif winning_option_id = approval_option_id and approval_threshold_met then
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
    'quorum_percentage', (results ->> 'quorum_percentage')::numeric,
    'approval_option_id', approval_option_id,
    'approval_vote_count', (results ->> 'approval_vote_count')::bigint,
    'approval_percentage', (results ->> 'approval_percentage')::numeric,
    'approval_threshold_percentage', (results ->> 'approval_threshold_percentage')::numeric,
    'approval_threshold_met', approval_threshold_met
  );
end;
$$;

revoke execute on function public.configure_governance_voting_rules(uuid, uuid, numeric, numeric, integer) from public;
revoke execute on function public.create_governance_proposal_v2(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, jsonb, jsonb, numeric) from public;
grant execute on function public.configure_governance_voting_rules(uuid, uuid, numeric, numeric, integer) to authenticated;
grant execute on function public.create_governance_proposal_v2(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, jsonb, jsonb, numeric) to authenticated;
