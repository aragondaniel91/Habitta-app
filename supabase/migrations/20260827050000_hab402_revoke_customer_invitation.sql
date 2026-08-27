-- HAB-402: an invitation issued to the wrong address needs a way back.
--
-- Resending to the same address supersedes the old token, but that only helps when the address was
-- right. An invitation sent to a mistyped address stays live until it expires, and whoever owns
-- that inbox can redeem it. The lifecycle contract asks every created record for its correction
-- path; this is that path, and it is additive: the row is retired, never deleted, so the mistake
-- stays visible to whoever audits it later.
create or replace function public.revoke_customer_invitation(target_invitation uuid, revoke_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  invitation public.customer_invitations;
  next_notes text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'platform administrator required';
  end if;

  select * into invitation
  from public.customer_invitations
  where id = target_invitation
  for update;

  if invitation.id is null then
    raise exception 'customer invitation not found';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'customer invitation is not pending';
  end if;

  next_notes := nullif(btrim(coalesce(revoke_reason, '')), '');

  update public.customer_invitations
  set status = 'revoked',
      revoked_at = now(),
      notes = coalesce(next_notes, notes)
  where id = invitation.id;

  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'revoked');
end;
$$;

revoke all on function public.revoke_customer_invitation(uuid, text) from public, anon;
grant execute on function public.revoke_customer_invitation(uuid, text) to authenticated;
