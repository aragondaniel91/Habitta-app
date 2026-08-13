-- HAB-167 follow-up: avoid ON CONFLICT reads against the lifecycle table while
-- an invited user is accepting access for the first time. The trigger remains
-- SECURITY DEFINER and application roles still have no write grants.

create or replace function public.sync_condominium_team_state_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op in ('INSERT', 'UPDATE')
    and new.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  then
    update public.condominium_team_access_states
    set role = new.role,
        status = 'active',
        changed_at = now(),
        changed_by = auth.uid(),
        suspended_at = null,
        removed_at = null
    where condominium_id = new.condominium_id
      and user_id = new.user_id;

    if not found then
      insert into public.condominium_team_access_states (
        condominium_id,
        user_id,
        role,
        status,
        first_joined_at,
        changed_at,
        changed_by,
        suspended_at,
        removed_at
      )
      values (
        new.condominium_id,
        new.user_id,
        new.role,
        'active',
        new.created_at,
        now(),
        auth.uid(),
        null,
        null
      );
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
    and new.role not in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  then
    update public.condominium_team_access_states
    set status = 'removed',
        changed_at = now(),
        changed_by = coalesce(auth.uid(), changed_by),
        removed_at = coalesce(removed_at, now())
    where condominium_id = old.condominium_id
      and user_id = old.user_id;

    return new;
  end if;

  if tg_op = 'DELETE'
    and old.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  then
    update public.condominium_team_access_states
    set status = case when status in ('suspended', 'removed') then status else 'removed' end,
        changed_at = now(),
        changed_by = coalesce(auth.uid(), changed_by),
        removed_at = case
          when status in ('suspended', 'removed') then removed_at
          else coalesce(removed_at, now())
        end
    where condominium_id = old.condominium_id
      and user_id = old.user_id;

    return old;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
