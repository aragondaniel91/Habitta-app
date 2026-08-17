-- HAB-200: freeze governance proposal eligibility when voting opens and certify final decisions.
--
-- Assemblies already use immutable eligibility snapshots. Proposal voting must use the
-- same integrity rule so ownership changes cannot retroactively change quorum/results.

alter table public.governance_proposals
  add column eligibility_count integer check (eligibility_count is null or eligibility_count >= 0),
  add column eligibility_captured_at timestamptz,
  add column eligibility_snapshot_source text
    check (eligibility_snapshot_source is null or eligibility_snapshot_source in ('lifecycle', 'migration_backfill')),
  add column decision_snapshot jsonb,
  add column certified_at timestamptz,
  add column certified_by uuid references auth.users(id);

create table public.governance_eligibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  condominium_id uuid not null,
  voting_basis public.governance_voting_basis not null,
  eligible_user_id uuid not null,
  unit_id uuid,
  label text not null check (char_length(trim(label)) between 1 and 200),
  captured_at timestamptz not null default now(),
  foreign key (proposal_id, condominium_id)
    references public.governance_proposals(id, condominium_id) on delete cascade,
  foreign key (unit_id, condominium_id)
    references public.units(id, condominium_id),
  check (
    (voting_basis = 'one_per_owner' and unit_id is null)
    or (voting_basis = 'one_per_unit' and unit_id is not null)
  )
);

create unique index governance_eligibility_owner_unique
  on public.governance_eligibility_snapshots (proposal_id, eligible_user_id)
  where voting_basis = 'one_per_owner';

create unique index governance_eligibility_unit_voter_unique
  on public.governance_eligibility_snapshots (proposal_id, unit_id, eligible_user_id)
  where voting_basis = 'one_per_unit';

create index governance_eligibility_user_idx
  on public.governance_eligibility_snapshots (condominium_id, eligible_user_id, proposal_id);

alter table public.governance_eligibility_snapshots enable row level security;

create policy governance_eligibility_snapshots_read
on public.governance_eligibility_snapshots
for select
using (
  eligible_user_id = auth.uid()
  or public.can_manage_governance(condominium_id)
);

grant select on public.governance_eligibility_snapshots to authenticated;
revoke insert, update, delete on public.governance_eligibility_snapshots from anon, authenticated;

create function public.reject_governance_eligibility_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'governance eligibility snapshot is immutable';
end;
$$;

revoke execute on function public.reject_governance_eligibility_snapshot_mutation() from public;

create trigger governance_eligibility_snapshots_immutable
before update or delete on public.governance_eligibility_snapshots
for each row execute function public.reject_governance_eligibility_snapshot_mutation();

create function public.protect_governance_certification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.eligibility_captured_at is not null and (
    new.eligibility_count is distinct from old.eligibility_count
    or new.eligibility_captured_at is distinct from old.eligibility_captured_at
    or new.eligibility_snapshot_source is distinct from old.eligibility_snapshot_source
  ) then
    raise exception 'governance eligibility certification is immutable';
  end if;

  if old.certified_at is not null and (
    new.decision_snapshot is distinct from old.decision_snapshot
    or new.certified_at is distinct from old.certified_at
    or new.certified_by is distinct from old.certified_by
  ) then
    raise exception 'governance decision certification is immutable';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_governance_certification() from public;

create trigger governance_proposals_certification_immutable
before update on public.governance_proposals
for each row execute function public.protect_governance_certification();

-- Best-effort backfill for proposals that were already opened/finalized before HAB-200.
-- Exact historical ownership cannot be reconstructed from mutable present-day state, so the
-- source is explicitly marked migration_backfill. Existing cast voters are also preserved.
insert into public.governance_eligibility_snapshots (
  proposal_id,
  condominium_id,
  voting_basis,
  eligible_user_id,
  unit_id,
  label
)
select distinct on (gp.id, p.auth_user_id)
  gp.id,
  gp.condominium_id,
  gp.voting_basis,
  p.auth_user_id,
  null,
  coalesce(
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    p.email,
    p.auth_user_id::text
  )
from public.governance_proposals gp
join public.unit_owners uo
  on uo.starts_at <= current_date
  and (uo.ends_at is null or uo.ends_at >= current_date)
