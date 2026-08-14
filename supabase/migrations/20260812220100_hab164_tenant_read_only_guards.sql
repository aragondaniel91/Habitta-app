-- HAB-164 pilot: a user whose only condominium role is tenant is read-only.
-- Central table guards prevent SECURITY DEFINER RPCs from accidentally granting writes.

create function public.is_tenant_only_for_condominium(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = auth.uid()
      and cm.role = 'tenant'::public.condominium_role
  )
  and not exists (
    select 1 from public.condominium_memberships cm
    where cm.condominium_id = target
      and cm.user_id = auth.uid()
      and cm.role <> 'tenant'::public.condominium_role
  );
$$;

revoke execute on function public.is_tenant_only_for_condominium(uuid) from public;
grant execute on function public.is_tenant_only_for_condominium(uuid) to authenticated, service_role;

create function public.enforce_tenant_service_request_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium uuid;
begin
  target_condominium := case when tg_op = 'DELETE' then old.condominium_id else new.condominium_id end;
  if auth.uid() is not null and public.is_tenant_only_for_condominium(target_condominium) then
    raise exception 'tenant access is read only';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.enforce_tenant_service_request_comment_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium uuid;
begin
  select r.condominium_id into target_condominium
  from public.service_requests r
  where r.id = new.request_id;
  if auth.uid() is not null and public.is_tenant_only_for_condominium(target_condominium) then
    raise exception 'tenant access is read only';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_tenant_service_request_read_only()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_tenant_service_request_comment_read_only()
  from public, anon, authenticated, service_role;

drop trigger if exists service_requests_tenant_read_only on public.service_requests;
create trigger service_requests_tenant_read_only
before insert or update or delete on public.service_requests
for each row execute function public.enforce_tenant_service_request_read_only();

drop trigger if exists service_request_comments_tenant_read_only on public.service_request_comments;
create trigger service_request_comments_tenant_read_only
before insert on public.service_request_comments
for each row execute function public.enforce_tenant_service_request_comment_read_only();

-- Tenant-only users receive no implicit financial write authority. Existing owner/staff and
-- non-tenant occupant behavior is preserved, while stale relationships no longer qualify.
create or replace function public.can_submit_payment(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.can_manage_people(u.condominium_id)
    or (
      not public.is_tenant_only_for_condominium(u.condominium_id)
      and (
        exists (
          select 1
          from public.unit_owners o
          join public.people p on p.id = o.person_id
          where o.unit_id = target_unit
            and o.ends_at is null
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.unit_occupancies o
          join public.people p on p.id = o.person_id
          where o.unit_id = target_unit
            and o.ends_at is null
            and p.status = 'active'
            and p.auth_user_id = auth.uid()
        )
      )
    )
  from public.units u
  where u.id = target_unit
    and u.status = 'active';
$$;

revoke all on function public.can_submit_payment(uuid) from public;
grant execute on function public.can_submit_payment(uuid) to authenticated, service_role;

create function public.enforce_tenant_payment_read_only()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_condominium uuid;
begin
  target_condominium := case when tg_op = 'DELETE' then old.condominium_id else new.condominium_id end;
  if auth.uid() is not null and public.is_tenant_only_for_condominium(target_condominium) then
    raise exception 'tenant access is read only';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.enforce_tenant_payment_read_only()
  from public, anon, authenticated, service_role;

drop trigger if exists payments_tenant_read_only on public.payments;
create trigger payments_tenant_read_only
before insert or update or delete on public.payments
for each row execute function public.enforce_tenant_payment_read_only();

drop trigger if exists payment_proofs_tenant_read_only on public.payment_proofs;
create trigger payment_proofs_tenant_read_only
before insert or update or delete on public.payment_proofs
for each row execute function public.enforce_tenant_payment_read_only();
