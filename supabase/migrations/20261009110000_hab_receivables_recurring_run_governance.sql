-- Founder-approved governance recovery for recurring charge review runs.
-- Returned allocations become editable/preparable again; posted financial history remains immutable.

create table public.recurring_charge_run_governance_events (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  run_id uuid not null,
  action text not null check (action in ('returned_for_correction', 'cancelled')),
  reason text not null check (length(trim(reason)) > 0),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (run_id, condominium_id)
    references public.recurring_charge_runs(id, condominium_id) on delete restrict
);

create index recurring_charge_run_governance_events_run_idx
  on public.recurring_charge_run_governance_events (run_id, created_at desc);

alter table public.recurring_charge_run_governance_events enable row level security;

create policy recurring_charge_run_governance_events_read
  on public.recurring_charge_run_governance_events
  for select using (public.can_read_receivables(condominium_id));

revoke all on public.recurring_charge_run_governance_events from public, anon, authenticated;
grant select on public.recurring_charge_run_governance_events to authenticated;

-- Defence in depth for HAB-003: recurring ordinary dues may never use an extraordinary/one-off concept.
create or replace function public.assert_recurring_plan_regular_dues_concept()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1 from public.charge_concepts c
    where c.id = new.concept_id
      and c.condominium_id = new.condominium_id
      and c.category = 'regular_dues'
  ) then
    raise exception 'recurring charge plan requires regular dues concept';
  end if;
  return new;
end;
$$;

drop trigger if exists recurring_plan_regular_dues_concept on public.recurring_charge_plans;
create trigger recurring_plan_regular_dues_concept
before insert or update of concept_id, condominium_id on public.recurring_charge_plans
for each row execute function public.assert_recurring_plan_regular_dues_concept();

create or replace function public.return_recurring_charge_run_for_correction(
  target_run uuid,
  return_reason text
)
returns public.recurring_charge_runs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.recurring_charge_runs;
  normalized_reason text := trim(coalesce(return_reason, ''));
begin
  select * into run from public.recurring_charge_runs where id = target_run for update;
  if run.id is null or auth.uid() is null or not public.can_manage_receivables(run.condominium_id) then
    raise exception 'permission denied';
  end if;
  if normalized_reason = '' then
    raise exception 'recurring run governance reason is required';
  end if;
  if run.status <> 'pending_review' then
    raise exception 'only pending review recurring runs can be returned for correction';
  end if;

  update public.recurring_charge_runs
  set status = 'scheduled', distribution_snapshot = null, total_amount = null,
      prepared_at = null, prepared_by = null, updated_at = now()
  where id = run.id
  returning * into run;

  insert into public.recurring_charge_run_governance_events
    (condominium_id, run_id, action, reason, actor_id)
  values (run.condominium_id, run.id, 'returned_for_correction', normalized_reason, auth.uid());

  perform public.emit_integration_outbox_event(
    run.condominium_id, 'finance.recurring_charge.returned_for_correction',
    'recurring_charge_run', run.id,
    jsonb_build_object('run_id', run.id, 'plan_id', run.plan_id, 'period', run.period,
      'reason', normalized_reason, 'actor_id', auth.uid()),
    'recurring-charge-returned-for-correction:' || run.id::text || ':' || txid_current()::text
  );
  return run;
end;
$$;

create or replace function public.cancel_recurring_charge_run(
  target_run uuid,
  cancellation_reason text
)
returns public.recurring_charge_runs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.recurring_charge_runs;
  normalized_reason text := trim(coalesce(cancellation_reason, ''));
begin
  select * into run from public.recurring_charge_runs where id = target_run for update;
  if run.id is null or auth.uid() is null or not public.can_manage_receivables(run.condominium_id) then
    raise exception 'permission denied';
  end if;
  if normalized_reason = '' then
    raise exception 'recurring run governance reason is required';
  end if;
  if run.status = 'cancelled' then return run; end if;
  if run.status = 'posted' then raise exception 'posted recurring charge runs are immutable'; end if;
  -- Every other value of recurring_charge_run_status is 'scheduled' or 'pending_review', both
  -- cancellable; there is no fifth status to guard against.

  update public.recurring_charge_runs set status = 'cancelled', updated_at = now()
  where id = run.id returning * into run;
  insert into public.recurring_charge_run_governance_events
    (condominium_id, run_id, action, reason, actor_id)
  values (run.condominium_id, run.id, 'cancelled', normalized_reason, auth.uid());
  perform public.emit_integration_outbox_event(
    run.condominium_id, 'finance.recurring_charge.cancelled', 'recurring_charge_run', run.id,
    jsonb_build_object('run_id', run.id, 'plan_id', run.plan_id, 'period', run.period,
      'reason', normalized_reason, 'actor_id', auth.uid()),
    'recurring-charge-cancelled:' || run.id::text || ':' || txid_current()::text
  );
  return run;
end;
$$;

revoke all on function public.return_recurring_charge_run_for_correction(uuid, text) from public, anon;
revoke all on function public.cancel_recurring_charge_run(uuid, text) from public, anon;
grant execute on function public.return_recurring_charge_run_for_correction(uuid, text) to authenticated;
grant execute on function public.cancel_recurring_charge_run(uuid, text) to authenticated;
