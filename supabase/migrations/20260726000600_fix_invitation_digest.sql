create or replace function public.accept_invitation(raw_token text)
returns public.invitations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  invite public.invitations;
  authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select au.email
  into authenticated_email
  from auth.users au
  where au.id = auth.uid();

  select i.*
  into invite
  from public.invitations i
  where i.token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and i.status = 'pending'
  for update;

  if invite.id is null
    or invite.expires_at < now()
    or authenticated_email is null
    or lower(invite.email) <> lower(authenticated_email)
  then
    raise exception 'invalid invitation';
  end if;

  update public.people p
  set auth_user_id = auth.uid(),
      updated_at = now()
  where p.id = invite.person_id
    and (p.auth_user_id is null or p.auth_user_id = auth.uid());

  if not found then
    raise exception 'person already linked';
  end if;

  insert into public.condominium_memberships (condominium_id, user_id, role)
  values (invite.condominium_id, auth.uid(), invite.intended_role)
  on conflict do nothing;

  update public.invitations i
  set status = 'accepted',
      accepted_at = now()
  where i.id = invite.id
  returning i.* into invite;

  return invite;
end;
$$;

revoke execute on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;
