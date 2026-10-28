-- HAB-591: keep agreement search in PostgreSQL so the Worker never enumerates a tenant.
-- This is deliberately SECURITY INVOKER: the caller still needs SELECT privileges and every
-- candidate row is filtered by payment_agreements RLS before any schedule fields are read.
create or replace function public.list_payment_agreement_ids(
  target_condominium uuid,
  target_page integer default 1,
  target_page_size integer default 25,
  target_unit uuid default null,
  target_person uuid default null,
  target_status text default null,
  target_min_amount numeric default null,
  target_max_amount numeric default null,
  target_period_from date default null,
  target_period_to date default null,
  target_date_from date default null,
  target_date_to date default null,
  target_sort text default 'updatedAtDesc'
)
returns table (agreement_id uuid, total_count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if target_condominium is null
    or target_page not between 1 and 100000
    or target_page_size not between 1 and 100
    or target_sort not in ('updatedAtDesc', 'updatedAtAsc', 'amountDesc', 'amountAsc', 'periodAsc', 'periodDesc')
    or (target_status is not null and target_status not in ('pending', 'accepted', 'rejected', 'cancelled'))
    or target_min_amount < 0
    or target_max_amount < 0
    or (target_min_amount is not null and target_max_amount is not null and target_min_amount > target_max_amount)
    or (target_period_from is not null and target_period_to is not null and target_period_from > target_period_to)
    or (target_date_from is not null and target_date_to is not null and target_date_from > target_date_to) then
    raise exception 'invalid payment agreement search parameters' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select a.id, a.updated_at, facts.total_amount, facts.first_due_date
    from public.payment_agreements a
    cross join lateral (
      select
        sum((installment->>'amount')::numeric) as total_amount,
        min((installment->>'due_date')::date) as first_due_date,
        max((installment->>'due_date')::date) as last_due_date
      from jsonb_array_elements(a.schedule) installment
    ) facts
    where a.condominium_id = target_condominium
      and (target_unit is null or a.unit_id = target_unit)
      and (target_person is null or a.legal_obligor_person_id = target_person)
      and (target_status is null or a.status = target_status::public.payment_agreement_status)
      and (target_min_amount is null or facts.total_amount >= target_min_amount)
      and (target_max_amount is null or facts.total_amount <= target_max_amount)
      and (target_period_from is null or facts.first_due_date >= target_period_from)
      and (target_period_to is null or facts.last_due_date <= target_period_to)
      and (target_date_from is null or a.updated_at >= target_date_from::timestamp at time zone 'UTC')
      and (target_date_to is null or a.updated_at < (target_date_to + 1)::timestamp at time zone 'UTC')
  ), counted as (
    select filtered.*, count(*) over () as matched_total
    from filtered
  ), paged as (
    select id, matched_total
    from counted
    order by
      case when target_sort = 'updatedAtDesc' then updated_at end desc,
      case when target_sort = 'updatedAtAsc' then updated_at end asc,
      case when target_sort = 'amountDesc' then total_amount end desc,
      case when target_sort = 'amountAsc' then total_amount end asc,
      case when target_sort = 'periodAsc' then first_due_date end asc,
      case when target_sort = 'periodDesc' then first_due_date end desc,
      case when target_sort in ('updatedAtDesc', 'amountDesc', 'periodDesc') then id end desc,
      case when target_sort in ('updatedAtAsc', 'amountAsc', 'periodAsc') then id end asc
    limit target_page_size offset ((target_page - 1) * target_page_size)
  )
  select paged.id, paged.matched_total from paged
  union all
  select null::uuid, count(*) from counted
  having not exists (select 1 from paged);
end;
$$;

revoke all on function public.list_payment_agreement_ids(uuid,integer,integer,uuid,uuid,text,numeric,numeric,date,date,date,date,text) from public, anon;
grant execute on function public.list_payment_agreement_ids(uuid,integer,integer,uuid,uuid,text,numeric,numeric,date,date,date,date,text) to authenticated, service_role;
