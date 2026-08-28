-- HAB-420: resident invitation delivery audit remains immutable during normal
-- operation, while the official owner-only condominium purge may delete the
-- tenant-scoped audit rows under HAB-322's backend+transaction+condominium
-- authorization.
--
-- No trigger is disabled, no RLS is disabled, and ordinary UPDATE/DELETE
-- remains forbidden.

create or replace function public.resident_invitation_delivery_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and public.is_condominium_purge_authorized(old.condominium_id)
  then
    return old;
  end if;

  raise exception 'resident invitation delivery events are immutable';
end
$$;

revoke all on function public.resident_invitation_delivery_event_immutable()
  from public, anon, authenticated, service_role;
