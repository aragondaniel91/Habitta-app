-- HAB-597 / pilot #23: condominium_memberships preserves account history, so
-- owner and tenant rows must be paired with their effective-dated residential
-- relationship when authorizing late-fee policy visibility.  The relationship
-- helpers keep ends_at inclusive and fail closed once it is in the past.

create or replace function public.can_read_late_fee_settings(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_read_receivables(target)
    or exists (
      select 1
      from public.condominium_memberships cm
      where cm.condominium_id = target
        and cm.user_id = auth.uid()
        and (
          cm.role = 'board_member'
          or (cm.role = 'owner' and public.has_active_owner_relationship(target))
          or (cm.role = 'tenant' and public.has_active_tenant_occupancy(target))
        )
    );
$$;

revoke all on function public.can_read_late_fee_settings(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_read_late_fee_settings(uuid)
  to authenticated, service_role;
