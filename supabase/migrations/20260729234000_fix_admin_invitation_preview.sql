create or replace function public.get_admin_invitation_preview(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  invitation public.admin_invitations;
  condominium_name text;
begin
  select ai, c.name
  into invitation, condominium_name
  from public.admin_invitations ai
  join public.condominiums c on c.id = ai.condominium_id
  where ai.token_hash = encode(digest(raw_token, 'sha256'), 'hex');

  if invitation.id is null then
    raise exception 'invalid invitation';
  end if;

  if invitation.status = 'pending' and invitation.expires_at < now() then
    update public.admin_invitations
    set status = 'expired'
    where id = invitation.id;
    invitation.status := 'expired';
  end if;

  return jsonb_build_object(
    'id', invitation.id,
    'email', invitation.email,
    'condominium_id', invitation.condominium_id,
    'condominium_name', condominium_name,
    'intended_role', invitation.intended_role,
    'status', invitation.status,
    'expires_at', invitation.expires_at
  );
end;
$$;

revoke execute on function public.get_admin_invitation_preview(text) from public;
grant execute on function public.get_admin_invitation_preview(text) to anon, authenticated;
