-- HAB-175: complete the administrator audit filter contract with server-side severity filtering.
-- The existing function is replaced instead of overloaded so PostgREST has one unambiguous RPC.

drop function if exists public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer
);

create function public.list_admin_audit_events(
  target_condominium uuid,
  filter_module text default null,
  filter_actor uuid default null,
  filter_entity_type text default null,
  from_at timestamptz default null,
  to_at timestamptz default null,
  result_limit integer default 50,
  result_offset integer default 0,
  filter_severity text default null
)
returns table (
  event_id uuid,
  occurred_at timestamptz,
  actor_user_id uuid,
  module text,
  entity_type text,
  entity_id uuid,
  action text,
  severity text,
  summary text,
  metadata jsonb,
  correlation_id text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.can_read_admin_audit_log(target_condominium) then
    raise exception 'not authorized to read administrator audit log';
  end if;

  if filter_module is not null and filter_module not in (
    'payments', 'expenses', 'treasury', 'maintenance', 'governance', 'assemblies'
  ) then
    raise exception 'invalid audit module filter';
  end if;

  if filter_severity is not null and filter_severity not in ('info', 'warning') then
    raise exception 'invalid audit severity filter';
  end if;

  if result_limit is null or result_limit < 1 or result_limit > 100 then
    raise exception 'audit result limit must be between 1 and 100';
  end if;

  if result_offset is null or result_offset < 0 then
    raise exception 'audit result offset must be zero or greater';
  end if;

  if from_at is not null and to_at is not null and to_at < from_at then
    raise exception 'audit date range is invalid';
  end if;

  return query
  with normalized as (
    select
      pe.id as event_id,
      pe.occurred_at,
      pe.actor_user_id,
      'payments'::text as module,
      'payment'::text as entity_type,
      pe.payment_id as entity_id,
      pe.event_type::text as action,
      case
        when pe.event_type in ('correction_requested', 'rejected', 'reversed') then 'warning'
        else 'info'
      end::text as severity,
      ('Pago · ' || replace(pe.event_type, '_', ' '))::text as summary,
      jsonb_strip_nulls(jsonb_build_object(
        'previous_status', pe.previous_status,
        'new_status', pe.new_status,
        'unit_id', pe.metadata -> 'unit_id',
        'amount', pe.metadata -> 'amount',
        'currency_code', pe.metadata -> 'currency_code'
      )) as metadata,
      null::text as correlation_id
    from public.payment_events pe
    where pe.condominium_id = target_condominium

    union all

    select
      ee.id,
      ee.occurred_at,
      ee.actor_user_id,
      'expenses'::text,
      'expense'::text,
      ee.expense_id,
      ee.event_type::text,
      case when ee.event_type = 'voided' then 'warning' else 'info' end::text,
      ('Gasto · ' || replace(ee.event_type, '_', ' '))::text,
      '{}'::jsonb,
      null::text
    from public.expense_events ee
    where ee.condominium_id = target_condominium

    union all

    select
      te.id,
      te.occurred_at,
      te.actor_user_id,
      'treasury'::text,
      te.entity_type::text,
      te.entity_id,
      te.event_type::text,
      case when te.event_type = 'movement_reversed' then 'warning' else 'info' end::text,
      ('Tesorería · ' || replace(te.event_type, '_', ' '))::text,
      '{}'::jsonb,
      null::text
    from public.treasury_events te
    where te.condominium_id = target_condominium

    union all

    select
      me.id,
      me.occurred_at,
      me.actor_user_id,
      'maintenance'::text,
      me.entity_type::text,
      me.entity_id,
      me.event_type::text,
      case
        when me.event_type::text in ('cancelled', 'failed', 'overdue') then 'warning'
        else 'info'
      end::text,
      ('Mantenimiento · ' || replace(me.event_type::text, '_', ' '))::text,
      '{}'::jsonb,
      null::text
    from public.maintenance_events me
    where me.condominium_id = target_condominium

    union all

    select
      ge.id,
      ge.occurred_at,
      ge.actor_user_id,
      'governance'::text,
      'proposal'::text,
      ge.proposal_id,
      ge.event_type::text,
      case when ge.event_type in ('rejected', 'archived') then 'warning' else 'info' end::text,
      ('Gobernanza · ' || replace(ge.event_type, '_', ' '))::text,
      '{}'::jsonb,
      null::text
    from public.governance_events ge
    where ge.condominium_id = target_condominium

    union all

    select
      ae.id,
      ae.occurred_at,
      ae.actor_user_id,
      'assemblies'::text,
      'assembly'::text,
      ae.assembly_id,
      ae.event_type::text,
      case when ae.event_type = 'cancelled' then 'warning' else 'info' end::text,
      ('Asamblea · ' || replace(ae.event_type, '_', ' '))::text,
      '{}'::jsonb,
      null::text
    from public.assembly_events ae
    where ae.condominium_id = target_condominium
  )
  select
    n.event_id,
    n.occurred_at,
    n.actor_user_id,
    n.module,
    n.entity_type,
    n.entity_id,
    n.action,
    n.severity,
    n.summary,
    n.metadata,
    n.correlation_id
  from normalized n
  where (filter_module is null or n.module = filter_module)
    and (filter_actor is null or n.actor_user_id = filter_actor)
    and (filter_entity_type is null or n.entity_type = filter_entity_type)
    and (filter_severity is null or n.severity = filter_severity)
    and (from_at is null or n.occurred_at >= from_at)
    and (to_at is null or n.occurred_at <= to_at)
  order by n.occurred_at desc, n.module asc, n.event_id desc
  limit result_limit
  offset result_offset;
end;
$$;

revoke execute on function public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) from public;
grant execute on function public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) to authenticated, service_role;
