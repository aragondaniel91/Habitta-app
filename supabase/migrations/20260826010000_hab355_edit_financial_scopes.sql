-- HAB-355: financial scopes must be correctable without corrupting recurring allocations.
--
-- Scope edits are prospective by design. Runs that were already reviewed (`pending_review`) or
-- published (`posted`) keep the distribution snapshot they were approved with; only periods that
-- have not been prepared yet observe the new membership. Direct table writes stay revoked so the
-- guards below cannot be bypassed.
--
-- Uniqueness is validated explicitly instead of letting Postgres surface `23505` with a
-- constraint name: the administrator needs to know that a code is taken, not read internals.

create or replace function public.assert_financial_scope_shape(
  target uuid,
  scope_kind public.financial_scope_kind,
  target_building uuid,
  target_units uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if (scope_kind = 'building' and target_building is null)
    or (scope_kind <> 'building' and target_building is not null)
    or (scope_kind <> 'custom' and coalesce(cardinality(target_units), 0) > 0)
  then
    raise exception 'invalid financial scope configuration';
  end if;

  if scope_kind = 'custom' and coalesce(cardinality(target_units), 0) = 0 then
    raise exception 'custom financial scope requires units';
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
    from unnest(target_units) as candidate(unit_id)
    where not exists (
      select 1
      from public.units u
      where u.id = candidate.unit_id
        and u.condominium_id = target
    )
  ) then
    raise exception 'scope unit and financial scope must share condominium';
  end if;
end;
$$;

revoke all on function public.assert_financial_scope_shape(
  uuid,
  public.financial_scope_kind,
  uuid,
  uuid[]
) from public, anon, authenticated;

-- Uniqueness guards mirror the table constraints so the API can return an actionable message.
create or replace function public.assert_financial_scope_uniqueness(
  target uuid,
  scope_code text,
  scope_kind public.financial_scope_kind,
  target_building uuid,
  exclude_scope uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if exists (
    select 1
    from public.financial_scopes s
    where s.condominium_id = target
      and s.code = lower(trim(scope_code))
      and (exclude_scope is null or s.id <> exclude_scope)
  ) then
    raise exception 'financial scope code already exists';
  end if;

  if scope_kind = 'condominium' and exists (
    select 1
    from public.financial_scopes s
    where s.condominium_id = target
      and s.kind = 'condominium'
      and (exclude_scope is null or s.id <> exclude_scope)
  ) then
    raise exception 'condominium financial scope already exists';
  end if;

  if scope_kind = 'building' and exists (
    select 1
    from public.financial_scopes s
    where s.condominium_id = target
      and s.kind = 'building'
      and s.building_id = target_building
      and (exclude_scope is null or s.id <> exclude_scope)
  ) then
    raise exception 'building financial scope already exists';
  end if;
end;
$$;

revoke all on function public.assert_financial_scope_uniqueness(
  uuid,
  text,
  public.financial_scope_kind,
  uuid,
  uuid
) from public, anon, authenticated;

-- Creation reuses the shared guards so create and edit fail with identical domain vocabulary.
create or replace function public.create_financial_scope(
  target uuid,
  scope_code text,
  scope_name text,
  scope_kind public.financial_scope_kind default 'condominium',
  target_building uuid default null,
  target_units uuid[] default null
)
returns public.financial_scopes
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  scope public.financial_scopes;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  if coalesce(trim(scope_code), '') = '' or coalesce(trim(scope_name), '') = '' then
    raise exception 'scope code and name are required';
  end if;

  perform public.assert_financial_scope_shape(target, scope_kind, target_building, target_units);
  perform public.assert_financial_scope_uniqueness(
    target,
    scope_code,
    scope_kind,
    target_building,
    null
  );

  insert into public.financial_scopes (
    condominium_id,
    kind,
    building_id,
    code,
    name,
    created_by
  )
  values (
    target,
    scope_kind,
    target_building,
    lower(trim(scope_code)),
    trim(scope_name),
    auth.uid()
  )
  returning * into scope;

  if scope_kind = 'custom' then
    insert into public.financial_scope_units (scope_id, condominium_id, unit_id, created_by)
    select scope.id, target, selected.unit_id, auth.uid()
    from (select distinct unit_id from unnest(target_units) as source(unit_id)) selected;
  end if;

  return scope;
end;
$$;

create or replace function public.update_financial_scope(
  target uuid,
  target_scope uuid,
  scope_code text,
  scope_name text,
  scope_kind public.financial_scope_kind,
  target_building uuid default null,
  target_units uuid[] default null,
  scope_active boolean default null
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
  next_active boolean;
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

  -- A caller that omits the flag must never silently reactivate an archived scope.
  next_active := coalesce(scope_active, current_scope.is_active);

  if coalesce(trim(scope_code), '') = '' or coalesce(trim(scope_name), '') = '' then
    raise exception 'scope code and name are required';
  end if;

  perform public.assert_financial_scope_shape(target, scope_kind, target_building, target_units);
  perform public.assert_financial_scope_uniqueness(
    target,
    scope_code,
    scope_kind,
    target_building,
    current_scope.id
  );

  -- A reviewed allocation is already frozen for its period. Editing the scope underneath it would
  -- leave the reviewer approving one distribution and the ledger receiving another.
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

  if not next_active and exists (
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
      is_active = next_active,
      updated_at = now()
  where id = current_scope.id
  returning * into updated_scope;

  -- Membership is replaced wholesale inside the same transaction: a scope never observes a
  -- partially applied unit list, and leaving `custom` always clears the previous membership.
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
    from (select distinct unit_id from unnest(target_units) as source(unit_id)) selected;
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
