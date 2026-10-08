-- A revert is an immutable-history operation: it must be able to restore the exact historical
-- snapshot, including a legacy owner-share total that was already above 100 before the new guard.
-- The marker is private, transaction-bound, and consumed before returning, so ordinary writes
-- (including imports and transfers) still pass through guard_unit_owner_percentage_sum.
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
    select 1 from public.ownership_transfers t
    where t.reverts_transfer_id = original.id
  ) then
    raise exception 'ownership transfer already reverted';
  end if;

  if jsonb_array_length(original.previous_owners_snapshot) = 0 then
    raise exception 'ownership transfer has no previous owners to restore';
  end if;

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

  insert into public.unit_owner_sum_guard_revert_bypasses (transaction_id, unit_id)
  values (txid_current(), original.unit_id);

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

  delete from public.unit_owner_sum_guard_revert_bypasses
  where transaction_id = txid_current()
    and unit_id = original.unit_id;

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
    condominium_id, unit_id, effective_date, previous_owners_snapshot, new_owners_snapshot,
    supporting_document_reference, notes, reverts_transfer_id, created_by
  ) values (
    target, original.unit_id, resume_on, original.new_owners_snapshot, restored_snapshot,
    original.supporting_document_reference, 'Reverso de traspaso: ' || btrim(revert_reason),
    original.id, auth.uid()
  )
  returning * into compensating;

  return compensating;
end;
$$;
