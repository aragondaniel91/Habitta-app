-- HAB-125: the resident invitation RPC is callable by authenticated clients so an admin can
-- obtain the one-time link even while email delivery is sandboxed. Keep abuse protection at the
-- database boundary so the same guard covers web, Worker, and future mobile clients.

create or replace function public.guard_resident_invitation_rate()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  recent_count integer;
begin
  if actor is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':resident-invitations', 0));

  select count(*)::integer
  into recent_count
  from public.invitations i
  where i.invited_by = actor
    and i.created_at > now() - interval '15 minutes';

  if recent_count >= 20 then
    raise exception 'resident invitation rate limit exceeded';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_resident_invitation_rate()
  from public, anon, authenticated, service_role;

drop trigger if exists invitations_rate_guard on public.invitations;
create trigger invitations_rate_guard
before insert on public.invitations
for each row execute function public.guard_resident_invitation_rate();
