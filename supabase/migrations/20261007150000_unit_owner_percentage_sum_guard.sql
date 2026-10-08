-- Every mutation path (direct insert, audited correction, transfer, revert and CSV import) ends in
-- an insert or update on unit_owners. Serialize checks per unit here so those paths have one source
-- of truth. Null shares remain unknown and closed owners never count. Legacy totals above 100 can
-- only move downward; this permits audited repair without allowing a bad total to be preserved or
-- worsened. A revert may restore a historical snapshot that predates this guard; its narrowly
-- scoped, private transaction marker is installed only by the SECURITY DEFINER revert RPC.
create table public.unit_owner_sum_guard_revert_bypasses (
  transaction_id bigint not null,
  unit_id uuid not null references public.units(id) on delete cascade,
  primary key (transaction_id, unit_id)
);
alter table public.unit_owner_sum_guard_revert_bypasses enable row level security;
revoke all on public.unit_owner_sum_guard_revert_bypasses from public, anon, authenticated;

create or replace function public.guard_unit_owner_percentage_sum()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  previous_sum numeric(9, 4);
  next_sum numeric(9, 4);
  previous_contribution numeric(9, 4) := 0;
  next_contribution numeric(9, 4) := 0;
begin
  -- Lock the parent row: two concurrent inserts cannot both validate against the same old total.
  perform 1 from public.units where id = new.unit_id for update;

  if tg_op = 'INSERT' and exists (
    select 1 from public.unit_owner_sum_guard_revert_bypasses bypass
    where bypass.transaction_id = txid_current()
      and bypass.unit_id = new.unit_id
  ) then
    return new;
  end if;

  if new.ends_at is null and new.ownership_percentage is not null then
    next_contribution := new.ownership_percentage;
  end if;
  if tg_op = 'UPDATE' and old.ends_at is null and old.ownership_percentage is not null then
    previous_contribution := old.ownership_percentage;
  end if;

  select coalesce(sum(o.ownership_percentage), 0)
  into next_sum
  from public.unit_owners o
  where o.unit_id = new.unit_id
    and o.ends_at is null
    and o.ownership_percentage is not null;

  previous_sum := next_sum - next_contribution + previous_contribution;

  if previous_sum > 100 and next_sum >= previous_sum then
    raise exception 'unit ownership percentage total above 100 must be strictly reduced for unit %', new.unit_id;
  end if;
  if previous_sum <= 100 and next_sum > 100 then
    raise exception 'unit ownership percentage total cannot exceed 100 for unit %', new.unit_id;
  end if;

  return new;
end;
$$;

create trigger unit_owners_percentage_sum_guard
after insert or update on public.unit_owners
for each row execute function public.guard_unit_owner_percentage_sum();
