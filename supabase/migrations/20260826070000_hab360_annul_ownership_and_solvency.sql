-- HAB-360: the last two administrator-created records without a correction path.
--
-- Both are immutable history, so neither gets an edit. Each gets the additive correction its own
-- model already implies.
--
-- 1. Ownership transfer. `guard_unit_owner_history` allows closing an open ownership row but never
--    reopening or rewriting one, so a revert cannot resurrect the previous rows. It closes the
--    rows the mistaken transfer opened and starts *fresh* rows for the previous owners, recording
--    a compensating transfer that points back at the one it corrects. Only the newest transfer for
--    a unit can be reverted: undoing an older one would rewrite everything that came after it.
--
-- 2. Solvency certificate. It is immutable and, more importantly, publicly verifiable through
--    `verify_solvency_certificate`. One issued in error stayed verifiable forever. Annulment
--    follows the shape `protect_exchange_rate_history` already established: the row is preserved
--    and only the annulment fields may ever be written, once.

alter table public.ownership_transfers
  add column if not exists reverts_transfer_id uuid;

alter table public.ownership_transfers
  drop constraint if exists ownership_transfers_reverts_tenant_fkey;

alter table public.ownership_transfers
  add constraint ownership_transfers_reverts_tenant_fkey
  foreign key (reverts_transfer_id, condominium_id)
  references public.ownership_transfers(id, condominium_id);

create unique index if not exists ownership_transfers_reverts_once
  on public.ownership_transfers(reverts_transfer_id)
  where reverts_transfer_id is not null;

create or replace function public.revert_unit_ownership_transfer(
  target uuid,
  target_transfer uuid,
  revert_reason text
)
returns public.ownership_transfers
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  original public.ownership_transfers;
  compensating public.ownership_transfers;
  owner_row jsonb;
  restored_snapshot jsonb;
  latest_transfer uuid;
  resume_on date;
begin
  if auth.uid() is null or not public.can_manage_condominium_structure(target) then
    raise exception 'permission denied';
  end if;

  if char_length(btrim(coalesce(revert_reason, ''))) not between 3 and 500 then
    raise exception 'invalid ownership revert';
  end if;

  select * into original
  from public.ownership_transfers t
  where t.id = target_transfer
    and t.condominium_id = target
  for update;

  if original.id is null then
    raise exception 'ownership transfer not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(original.unit_id::text, 0));

  -- Reverting anything but the newest transfer would silently rewrite the chain after it.
  select t.id into latest_transfer
  from public.ownership_transfers t
  where t.unit_id = original.unit_id
    and t.condominium_id = target
  order by t.effective_date desc, t.created_at desc, t.id desc
  limit 1;

  if latest_transfer is distinct from original.id then
    raise exception 'only the latest ownership transfer can be reverted';
  end if;

  if exists (
    select 1
    from public.ownership_transfers t
    where t.reverts_transfer_id = original.id
  ) then
    raise exception 'ownership transfer already reverted';
  end if;

  if jsonb_array_length(original.previous_owners_snapshot) = 0 then
    raise exception 'ownership transfer has no previous owners to restore';
  end if;

  -- Ownership is tracked by day. The mistaken rows keep the days they really held, and the
  -- previous owners resume the day after, which is the same handover shape a transfer uses.
  select greatest(current_date, max(o.starts_at) + 1)
  into resume_on
  from public.unit_owners o
  where o.unit_id = original.unit_id
    and o.ends_at is null;

  resume_on := coalesce(resume_on, current_date);

  update public.unit_owners
  set ends_at = resume_on - 1
  where unit_id = original.unit_id
    and ends_at is null;

  for owner_row in select value from jsonb_array_elements(original.previous_owners_snapshot)
  loop
    insert into public.unit_owners(
      unit_id, person_id, ownership_percentage, is_primary_contact, starts_at, created_by
    ) values (
      original.unit_id,
      (owner_row ->> 'person_id')::uuid,
      coalesce(nullif(owner_row ->> 'ownership_percentage', '')::numeric, 100),
      coalesce((owner_row ->> 'is_primary_contact')::boolean, false),
      resume_on,
      auth.uid()
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'relationship_id', o.id,
    'person_id', p.id,
    'name', trim(concat_ws(' ', p.first_name, p.last_name)),
    'ownership_percentage', o.ownership_percentage,
    'is_primary_contact', o.is_primary_contact,
    'starts_at', o.starts_at,
    'ends_at', o.ends_at
  ) order by o.starts_at, o.id), '[]'::jsonb)
  into restored_snapshot
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = original.unit_id
    and o.ends_at is null;

  insert into public.ownership_transfers (
    condominium_id,
    unit_id,
    effective_date,
    previous_owners_snapshot,
    new_owners_snapshot,
    supporting_document_reference,
    notes,
    reverts_transfer_id,
    created_by
  ) values (
    target,
    original.unit_id,
    resume_on,
    original.new_owners_snapshot,
    restored_snapshot,
    original.supporting_document_reference,
    'Reverso de traspaso: ' || btrim(revert_reason),
    original.id,
    auth.uid()
  )
  returning * into compensating;

  return compensating;
