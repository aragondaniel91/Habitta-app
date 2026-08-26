-- HAB-359: a recurring dues plan must be stoppable without deleting what it already published.
--
-- Until now `recurring_charge_plans.status` accepted 'active' / 'inactive' and nothing could set
-- it, so a plan created once ran forever. That is also what made HAB-355's archive guard
-- unreachable: a scope refuses to archive while an active plan depends on it, and the plan could
-- not be deactivated, leaving both objects permanently unarchivable.
--
-- Deactivation is prospective. Periods that were already posted keep their batch, snapshot,
-- receivables and ledger entries untouched. Periods that were merely scheduled carry no financial
-- effect yet -- no snapshot, no batch, no receivable -- so they are cancelled with the plan
-- instead of being left behind as orphans that could still be prepared and posted later. This is
-- the first writer of the 'cancelled' run status, which the table has always allowed.
--
-- A reviewed period is never touched: it is already frozen for approval, so the plan cannot be
-- stopped underneath it.

create or replace function public.set_recurring_charge_plan_status(
  target uuid,
  target_plan uuid,
  plan_active boolean
)
returns public.recurring_charge_plans
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_plan public.recurring_charge_plans;
  updated_plan public.recurring_charge_plans;
  next_status public.recurring_charge_plan_status;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  if plan_active is null then
    raise exception 'invalid recurring plan status';
  end if;

  select * into current_plan
  from public.recurring_charge_plans
  where id = target_plan
    and condominium_id = target
  for update;

  if current_plan.id is null then
    raise exception 'recurring plan unavailable';
  end if;

  next_status := case when plan_active then 'active' else 'inactive' end;

  if current_plan.status = next_status then
    return current_plan;
  end if;

  -- A reviewer is mid-approval on a frozen distribution. Resolve that first.
  if exists (
    select 1
    from public.recurring_charge_runs r
    where r.plan_id = current_plan.id
      and r.condominium_id = target
      and r.status = 'pending_review'
  ) then
    raise exception 'recurring plan has pending review run';
  end if;

  -- Reactivating must not resurrect a plan whose concept or scope was archived meanwhile.
  if plan_active then
    if not exists (
      select 1
      from public.charge_concepts c
      where c.id = current_plan.concept_id
        and c.condominium_id = target
        and c.is_active
    ) or not exists (
      select 1
      from public.financial_scopes s
      where s.id = current_plan.financial_scope_id
        and s.condominium_id = target
        and s.is_active
    ) then
      raise exception 'concept or financial scope unavailable';
    end if;
  end if;

  update public.recurring_charge_plans
  set status = next_status,
      updated_at = now()
  where id = current_plan.id
  returning * into updated_plan;

  -- Scheduled periods hold no financial effect yet, so stopping the plan stops them too.
  if not plan_active then
    update public.recurring_charge_runs
    set status = 'cancelled',
        updated_at = now()
    where plan_id = current_plan.id
      and condominium_id = target
      and status = 'scheduled';
  end if;

  return updated_plan;
end;
$$;

revoke all on function public.set_recurring_charge_plan_status(uuid, uuid, boolean)
  from public, anon;

grant execute on function public.set_recurring_charge_plan_status(uuid, uuid, boolean)
  to authenticated;
