-- HAB-PILOT-001-R6 follow-up: do not expose the owner-parameter helper as an
-- authenticated RPC. Its former signature allowed a staff caller to probe
-- whether an arbitrary user ID had staff membership in a condominium.
create or replace function public.can_manage_payment_draft_by_id(
  target uuid,
  target_payment uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.payments p
    where p.id = target_payment
      and p.condominium_id = target
      and p.status in ('draft', 'correction_requested')
      and public.can_manage_payment_draft(target, p.submitted_by_user_id)
  );
$$;

-- The arbitrary-owner primitive remains available to SECURITY DEFINER payment
-- commands and the backend role, but is no longer an authenticated RPC.
revoke all on function public.is_payment_staff_owner(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_payment_staff_owner(uuid, uuid)
  to service_role;

revoke all on function public.can_manage_payment_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.can_manage_payment_draft(uuid, uuid)
  to service_role;

revoke all on function public.can_manage_payment_draft_by_id(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_manage_payment_draft_by_id(uuid, uuid)
  to authenticated, service_role;

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
for select to authenticated
using (
  (status <> 'draft' and (public.can_review_payments(condominium_id) or public.can_submit_payment(unit_id)))
  or (status = 'draft' and public.can_manage_payment_draft_by_id(condominium_id, id))
);

drop policy if exists proofs_read on public.payment_proofs;
create policy proofs_read on public.payment_proofs
for select to authenticated
using (
  exists (
    select 1 from public.payments p
    where p.id = payment_proofs.payment_id
      and ((p.status <> 'draft' and (public.can_review_payments(p.condominium_id) or public.can_submit_payment(p.unit_id)))
        or (p.status = 'draft' and public.can_manage_payment_draft_by_id(p.condominium_id, p.id)))
  )
);

drop policy if exists payment_allocation_intents_read on public.payment_allocation_intents;
create policy payment_allocation_intents_read on public.payment_allocation_intents
for select to authenticated
using (
  exists (
    select 1 from public.payments p
    where p.id = payment_allocation_intents.payment_id
      and p.condominium_id = payment_allocation_intents.condominium_id
      and ((p.status in ('draft', 'correction_requested')
          and public.can_manage_payment_draft_by_id(p.condominium_id, p.id))
        or (p.status not in ('draft', 'correction_requested')
          and (public.can_review_payments(p.condominium_id) or public.can_submit_payment(p.unit_id))))
  )
);

comment on function public.can_manage_payment_draft_by_id(uuid, uuid) is
  'R6 caller-scoped draft-management predicate; the arbitrary-owner helper is not an authenticated RPC.';

-- Some existing project/default privileges can expose the internal receipt
-- counter despite historical revokes. This is a backend-only serialization
-- mechanism and must never be readable or writable by client roles.
alter table public.payment_receipt_sequences enable row level security;
revoke all on table public.payment_receipt_sequences from public, anon, authenticated;
