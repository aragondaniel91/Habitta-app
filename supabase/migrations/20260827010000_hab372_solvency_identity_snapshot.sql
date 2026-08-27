-- HAB-372: a solvency certificate froze everything except who it was about.
--
-- `solvency_certificates` already snapshots the policy, the balances and the owners, because a
-- certificate is a document a resident hands to a bank or a notary and it has to keep saying what
-- it said the day it was issued. But `verify_solvency_certificate` read the condominium name and
-- the unit code *live*:
--
--     'condominium_name', c.name,
--     'unit_code', u.code,
--
-- So renaming a condominium, or recoding a unit from 'A-1' to '101', silently changed the
-- identifying text on every certificate ever issued. The public verification page would then
-- contradict the paper the resident is holding, with nothing to show that anything had moved.
-- That is the one field a third party uses to decide the document is about the right property.
--
-- The identity is now frozen at issuance like everything else on the row.

alter table public.solvency_certificates
  add column if not exists condominium_name_snapshot text,
  add column if not exists unit_code_snapshot text;

-- Existing rows can only be backfilled from today's values: the historical name is not recorded
-- anywhere, so this is the best available truth rather than the certain one. From here on the
-- value is captured at issuance and cannot drift again.
update public.solvency_certificates sc
set condominium_name_snapshot = coalesce(sc.condominium_name_snapshot, c.name),
    unit_code_snapshot = coalesce(sc.unit_code_snapshot, u.code)
from public.condominiums c, public.units u
where c.id = sc.condominium_id
  and u.id = sc.unit_id
  and (sc.condominium_name_snapshot is null or sc.unit_code_snapshot is null);

alter table public.solvency_certificates
  alter column condominium_name_snapshot set not null,
  alter column unit_code_snapshot set not null;

create or replace function public.issue_solvency_certificate(
  target uuid,
  target_unit uuid,
  evaluated_on date default current_date
)
returns public.solvency_certificates
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  evaluation jsonb;
  policy public.condominium_solvency_policies;
  owners jsonb;
  created public.solvency_certificates;
  subject_condominium text;
  subject_unit text;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;
  if not exists(
    select 1 from public.units where id = target_unit and condominium_id = target
  ) then
    raise exception 'unit not found in condominium';
  end if;

  evaluation := public.evaluate_unit_solvency(target, target_unit, evaluated_on);
  if not coalesce((evaluation->>'eligible')::boolean, false) then
    raise exception 'unit is not solvent under current policy';
  end if;

  select * into policy
  from public.condominium_solvency_policies
  where condominium_id = target;

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', p.id,
    'name', trim(concat_ws(' ', p.first_name, p.last_name)),
    'document_type', p.document_type,
    'document_number', p.document_number,
    'ownership_percentage', o.ownership_percentage
  ) order by o.id), '[]'::jsonb)
  into owners
  from public.unit_owners o
  join public.people p on p.id = o.person_id
  where o.unit_id = target_unit and o.ends_at is null;

  -- The identity the document will carry, read once, here.
  select c.name, u.code into subject_condominium, subject_unit
  from public.condominiums c
  join public.units u on u.id = target_unit and u.condominium_id = c.id
  where c.id = target;

  insert into public.solvency_certificates(
    condominium_id, unit_id, as_of_date, valid_until,
    criteria_snapshot, balance_snapshot, owner_snapshot, issued_by,
    condominium_name_snapshot, unit_code_snapshot
  ) values (
    target,
    target_unit,
    evaluated_on,
    evaluated_on + coalesce(policy.certificate_validity_days, 30),
    evaluation->'policy',
    evaluation->'balances',
    owners,
    auth.uid(),
    subject_condominium,
    subject_unit
  ) returning * into created;

  return created;
end;
$$;

revoke all on function public.issue_solvency_certificate(uuid, uuid, date) from public, anon;
grant execute on function public.issue_solvency_certificate(uuid, uuid, date) to authenticated;

-- The immutability guard enumerates the frozen columns by hand, so the new ones join that tuple.
-- Leaving them out would have made the identity the only rewritable field on an immutable row.
create or replace function public.protect_solvency_certificate_history()
returns trigger
language plpgsql
as $$
begin
  -- HAB-322 lets the tenant purge delete through this guard inside an authorized transaction.
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
      new.issued_by, new.issued_at, new.condominium_name_snapshot, new.unit_code_snapshot)
     is distinct from
     (old.id, old.verification_id, old.condominium_id, old.unit_id, old.as_of_date,
      old.valid_until, old.criteria_snapshot, old.balance_snapshot, old.owner_snapshot,
      old.issued_by, old.issued_at, old.condominium_name_snapshot, old.unit_code_snapshot)
     or new.annulled_at is null
  then
    raise exception 'solvency certificates are immutable';
  end if;

  return new;
end;
$$;

-- Public verification now reads the frozen identity. It still learns nothing new about the unit's
-- finances; it simply stops describing the certificate as being about something it never was.
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
    'condominium_name', sc.condominium_name_snapshot,
    'unit_code', sc.unit_code_snapshot,
    'as_of_date', sc.as_of_date,
    'valid_until', sc.valid_until,
    'issued_at', sc.issued_at,
    'annulled', sc.annulled_at is not null,
    'annulled_at', sc.annulled_at,
    'within_validity_window', sc.annulled_at is null and current_date <= sc.valid_until
  )
  from public.solvency_certificates sc
  where sc.verification_id = public_verification_id;
$$;

revoke all on function public.verify_solvency_certificate(uuid) from public;
grant execute on function public.verify_solvency_certificate(uuid) to anon, authenticated, service_role;
