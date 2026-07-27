create or replace function public.can_submit_payment(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.can_manage_people(u.condominium_id)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = u.condominium_id
        and cm.user_id = auth.uid()
        and cm.role = 'accountant'
    )
    or exists (
      select 1
      from public.unit_owners o
      join public.people p on p.id = o.person_id
      where o.unit_id = target_unit
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    )
    or exists (
      select 1
      from public.unit_occupancies o
      join public.people p on p.id = o.person_id
      where o.unit_id = target_unit
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and o.occupancy_type in ('owner_occupant', 'tenant', 'authorized_occupant')
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    )
  from public.units u
  where u.id = target_unit;
$$;

create or replace function public.can_read_payment_methods(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.can_review_payments(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and cm.role = 'assistant'
    )
    or exists (
      select 1
      from public.units u
      join public.unit_owners o on o.unit_id = u.id
      join public.people p on p.id = o.person_id
      where u.condominium_id = target
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    )
    or exists (
      select 1
      from public.units u
      join public.unit_occupancies o on o.unit_id = u.id
      join public.people p on p.id = o.person_id
      where u.condominium_id = target
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and o.occupancy_type in ('owner_occupant', 'tenant', 'authorized_occupant')
        and o.starts_at <= current_date
        and (o.ends_at is null or o.ends_at >= current_date)
    );
$$;

revoke all on function public.can_read_payment_methods(uuid) from public;
grant execute on function public.can_read_payment_methods(uuid) to authenticated, service_role;

drop policy if exists methods_read on public.condominium_payment_methods;
drop policy if exists methods_write on public.condominium_payment_methods;

create policy methods_read
on public.condominium_payment_methods
for select
using (
  public.can_review_payments(condominium_id)
  or exists (
    select 1
    from public.condominium_memberships cm
    where cm.condominium_id = condominium_payment_methods.condominium_id
      and cm.user_id = auth.uid()
      and cm.role = 'assistant'
  )
  or (is_active and public.can_read_payment_methods(condominium_id))
);

create policy methods_insert
on public.condominium_payment_methods
for insert
with check (public.can_manage_receivables(condominium_id));

create policy methods_update
on public.condominium_payment_methods
for update
using (public.can_manage_receivables(condominium_id))
with check (public.can_manage_receivables(condominium_id));

revoke delete on public.condominium_payment_methods from authenticated;

alter table public.payment_receipt_sequences enable row level security;
revoke all on public.payment_receipt_sequences from anon, authenticated;

alter table public.payment_proofs
  add constraint payment_proofs_superseded_by_fkey
  foreign key (superseded_by_proof_id)
  references public.payment_proofs(id)
  deferrable initially deferred;

create function public.protect_payment_proof_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payment proofs cannot be deleted';
  end if;

  if old.superseded_at is not null
    or new.id <> old.id
    or new.condominium_id <> old.condominium_id
    or new.payment_id <> old.payment_id
    or new.object_key <> old.object_key
    or new.original_filename <> old.original_filename
    or new.content_type <> old.content_type
    or new.size_bytes <> old.size_bytes
    or new.sha256 <> old.sha256
    or new.uploaded_by <> old.uploaded_by
    or new.created_at <> old.created_at
    or new.superseded_at is null
    or new.superseded_by_proof_id is null then
    raise exception 'payment proof history is immutable';
  end if;

  return new;
end;
$$;

create trigger payment_proofs_history_guard
before update or delete on public.payment_proofs
for each row execute function public.protect_payment_proof_history();

create or replace function public.record_payment_proof(
  target uuid,
  target_payment uuid,
  key_value text,
  filename text,
  mime text,
  bytes bigint,
  hash text
)
returns public.payment_proofs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  p public.payments;
  proof public.payment_proofs;
  previous uuid;
  proof_id uuid := gen_random_uuid();
begin
  select * into p
  from public.payments
  where id = target_payment
    and condominium_id = target
  for update;

  if p.id is null
    or p.status not in ('draft', 'correction_requested')
    or not public.can_submit_payment(p.unit_id) then
    raise exception 'proof upload denied';
  end if;

  select id into previous
  from public.payment_proofs
  where payment_id = p.id
    and superseded_at is null
  for update;

  if previous is not null then
    update public.payment_proofs
    set superseded_at = now(),
        superseded_by_proof_id = proof_id
    where id = previous;
  end if;

  insert into public.payment_proofs(
    id,
    condominium_id,
    payment_id,
    object_key,
    original_filename,
    content_type,
    size_bytes,
    sha256,
    uploaded_by
  ) values (
    proof_id,
    target,
    p.id,
    key_value,
    filename,
    mime,
    bytes,
    hash,
    auth.uid()
  )
  returning * into proof;

  return proof;
end;
$$;
