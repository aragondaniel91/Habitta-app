alter table public.budget_versions
  add column rejected_by uuid references auth.users(id),
  add column rejected_at timestamptz,
  add column rejection_reason text;

alter table public.budget_versions
  drop constraint budget_versions_check,
  add constraint budget_versions_check check (
    (status = 'draft' and submitted_at is null and approved_at is null and rejected_at is null and superseded_at is null)
    or (status = 'pending_approval' and submitted_at is not null and approved_at is null and rejected_at is null and superseded_at is null)
    or (status = 'approved' and submitted_at is not null and approved_at is not null and rejected_at is null and superseded_at is null)
    or (status = 'rejected' and submitted_at is not null and approved_at is null and rejected_by is not null and rejected_at is not null and char_length(rejection_reason) between 3 and 500 and superseded_at is null)
    or (status = 'superseded' and superseded_at is not null)
  );

alter table public.budget_events
  drop constraint budget_events_event_type_check,
  add constraint budget_events_event_type_check check (
    event_type in ('created', 'revised', 'submitted', 'approved', 'rejected', 'superseded')
  );

create or replace function public.reject_budget_version(
  target_condominium uuid,
  target_budget_period uuid,
  target_budget_version uuid,
  rejection_reason_value text
)
returns public.budget_versions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  period_row public.budget_periods;
  version_row public.budget_versions;
  normalized_reason text := trim(coalesce(rejection_reason_value, ''));
begin
  if auth.uid() is null or not public.can_approve_budgets(target_condominium) then
    raise exception 'budget approver required';
  end if;

  if char_length(normalized_reason) not between 3 and 500 then
    raise exception 'budget rejection reason must contain between 3 and 500 characters';
  end if;

  select * into period_row
  from public.budget_periods
  where id = target_budget_period
    and condominium_id = target_condominium
  for update;

  if period_row.id is null then
    raise exception 'budget period not found';
  end if;

  select * into version_row
  from public.budget_versions
  where id = target_budget_version
    and budget_period_id = period_row.id
    and condominium_id = target_condominium
  for update;

  if version_row.id is null
    or version_row.version_number <> period_row.current_version_number
    or version_row.status <> 'pending_approval'
  then
    raise exception 'current pending budget version required';
  end if;

  update public.budget_versions
  set status = 'rejected',
      rejected_by = auth.uid(),
      rejected_at = now(),
      rejection_reason = normalized_reason
  where id = version_row.id
  returning * into version_row;

  insert into public.budget_events (
    budget_period_id, budget_version_id, condominium_id, event_type, actor_user_id, metadata
  ) values (
    period_row.id, version_row.id, target_condominium, 'rejected', auth.uid(),
    jsonb_build_object('reason', normalized_reason)
  );

  return version_row;
end;
$$;

revoke execute on function public.reject_budget_version(uuid, uuid, uuid, text) from public;
grant execute on function public.reject_budget_version(uuid, uuid, uuid, text)
  to authenticated, service_role;
