-- HAB-151: administrator invitations are explicit transactional email initiated by an authorized
-- condominium administrator. They intentionally bypass the condominium live-email fan-out gate,
-- but every delivery outcome must remain auditable and scoped to the invitation/condominium.

alter table public.admin_invitation_events
  drop constraint if exists admin_invitation_events_event_type_check;

alter table public.admin_invitation_events
  add constraint admin_invitation_events_event_type_check
  check (
    event_type in (
      'created',
      'accepted',
      'revoked',
      'expired',
      'email_sent',
      'email_failed',
      'email_disabled'
    )
  );

create or replace function public.record_admin_invitation_delivery(
  target_invitation_id uuid,
  target_status text,
  target_provider text,
  target_mode text,
  target_error_code text default null,
  target_provider_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  invitation public.admin_invitations;
  resolved_event_type text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
    into invitation
  from public.admin_invitations
  where id = target_invitation_id;

  if invitation.id is null or invitation.invited_by <> auth.uid() then
    raise exception 'invitation delivery audit denied';
  end if;

  resolved_event_type := case target_status
    when 'sent' then 'email_sent'
    when 'failed' then 'email_failed'
    when 'disabled' then 'email_disabled'
    else null
  end;

  if resolved_event_type is null then
    raise exception 'invalid invitation delivery status';
  end if;

  if coalesce(trim(target_provider), '') = '' or coalesce(trim(target_mode), '') = '' then
    raise exception 'invalid invitation delivery metadata';
  end if;

  insert into public.admin_invitation_events (
    invitation_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  ) values (
    invitation.id,
    invitation.condominium_id,
    resolved_event_type,
    auth.uid(),
    jsonb_strip_nulls(
      jsonb_build_object(
        'provider', left(trim(target_provider), 80),
        'mode', left(trim(target_mode), 40),
        'error_code', nullif(left(trim(coalesce(target_error_code, '')), 120), ''),
        'provider_id', nullif(left(trim(coalesce(target_provider_id, '')), 160), '')
      )
    )
  );
end;
$$;

revoke all on function public.record_admin_invitation_delivery(uuid, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.record_admin_invitation_delivery(uuid, text, text, text, text, text)
  to authenticated;