join public.units u
  on u.id = uo.unit_id
  and u.condominium_id = gp.condominium_id
  and u.status = 'active'
join public.people p
  on p.id = uo.person_id
  and p.condominium_id = gp.condominium_id
  and p.auth_user_id is not null
  and p.status = 'active'
where gp.status <> 'draft'
  and gp.voting_basis = 'one_per_owner'
order by gp.id, p.auth_user_id, u.code
on conflict do nothing;

insert into public.governance_eligibility_snapshots (
  proposal_id,
  condominium_id,
  voting_basis,
  eligible_user_id,
  unit_id,
  label
)
select distinct on (gp.id, u.id, p.auth_user_id)
  gp.id,
  gp.condominium_id,
  gp.voting_basis,
  p.auth_user_id,
  u.id,
  u.code
from public.governance_proposals gp
join public.unit_owners uo
  on uo.starts_at <= current_date
  and (uo.ends_at is null or uo.ends_at >= current_date)
join public.units u
  on u.id = uo.unit_id
  and u.condominium_id = gp.condominium_id
  and u.status = 'active'
join public.people p
  on p.id = uo.person_id
  and p.condominium_id = gp.condominium_id
  and p.auth_user_id is not null
  and p.status = 'active'
where gp.status <> 'draft'
  and gp.voting_basis = 'one_per_unit'
order by gp.id, u.id, p.auth_user_id
on conflict do nothing;

insert into public.governance_eligibility_snapshots (
  proposal_id,
  condominium_id,
  voting_basis,
  eligible_user_id,
  unit_id,
  label
)
select
  gp.id,
  gp.condominium_id,
  gp.voting_basis,
  gv.user_id,
  gv.unit_id,
  coalesce(u.code, 'Unidad histórica')
from public.governance_proposals gp
join public.governance_votes gv on gv.proposal_id = gp.id
left join public.units u
  on u.id = gv.unit_id
  and u.condominium_id = gp.condominium_id
where gp.status <> 'draft'
  and gp.voting_basis = 'one_per_unit'
  and gv.unit_id is not null
on conflict do nothing;

insert into public.governance_eligibility_snapshots (
  proposal_id,
  condominium_id,
  voting_basis,
  eligible_user_id,
  unit_id,
  label
)
select
  gp.id,
  gp.condominium_id,
  gp.voting_basis,
  gv.user_id,
  null,
  coalesce(au.email, gv.user_id::text)
from public.governance_proposals gp
join public.governance_votes gv on gv.proposal_id = gp.id
left join auth.users au on au.id = gv.user_id
where gp.status <> 'draft'
  and gp.voting_basis = 'one_per_owner'
  and gv.unit_id is null
on conflict do nothing;

update public.governance_proposals gp
set
  eligibility_count = case
    when gp.voting_basis = 'one_per_owner' then (
      select count(distinct s.eligible_user_id)
      from public.governance_eligibility_snapshots s
      where s.proposal_id = gp.id
    )
    else (
      select count(distinct s.unit_id)
      from public.governance_eligibility_snapshots s
      where s.proposal_id = gp.id
    )
  end,
  eligibility_captured_at = now(),
  eligibility_snapshot_source = 'migration_backfill'
where gp.status <> 'draft'
  and gp.eligibility_captured_at is null;