end;
$$;

revoke all on function public.revert_unit_ownership_transfer(uuid, uuid, text) from public, anon;
grant execute on function public.revert_unit_ownership_transfer(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- solvency certificates

alter table public.solvency_certificates
  add column if not exists annulled_at timestamptz,
  add column if not exists annulled_by uuid references auth.users(id),
  add column if not exists annulment_reason text;

alter table public.solvency_certificates
  drop constraint if exists solvency_certificates_annulment_complete;

alter table public.solvency_certificates
  add constraint solvency_certificates_annulment_complete
  check (
    (annulled_at is null and annulled_by is null and annulment_reason is null)
    or (annulled_at is not null and annulled_by is not null
        and char_length(btrim(annulment_reason)) between 3 and 500)
  );

-- The certificate itself stays frozen; only the annulment fields may ever be written, once.
create or replace function public.protect_solvency_certificate_history()
returns trigger
language plpgsql
as $$
begin
  -- HAB-322 lets the tenant purge delete through this guard inside an authorized transaction.
  -- Replacing the function must not quietly drop that escape hatch.
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'solvency certificates are immutable';
  end if;

  if old.annulled_at is not null then
    raise exception 'solvency certificate already annulled';
  end if;

  if (new.id, new.verification_id, new.condominium_id, new.unit_id, new.as_of_date,
      new.valid_until, new.criteria_snapshot, new.balance_snapshot, new.owner_snapshot,
      new.issued_by, new.issued_at)
     is distinct from
     (old.id, old.verification_id, old.condominium_id, old.unit_id, old.as_of_date,
      old.valid_until, old.criteria_snapshot, old.balance_snapshot, old.owner_snapshot,
      old.issued_by, old.issued_at)
     or new.annulled_at is null
  then
    raise exception 'solvency certificates are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.annul_solvency_certificate(
  target uuid,
  target_certificate uuid,
  annulment_reason text
)
returns public.solvency_certificates
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  certificate public.solvency_certificates;
  annulled public.solvency_certificates;
  -- Resolved into a local first: inside the UPDATE the bare name is ambiguous between the
  -- PL/pgSQL parameter and the column it writes.
  next_reason text := btrim(coalesce(annulment_reason, ''));
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  if char_length(next_reason) not between 3 and 500 then
    raise exception 'invalid solvency annulment';
  end if;

  select * into certificate
  from public.solvency_certificates sc
  where sc.id = target_certificate
    and sc.condominium_id = target
  for update;

  if certificate.id is null then
    raise exception 'solvency certificate not found';
  end if;

  if certificate.annulled_at is not null then
    raise exception 'solvency certificate already annulled';
  end if;

  update public.solvency_certificates
  set annulled_at = now(),
      annulled_by = auth.uid(),
      annulment_reason = next_reason
  where id = certificate.id
  returning * into annulled;

  return annulled;
end;
$$;

revoke all on function public.annul_solvency_certificate(uuid, uuid, text) from public, anon;
grant execute on function public.annul_solvency_certificate(uuid, uuid, text) to authenticated;

-- Public verification is the whole point of annulling: whoever checks the certificate has to see
-- that it no longer stands, without learning anything new about the unit's finances.
create or replace function public.verify_solvency_certificate(public_verification_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'found', true,
    'verification_id', sc.verification_id,
    'condominium_name', c.name,
    'unit_code', u.code,
    'as_of_date', sc.as_of_date,
    'valid_until', sc.valid_until,
    'issued_at', sc.issued_at,
    'annulled', sc.annulled_at is not null,
    'annulled_at', sc.annulled_at,
    'within_validity_window', sc.annulled_at is null and current_date <= sc.valid_until
  )
  from public.solvency_certificates sc
  join public.condominiums c on c.id = sc.condominium_id
  join public.units u on u.id = sc.unit_id and u.condominium_id = sc.condominium_id
  where sc.verification_id = public_verification_id;
$$;

revoke all on function public.verify_solvency_certificate(uuid) from public;
grant execute on function public.verify_solvency_certificate(uuid) to anon, authenticated, service_role;
