-- Payment actors are an auditable, narrow identity surface.  This deliberately returns only
-- names for actor ids already attached to payments the caller may read; it is not a team list.
create function public.list_payment_actor_names(
  target_condominium uuid,
  target_payment_ids uuid[]
)
returns table (user_id uuid, full_name text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null
    or target_payment_ids is null
    or cardinality(target_payment_ids) = 0
    or exists (
      select 1
      from unnest(target_payment_ids) as requested_payment_id
      left join public.payments payment
        on payment.id = requested_payment_id
       and payment.condominium_id = target_condominium
      where payment.id is null
         or not (
           public.can_review_payments(target_condominium)
           or public.can_submit_payment(payment.unit_id)
         )
    ) then
    raise exception using errcode = '42501', message = 'payment actor lookup denied';
  end if;

  return query
  with actor_ids as (
    select distinct actor_user_id
    from public.payments payment
    cross join lateral unnest(array[
      payment.submitted_by_user_id,
      payment.reviewed_by,
      payment.approved_by,
      payment.rejected_by,
      payment.reversed_by
    ]) as actor_user_id
    where payment.condominium_id = target_condominium
      and payment.id = any(target_payment_ids)
      and actor_user_id is not null
  )
  select actor_ids.actor_user_id, nullif(trim(profiles.full_name), '')
  from actor_ids
  join public.profiles profiles on profiles.id = actor_ids.actor_user_id
  where nullif(trim(profiles.full_name), '') is not null;
end;
$$;

revoke all on function public.list_payment_actor_names(uuid, uuid[]) from public;
grant execute on function public.list_payment_actor_names(uuid, uuid[]) to authenticated, service_role;
