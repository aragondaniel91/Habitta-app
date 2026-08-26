create or replace function public.update_financial_scope(
  target uuid,
  target_scope uuid,
  scope_code text,
  scope_name text,
  scope_kind public.financial_scope_kind,
  target_building uuid default null,
  target_units uuid[] default null,
  scope_active boolean default true
)
returns public.financial_scopes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_scope public.financial_scopes;
  updated_scope public.financial_scopes;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  select * into current_scope
  from public.financial_scopes
  where id = target_scope
    and condominium_id = target
  for update;

  if current_scope.id is null then
    raise exception 'financial scope unavailable';
  end if;

  if trim(scope_code) = '' or trim(scope_name) = '' then
    raise exception 'scope code and name are required';
  end if;

  if (scope_kind = 'building' and target_building is null)
    or (scope_kind <> 'building' and target_building is not null)
    or (scope_kind = 'custom' and coalesce(cardinality(target_units), 0) = 0)
    or (scope_kind <> 'custom' and target_units is not null)
  then
    raise exception 'invalid financial scope configuration';
  end if;

  if scope_kind = 'building' and not exists (
    select 1
    from public.buildings b
    where b.id = target_building
      and b.condominium_id = target
  ) then
    raise exception 'building and financial scope must share condominium';
  end if;

  if scope_kind = 'custom' and exists (
    select 1
    from unnest(target_units) unit_id
    where not exists (
      select 1
      from public.units u
      where u.id = unit_id
        and u.condominium_id = target
    )
  ) then
    raise exception 'scope unit and financial scope must share condominium';
  end if;

  if exists (
    select 1
    from public.recurring_charge_plans p
    join public.recurring_charge_runs r
      on r.plan_id = p.id
     and r.condominium_id = p.condominium_id
    where p.condominium_id = target
      and p.financial_scope_id = current_scope.id
      and r.status = 'pending_review'
  ) then
    raise exception 'financial scope has pending review run';
  end if;

  if not scope_active and exists (
    select 1
    from public.recurring_charge_plans p
    where p.condominium_id = target
      and p.financial_scope_id = current_scope.id
      and p.status = 'active'
  ) then
    raise exception 'active recurring plan requires financial scope';
  end if;

  update public.financial_scopes
  set code = lower(trim(scope_code)),
      name = trim(scope_name),
      kind = scope_kind,
      building_id = target_building,
      is_active = scope_active,
      updated_at = now()
  where id = current_scope.id
  returning * into updated_scope;

  delete from public.financial_scope_units
  where scope_id = current_scope.id
    and condominium_id = target;

  if scope_kind = 'custom' then
    insert into public.financial_scope_units (
      scope_id,
      condominium_id,
      unit_id,
      created_by
    )
    select
      current_scope.id,
      target,
      selected.unit_id,
      auth.uid()
    from (
      select distinct unit_id
      from unnest(target_units) unit_id
    ) selected;
  end if;

  return updated_scope;
end;
$$;

revoke all on function public.update_financial_scope(
  uuid,
  uuid,
  text,
  text,
  public.financial_scope_kind,
  uuid,
  uuid[],
  boolean
) from public, anon;

grant execute on function public.update_financial_scope(
  uuid,
  uuid,
  text,
  text,
  public.financial_scope_kind,
  uuid,
  uuid[],
  boolean
) to authenticated;
