-- HAB-163: administrator invitations are callable through the authenticated API/RPC path.
-- Enforce a database-side per-actor window so web, Worker and future mobile clients cannot
-- bypass invitation abuse controls even if a transport-level limiter is misconfigured.

create function public.guard_admin_invitation_rate()
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

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':admin-invitations', 0));

  select count(*)::integer
    into recent_count
  from public.admin_invitations ai
  where ai.invited_by = actor
    and ai.created_at > now() - interval '15 minutes';

  if recent_count >= 20 then
    raise exception 'admin invitation rate limit exceeded';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_admin_invitation_rate()
  from public, anon, authenticated, service_role;

drop trigger if exists admin_invitations_rate_guard on public.admin_invitations;
create trigger admin_invitations_rate_guard
before insert on public.admin_invitations
for each row execute function public.guard_admin_invitation_rate();
