-- HAB-461: auditable retention for superseded payment-proof bytes.
--
-- Venezuelan condominium administration requires the administrator to preserve accounting
-- supporting documents. Habitta therefore keeps proof metadata immutable and retains superseded
-- proof bytes for ten years before they become eligible for storage cleanup. The currently active
-- proof is never eligible.
--
-- Storage lifecycle state is deliberately kept outside public.payment_proofs so housekeeping never
-- mutates the financial/audit evidence row itself.

create schema if not exists habitta_internal;
revoke all on schema habitta_internal from public, anon, authenticated, service_role;

create table if not exists habitta_internal.payment_proof_storage_lifecycle (
  proof_id uuid primary key references public.payment_proofs(id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error_code text,
  deleted_at timestamptz,
  check (deleted_at is null or last_error_code is null)
);

revoke all on table habitta_internal.payment_proof_storage_lifecycle
  from public, anon, authenticated, service_role;

create or replace function public.list_expired_payment_proof_objects(limit_count integer default 100)
returns table (
  proof_id uuid,
  object_key text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if limit_count < 1 or limit_count > 500 then
    raise exception using errcode = '22023', message = 'invalid payment proof cleanup limit';
  end if;

  return query
  select pp.id, pp.object_key
  from public.payment_proofs pp
  left join habitta_internal.payment_proof_storage_lifecycle lifecycle
    on lifecycle.proof_id = pp.id
  where pp.superseded_at is not null
    and pp.superseded_by_proof_id is not null
    and pp.superseded_at <= clock_timestamp() - interval '10 years'
    and lifecycle.deleted_at is null
    and exists (
      select 1
      from public.payment_proofs active_proof
      where active_proof.payment_id = pp.payment_id
        and active_proof.condominium_id = pp.condominium_id
        and active_proof.superseded_at is null
    )
  order by pp.superseded_at asc, pp.id
  limit limit_count;
end;
$$;

create or replace function public.record_payment_proof_storage_cleanup(
  target_proof uuid,
  succeeded boolean,
  error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_error text := left(coalesce(nullif(trim(error_code), ''), 'r2_delete_failed'), 80);
begin
  if not exists (select 1 from public.payment_proofs where id = target_proof) then
    raise exception using errcode = '22023', message = 'payment proof not found';
  end if;

  insert into habitta_internal.payment_proof_storage_lifecycle(
    proof_id,
    attempt_count,
    last_attempt_at,
    last_error_code,
    deleted_at
  ) values (
    target_proof,
    1,
    clock_timestamp(),
    case when succeeded then null else normalized_error end,
    case when succeeded then clock_timestamp() else null end
  )
  on conflict (proof_id) do update set
    attempt_count = habitta_internal.payment_proof_storage_lifecycle.attempt_count + 1,
    last_attempt_at = clock_timestamp(),
    last_error_code = case
      when habitta_internal.payment_proof_storage_lifecycle.deleted_at is not null then null
      when succeeded then null
      else normalized_error
    end,
    deleted_at = case
      when habitta_internal.payment_proof_storage_lifecycle.deleted_at is not null
        then habitta_internal.payment_proof_storage_lifecycle.deleted_at
      when succeeded then clock_timestamp()
      else null
    end;
end;
$$;

revoke all on function public.list_expired_payment_proof_objects(integer)
  from public, anon, authenticated;
revoke all on function public.record_payment_proof_storage_cleanup(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.list_expired_payment_proof_objects(integer) to service_role;
grant execute on function public.record_payment_proof_storage_cleanup(uuid, boolean, text) to service_role;

comment on function public.list_expired_payment_proof_objects(integer) is
  'HAB-461 internal storage cleanup: lists only superseded proof objects retained for at least ten years and never the active proof.';
comment on function public.record_payment_proof_storage_cleanup(uuid, boolean, text) is
  'HAB-461 internal storage cleanup audit. Does not mutate immutable payment_proofs metadata.';
