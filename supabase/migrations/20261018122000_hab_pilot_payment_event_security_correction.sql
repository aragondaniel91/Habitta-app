-- HAB-PILOT-001-R5: restore the review-only payment-event audience.  Parent
-- payment visibility remains an invoker RLS check in the table policy.  The
-- audit feed applies the equivalent payment visibility predicate before its
-- unified feed is ordered and paginated.

drop policy if exists payment_events_read on public.payment_events;
create policy payment_events_read on public.payment_events
for select to authenticated
using (
  public.can_review_payments(condominium_id)
  and exists (
    select 1
    from public.payments p
    where p.id = payment_events.payment_id
      and p.condominium_id = payment_events.condominium_id
  )
);

create or replace function public.list_admin_audit_events(
  target_condominium uuid, filter_module text default null,
  filter_actor uuid default null, filter_entity_type text default null,
  from_at timestamptz default null, to_at timestamptz default null,
  result_limit integer default 50, result_offset integer default 0,
  filter_severity text default null
)
returns table (
  event_id uuid, occurred_at timestamptz, actor_user_id uuid, module text,
  entity_type text, entity_id uuid, action text, severity text, summary text,
  metadata jsonb, correlation_id text
)
language plpgsql stable security definer
set search_path = public set row_security = off
as $$
begin
  if auth.uid() is null or not public.can_read_admin_audit_log(target_condominium) then
    raise exception 'not authorized to read administrator audit log';
  end if;
  if filter_module is not null and filter_module not in ('payments', 'expenses', 'treasury', 'maintenance', 'governance', 'assemblies') then
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
  with normalized(event_id, occurred_at, actor_user_id, module, entity_type, entity_id,
    action, severity, summary, metadata, correlation_id) as (
    select pe.id, pe.occurred_at, pe.actor_user_id, 'payments'::text,
      'payment'::text, pe.payment_id, pe.event_type::text,
      case when pe.event_type in ('correction_requested', 'rejected', 'reversed') then 'warning' else 'info' end::text,
      ('Pago · ' || replace(pe.event_type, '_', ' '))::text,
      jsonb_strip_nulls(jsonb_build_object('previous_status', pe.previous_status, 'new_status', pe.new_status,
        'unit_id', pe.metadata -> 'unit_id', 'amount', pe.metadata -> 'amount',
        'currency_code', pe.metadata -> 'currency_code')),
      null::text
    from public.payment_events pe
    join public.payments p on p.id = pe.payment_id and p.condominium_id = pe.condominium_id
    where pe.condominium_id = target_condominium
      -- SECURITY DEFINER bypasses table RLS, so retain its predicate explicitly.
      and ((p.status <> 'draft' and (public.can_review_payments(p.condominium_id) or public.can_submit_payment(p.unit_id)))
        or (p.status = 'draft' and public.can_manage_payment_draft(p.condominium_id, p.submitted_by_user_id)))

    union all
    select ee.id, ee.occurred_at, ee.actor_user_id, 'expenses'::text, 'expense'::text, ee.expense_id,
      ee.event_type::text, case when ee.event_type = 'voided' then 'warning' else 'info' end::text,
      ('Gasto · ' || replace(ee.event_type, '_', ' '))::text, '{}'::jsonb, null::text
    from public.expense_events ee where ee.condominium_id = target_condominium

    union all
    select te.id, te.occurred_at, te.actor_user_id, 'treasury'::text, te.entity_type::text, te.entity_id,
      te.event_type::text, case when te.event_type = 'movement_reversed' then 'warning' else 'info' end::text,
      ('Tesorería · ' || replace(te.event_type, '_', ' '))::text, '{}'::jsonb, null::text
    from public.treasury_events te where te.condominium_id = target_condominium

    union all
    select me.id, me.occurred_at, me.actor_user_id, 'maintenance'::text, me.entity_type::text, me.entity_id,
      me.event_type::text, case when me.event_type::text in ('cancelled', 'failed', 'overdue') then 'warning' else 'info' end::text,
      ('Mantenimiento · ' || replace(me.event_type::text, '_', ' '))::text, '{}'::jsonb, null::text
    from public.maintenance_events me where me.condominium_id = target_condominium

    union all
    select ge.id, ge.occurred_at, ge.actor_user_id, 'governance'::text, 'proposal'::text, ge.proposal_id,
      ge.event_type::text, case when ge.event_type in ('rejected', 'archived') then 'warning' else 'info' end::text,
      ('Gobernanza · ' || replace(ge.event_type, '_', ' '))::text, '{}'::jsonb, null::text
    from public.governance_events ge where ge.condominium_id = target_condominium

    union all
    select ae.id, ae.occurred_at, ae.actor_user_id, 'assemblies'::text, 'assembly'::text, ae.assembly_id,
      ae.event_type::text, case when ae.event_type = 'cancelled' then 'warning' else 'info' end::text,
      ('Asamblea · ' || replace(ae.event_type, '_', ' '))::text, '{}'::jsonb, null::text
    from public.assembly_events ae where ae.condominium_id = target_condominium
  )
  select n.* from normalized n
  where (filter_module is null or n.module = filter_module)
    and (filter_actor is null or n.actor_user_id = filter_actor)
    and (filter_entity_type is null or n.entity_type = filter_entity_type)
    and (filter_severity is null or n.severity = filter_severity)
    and (from_at is null or n.occurred_at >= from_at)
    and (to_at is null or n.occurred_at <= to_at)
  order by n.occurred_at desc, n.module asc, n.event_id desc
  limit result_limit offset result_offset;
end;
$$;

-- R4 renamed the historical privileged implementation.  It is no longer used;
-- remove it rather than leave a callable or discoverable bypass behind.
drop function if exists public.list_admin_audit_events_unfiltered(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
);

revoke execute on function public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) from public;
grant execute on function public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) to authenticated, service_role;

comment on policy payment_events_read on public.payment_events is
  'HAB-PILOT-001-R5: reviewer-only event access requires invoker visibility of the parent payment.';