create function public.capture_governance_eligibility(
  target_condominium uuid,
  target_proposal uuid
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
  captured integer;
  captured_at_value timestamptz := now();
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

  if proposal.status <> 'draft' then
    raise exception 'governance eligibility can only be captured from draft';
  end if;

  if proposal.eligibility_captured_at is not null
    or exists (
      select 1
      from public.governance_eligibility_snapshots s
      where s.proposal_id = proposal.id
    )
  then
    raise exception 'governance eligibility already captured';
  end if;

  if proposal.voting_basis = 'one_per_owner' then
    insert into public.governance_eligibility_snapshots (
      proposal_id,
      condominium_id,
      voting_basis,
      eligible_user_id,
      unit_id,
      label,
      captured_at
    )
    select distinct on (p.auth_user_id)
      proposal.id,
      target_condominium,
      proposal.voting_basis,
      p.auth_user_id,
      null,
      coalesce(
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
        p.email,
        p.auth_user_id::text
      ),
      captured_at_value
    from public.unit_owners uo
    join public.units u
      on u.id = uo.unit_id
      and u.condominium_id = target_condominium
      and u.status = 'active'
    join public.people p
      on p.id = uo.person_id
      and p.condominium_id = target_condominium
      and p.auth_user_id is not null
      and p.status = 'active'
    where uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
    order by p.auth_user_id, u.code;

    select count(distinct eligible_user_id)
    into captured
    from public.governance_eligibility_snapshots
    where proposal_id = proposal.id;
  else
    insert into public.governance_eligibility_snapshots (
      proposal_id,
      condominium_id,
      voting_basis,
      eligible_user_id,
      unit_id,
      label,
      captured_at
    )
    select distinct on (u.id, p.auth_user_id)
      proposal.id,
      target_condominium,
      proposal.voting_basis,
      p.auth_user_id,
      u.id,
      u.code,
      captured_at_value
    from public.unit_owners uo
    join public.units u
      on u.id = uo.unit_id
      and u.condominium_id = target_condominium
      and u.status = 'active'
    join public.people p
      on p.id = uo.person_id
      and p.condominium_id = target_condominium
      and p.auth_user_id is not null
      and p.status = 'active'
    where uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
    order by u.id, p.auth_user_id;

    select count(distinct unit_id)
    into captured
    from public.governance_eligibility_snapshots
    where proposal_id = proposal.id;
  end if;

  update public.governance_proposals
  set
    eligibility_count = coalesce(captured, 0),
    eligibility_captured_at = captured_at_value,
    eligibility_snapshot_source = 'lifecycle'
  where id = proposal.id;

  return coalesce(captured, 0);
end;
$$;

revoke execute on function public.capture_governance_eligibility(uuid, uuid) from public;
revoke execute on function public.capture_governance_eligibility(uuid, uuid) from anon, authenticated;

create or replace function public.get_governance_eligibility(
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
  eligible_units jsonb := '[]'::jsonb;
  voter_eligible boolean := false;
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
    select exists (
      select 1
      from public.governance_eligibility_snapshots s
      where s.proposal_id = proposal.id
        and s.eligible_user_id = auth.uid()
    )
    into voter_eligible;

    if proposal.voting_basis = 'one_per_unit' then
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', rows.unit_id, 'code', rows.label)
          order by rows.label, rows.unit_id
        ),
        '[]'::jsonb
      )
      into eligible_units
      from (
        select distinct s.unit_id, s.label
        from public.governance_eligibility_snapshots s
        where s.proposal_id = proposal.id
          and s.eligible_user_id = auth.uid()
          and s.unit_id is not null
      ) rows;
    end if;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', rows.id, 'code', rows.code)
        order by rows.code
      ),
      '[]'::jsonb
    )
    into eligible_units
    from (
      select distinct u.id, u.code
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
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
    ) rows;

    voter_eligible := jsonb_array_length(eligible_units) > 0;
  end if;

  return jsonb_build_object(
    'basis', proposal.voting_basis,
    'eligible', voter_eligible,
    'units', case
      when proposal.voting_basis = 'one_per_unit' then eligible_units
      else '[]'::jsonb
    end,
    'eligible_count', proposal.eligibility_count,
    'snapshot_captured_at', proposal.eligibility_captured_at,
    'snapshot_source', proposal.eligibility_snapshot_source,
    'votes', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', gv.id,
            'option_id', gv.option_id,
            'unit_id', gv.unit_id,
            'cast_at', gv.cast_at
          )
          order by gv.cast_at
        ),
        '[]'::jsonb
      )
      from public.governance_votes gv
      where gv.proposal_id = target_proposal
        and gv.user_id = auth.uid()
    )
  );
end;
$$;

create or replace function public.cast_governance_vote(
  target_condominium uuid,
  target_proposal uuid,
  target_option uuid,
  target_unit uuid default null
)
returns public.governance_votes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  proposal public.governance_proposals;
  created_vote public.governance_votes;
