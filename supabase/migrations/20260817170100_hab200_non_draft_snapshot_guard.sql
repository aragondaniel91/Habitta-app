-- HAB-200: direct non-draft inserts are migration/import paths, never the normal app lifecycle.
-- Capture a best-effort immutable snapshot immediately so such rows cannot later calculate
-- quorum from mutable current ownership. Normal application creation starts in draft and
-- uses capture_governance_eligibility() during the guarded open transition.

create function public.snapshot_inserted_non_draft_governance_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  captured integer := 0;
  captured_at_value timestamptz := now();
begin
  if new.status = 'draft' or new.eligibility_captured_at is not null then
    return new;
  end if;

  if new.voting_basis = 'one_per_owner' then
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
      new.id,
      new.condominium_id,
      new.voting_basis,
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
      and u.condominium_id = new.condominium_id
      and u.status = 'active'
    join public.people p
      on p.id = uo.person_id
      and p.condominium_id = new.condominium_id
      and p.auth_user_id is not null
      and p.status = 'active'
    where uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
    order by p.auth_user_id, u.code;

    select count(distinct eligible_user_id)
    into captured
    from public.governance_eligibility_snapshots
    where proposal_id = new.id;
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
      new.id,
      new.condominium_id,
      new.voting_basis,
      p.auth_user_id,
      u.id,
      u.code,
      captured_at_value
    from public.unit_owners uo
    join public.units u
      on u.id = uo.unit_id
      and u.condominium_id = new.condominium_id
      and u.status = 'active'
    join public.people p
      on p.id = uo.person_id
      and p.condominium_id = new.condominium_id
      and p.auth_user_id is not null
      and p.status = 'active'
    where uo.starts_at <= current_date
      and (uo.ends_at is null or uo.ends_at >= current_date)
    order by u.id, p.auth_user_id;

    select count(distinct unit_id)
    into captured
    from public.governance_eligibility_snapshots
    where proposal_id = new.id;
  end if;

  update public.governance_proposals
  set
    eligibility_count = coalesce(captured, 0),
    eligibility_captured_at = captured_at_value,
    eligibility_snapshot_source = 'migration_backfill'
  where id = new.id;

  return new;
end;
$$;

revoke execute on function public.snapshot_inserted_non_draft_governance_proposal() from public;

create trigger governance_proposals_snapshot_direct_non_draft_insert
after insert on public.governance_proposals
for each row execute function public.snapshot_inserted_non_draft_governance_proposal();
