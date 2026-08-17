-- HAB-200: improve legacy snapshot reconstruction and make ballots/events append-only.
--
-- The first HAB-200 migration performs a safe best-effort backfill. This correction uses
-- ownership validity dates at the proposal's historical opening/creation date, which is a
-- better source of truth than present-day ownership. Existing cast voters are preserved.

-- Controlled migration-only rebuild of rows marked migration_backfill.
drop trigger governance_eligibility_snapshots_immutable
  on public.governance_eligibility_snapshots;
drop trigger governance_proposals_certification_immutable
  on public.governance_proposals;

delete from public.governance_eligibility_snapshots s
using public.governance_proposals gp
where gp.id = s.proposal_id
  and gp.eligibility_snapshot_source = 'migration_backfill';

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
  on uo.starts_at <= coalesce(gp.opens_at, gp.created_at)::date
  and (
    uo.ends_at is null
    or uo.ends_at >= coalesce(gp.opens_at, gp.created_at)::date
  )
join public.units u
  on u.id = uo.unit_id
  and u.condominium_id = gp.condominium_id
join public.people p
  on p.id = uo.person_id
  and p.condominium_id = gp.condominium_id
  and p.auth_user_id is not null
where gp.status <> 'draft'
  and gp.eligibility_snapshot_source = 'migration_backfill'
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
  on uo.starts_at <= coalesce(gp.opens_at, gp.created_at)::date
  and (
    uo.ends_at is null
    or uo.ends_at >= coalesce(gp.opens_at, gp.created_at)::date
  )
join public.units u
  on u.id = uo.unit_id
  and u.condominium_id = gp.condominium_id
join public.people p
  on p.id = uo.person_id
  and p.condominium_id = gp.condominium_id
  and p.auth_user_id is not null
where gp.status <> 'draft'
  and gp.eligibility_snapshot_source = 'migration_backfill'
  and gp.voting_basis = 'one_per_unit'
order by gp.id, u.id, p.auth_user_id
on conflict do nothing;

-- Preserve every already-cast entitlement even when historical master-data changes
-- make the original owner mapping impossible to reconstruct exactly.
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
  and gp.eligibility_snapshot_source = 'migration_backfill'
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
  and gp.eligibility_snapshot_source = 'migration_backfill'
  and gp.voting_basis = 'one_per_owner'
  and gv.unit_id is null
on conflict do nothing;

update public.governance_proposals gp
set eligibility_count = case
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
end
where gp.status <> 'draft'
  and gp.eligibility_snapshot_source = 'migration_backfill';

create trigger governance_eligibility_snapshots_immutable
before update or delete on public.governance_eligibility_snapshots
for each row execute function public.reject_governance_eligibility_snapshot_mutation();

create trigger governance_proposals_certification_immutable
before update on public.governance_proposals
for each row execute function public.protect_governance_certification();

create function public.reject_governance_ballot_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'governance ballot history is immutable';
end;
$$;

revoke execute on function public.reject_governance_ballot_history_mutation() from public;

create trigger governance_votes_immutable
before update or delete on public.governance_votes
for each row execute function public.reject_governance_ballot_history_mutation();

create function public.reject_governance_event_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'governance event history is immutable';
end;
$$;

revoke execute on function public.reject_governance_event_history_mutation() from public;

create trigger governance_events_immutable
before update or delete on public.governance_events
for each row execute function public.reject_governance_event_history_mutation();

-- Once voting has opened, the electorate-defining configuration cannot be rewritten.
-- Lifecycle transitions may still update status/version/timestamps/certification fields.
create function public.protect_open_governance_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' and (
    new.voting_basis is distinct from old.voting_basis
    or new.quorum_percentage is distinct from old.quorum_percentage
    or new.opens_at is distinct from old.opens_at
    or new.closes_at is distinct from old.closes_at
  ) then
    raise exception 'opened governance voting configuration is immutable';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_open_governance_configuration() from public;

create trigger governance_proposals_open_configuration_immutable
before update on public.governance_proposals
for each row execute function public.protect_open_governance_configuration();