begin
  if auth.uid() is null or not public.can_read_governance(target_condominium) then
    raise exception 'governance membership required';
  end if;

  select *
  into proposal
  from public.governance_proposals
  where id = target_proposal
    and condominium_id = target_condominium
  for update;

  if proposal.id is null
    or proposal.status <> 'open'
    or coalesce(proposal.opens_at, proposal.created_at) > now()
    or proposal.closes_at <= now()
  then
    raise exception 'proposal is not open for voting';
  end if;

  if proposal.eligibility_captured_at is null then
    raise exception 'governance eligibility snapshot required';
  end if;

  if not exists (
    select 1
    from public.governance_options go
    where go.id = target_option
      and go.proposal_id = proposal.id
      and go.condominium_id = target_condominium
  ) then
    raise exception 'invalid voting option';
  end if;

  if proposal.voting_basis = 'one_per_owner' then
    if target_unit is not null then
      raise exception 'unit is not valid for owner voting';
    end if;

    if not exists (
      select 1
      from public.governance_eligibility_snapshots s
      where s.proposal_id = proposal.id
        and s.condominium_id = target_condominium
        and s.voting_basis = 'one_per_owner'
        and s.eligible_user_id = auth.uid()
    ) then
      raise exception 'snapshotted ownership required';
    end if;
  else
    if target_unit is null or not exists (
      select 1
      from public.governance_eligibility_snapshots s
      where s.proposal_id = proposal.id
        and s.condominium_id = target_condominium
        and s.voting_basis = 'one_per_unit'
        and s.eligible_user_id = auth.uid()
        and s.unit_id = target_unit
    ) then
      raise exception 'snapshotted unit ownership required';
    end if;
  end if;

  insert into public.governance_votes (
    proposal_id,
    option_id,
    condominium_id,
    user_id,
    unit_id
  )
  values (
    proposal.id,
    target_option,
    target_condominium,
    auth.uid(),
    target_unit
  )
  returning * into created_vote;

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
    'vote_cast',
    auth.uid(),
    jsonb_build_object('unit_id', target_unit)
  );

  return created_vote;
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
      order by option_rows.sort_order, option_rows.label
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
    'snapshot_captured_at', proposal.eligibility_captured_at,
    'snapshot_source', proposal.eligibility_snapshot_source,
    'options', options_result
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
  decision_payload jsonb;
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

    perform public.capture_governance_eligibility(target_condominium, target_proposal);
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

    decision_payload := public.get_governance_decision(target_condominium, target_proposal);
    automatic_decision := decision_payload ->> 'decision';

    if automatic_decision = 'no_quorum' then
      raise exception 'proposal quorum not met';
    elsif automatic_decision = 'tie' then
      raise exception 'proposal result is tied';
    elsif automatic_decision <> action_name then
      raise exception 'proposal result requires %', automatic_decision;
    end if;

    next_status := case
      when action_name = 'approve' then 'approved'::public.governance_proposal_status
      else 'rejected'::public.governance_proposal_status
    end;
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
    decision_snapshot = case
      when action_name in ('approve', 'reject') then decision_payload
      else decision_snapshot
    end,
    certified_at = case
      when action_name in ('approve', 'reject') then now()
      else certified_at
    end,
    certified_by = case
      when action_name in ('approve', 'reject') then auth.uid()
      else certified_by
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
        coalesce(decision_payload, '{}'::jsonb) || jsonb_build_object('override', false)
      when action_name = 'open' then
        jsonb_build_object(
          'eligible_count', proposal.eligibility_count,
          'snapshot_captured_at', proposal.eligibility_captured_at,
          'snapshot_source', proposal.eligibility_snapshot_source
        )
      else '{}'::jsonb
    end
  );

  return proposal;
end;
$$;

create or replace function public.override_governance_proposal_decision(
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
  decision_payload jsonb;
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

  decision_payload := public.get_governance_decision(target_condominium, target_proposal);
  next_status := case
    when decision_name = 'approve' then 'approved'::public.governance_proposal_status
    else 'rejected'::public.governance_proposal_status
  end;
  event_name := case when decision_name = 'approve' then 'approved' else 'rejected' end;

  update public.governance_proposals
  set
    status = next_status,
    closed_at = coalesce(closed_at, now()),
    decision_snapshot = decision_payload || jsonb_build_object(
      'override', true,
      'reason', trim(reason_value),
      'override_decision', decision_name
    ),
    certified_at = now(),
    certified_by = auth.uid(),
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
    decision_payload || jsonb_build_object(
      'override', true,
      'reason', trim(reason_value),
      'override_decision', decision_name
    )
  );

  return proposal;
end;
$$;
