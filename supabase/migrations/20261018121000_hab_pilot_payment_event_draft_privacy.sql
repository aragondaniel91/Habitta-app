-- HAB-PILOT-001-R4: event metadata includes unit and amount, so it must never
-- outlive the caller's visibility of its parent payment.  The parent lookup is
-- deliberately an ordinary invoker query: payments RLS is the single source of
-- truth for draft visibility.

drop policy if exists payment_events_read on public.payment_events;
create policy payment_events_read on public.payment_events
for select to authenticated
using (
  exists (
    select 1
    from public.payments p
    where p.id = payment_events.payment_id
      and p.condominium_id = payment_events.condominium_id
  )
);

-- This historical read model is SECURITY DEFINER and intentionally bypasses
-- table RLS for its other audit modules.  Keep its public RPC name/signature,
-- but place the old implementation behind a private name so payment events can
-- be filtered with the caller's equivalent parent-payment access rule.
alter function public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) rename to list_admin_audit_events_unfiltered;

revoke all on function public.list_admin_audit_events_unfiltered(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) from public, anon, authenticated, service_role;

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
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select audit.*
  from public.list_admin_audit_events_unfiltered(
    target_condominium,
    filter_module,
    filter_actor,
    filter_entity_type,
    from_at,
    to_at,
    result_limit,
    result_offset,
    filter_severity
  ) audit
  where audit.module <> 'payments'
     or exists (
       select 1
       from public.payments p
       where p.id = audit.entity_id
         and p.condominium_id = target_condominium
         and (
           (
             p.status <> 'draft'
             and (
               public.can_review_payments(p.condominium_id)
               or public.can_submit_payment(p.unit_id)
             )
           )
           or (
             p.status = 'draft'
             and public.can_manage_payment_draft(p.condominium_id, p.submitted_by_user_id)
           )
         )
     );
$$;

revoke execute on function public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) from public;
grant execute on function public.list_admin_audit_events(
  uuid, text, uuid, text, timestamptz, timestamptz, integer, integer, text
) to authenticated, service_role;

comment on policy payment_events_read on public.payment_events is
  'HAB-PILOT-001-R4: authenticated callers may read events only when invoker RLS exposes the parent payment.';
