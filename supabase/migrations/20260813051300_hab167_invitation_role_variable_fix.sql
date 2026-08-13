-- HAB-167: avoid PostgreSQL CURRENT_ROLE keyword resolution in invitation acceptance.
create or replace function public.accept_admin_invitation(raw_token text)
returns public.admin_invitations
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  invitation public.admin_invitations;
  authenticated_email text;
  current_membership_id uuid;
  membership_role public.condominium_role;
  admin_count bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select lower(email)
  into authenticated_email
  from auth.users
  where id = auth.uid();

  select *
  into invitation
  from public.admin_invitations
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or invitation.expires_at < now()
    or authenticated_email is null
    or lower(invitation.email) <> authenticated_email
  then
    raise exception 'invalid invitation';
  end if;

  perform 1
  from public.condominiums
  where id = invitation.condominium_id
  for update;

  select cm.id, cm.role
  into current_membership_id, membership_role
  from public.condominium_memberships cm
  where cm.condominium_id = invitation.condominium_id
    and cm.user_id = auth.uid()
    and cm.role in ('condominium_admin', 'accountant', 'assistant', 'payment_reviewer')
  for update;

  if current_membership_id is null then
    insert into public.condominium_memberships (condominium_id, user_id, role)
    values (invitation.condominium_id, auth.uid(), invitation.intended_role);
  elsif membership_role <> invitation.intended_role then
    if membership_role = 'condominium_admin' and invitation.intended_role <> 'condominium_admin' then
      select count(*) into admin_count
      from public.condominium_memberships
      where condominium_id = invitation.condominium_id
        and role = 'condominium_admin';
      if admin_count <= 1 then
        raise exception 'last condominium administrator required';
      end if;
    end if;

    update public.condominium_memberships
    set role = invitation.intended_role,
        updated_at = now()
    where id = current_membership_id;

    insert into public.condominium_team_access_events (
      condominium_id,
      user_id,
      event_type,
      from_role,
      to_role,
      actor_user_id,
      metadata
    ) values (
      invitation.condominium_id,
      auth.uid(),
      'role_changed',
      membership_role,
      invitation.intended_role,
      auth.uid(),
      jsonb_build_object('source', 'admin_invitation', 'invitation_id', invitation.id)
    );
  end if;

  update public.admin_invitations
  set status = 'accepted',
      accepted_at = now()
  where id = invitation.id
  returning * into invitation;

  insert into public.admin_invitation_events (
    invitation_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    invitation.id,
    invitation.condominium_id,
    'accepted',
    auth.uid(),
    jsonb_build_object('role', invitation.intended_role)
  );

  return invitation;
end;
$$;

revoke execute on function public.accept_admin_invitation(text) from public;
grant execute on function public.accept_admin_invitation(text) to authenticated;
