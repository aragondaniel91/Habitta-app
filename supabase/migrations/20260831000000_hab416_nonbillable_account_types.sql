-- HAB-416: non-customer organizations must stay outside the commercial substrate.
--
-- HAB-414 intentionally made account_type classification-only. HAB-416 is the first consumer of
-- that classification: the production demo (and any future internal tenant) must never acquire a
-- subscription or be mistaken for a commercial customer.
--
-- Keep the invariant at the database boundary. Today subscriptions are service-role-only, but a
-- future billing worker or administrative tool is exactly where an accidental demo subscription
-- could otherwise be created.

-- Refuse to install the guard over contradictory data. A migration must never silently delete or
-- rewrite a commercial record merely because an organization was classified differently.
do $hab416_preflight$
begin
  if exists (
    select 1
    from public.subscriptions s
    join public.condominiums c on c.id = s.condominium_id
    join public.organizations o on o.id = c.organization_id
    where o.account_type <> 'customer'
  ) then
    raise exception using
      errcode = '23514',
      message = 'non-customer organization already has a subscription';
  end if;
end
$hab416_preflight$;

create function public.guard_customer_subscription()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_account_type public.organization_account_type;
begin
  select o.account_type
    into target_account_type
    from public.condominiums c
    join public.organizations o on o.id = c.organization_id
   where c.id = new.condominium_id;

  -- The FK will produce the normal error for an unknown condominium. This branch owns only the
  -- commercial classification invariant.
  if target_account_type is not null and target_account_type <> 'customer' then
    raise exception using
      errcode = '23514',
      message = 'subscriptions are only permitted for customer organizations';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_customer_subscription() from public;
grant execute on function public.guard_customer_subscription() to service_role;

create trigger subscriptions_customer_account_guard
before insert or update of condominium_id on public.subscriptions
for each row
execute function public.guard_customer_subscription();

-- Preserve every HAB-414 authorization property while adding the other half of the invariant: a
-- trusted operator may reclassify a customer as demo/internal only after commercial state has been
-- removed deliberately. This prevents reclassification from hiding a live contract from metrics.
create or replace function public.guard_organization_account_type()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  trusted_admin boolean :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or request_role = 'service_role';
begin
  if tg_op = 'INSERT' then
    if new.account_type <> 'customer' and not trusted_admin then
      raise exception using
        errcode = '42501',
        message = 'organization account_type is platform-managed';
    end if;
  elsif new.account_type is distinct from old.account_type then
    if not trusted_admin then
      raise exception using
        errcode = '42501',
        message = 'organization account_type is platform-managed';
    end if;

    if new.account_type <> 'customer' and exists (
      select 1
      from public.condominiums c
      join public.subscriptions s on s.condominium_id = c.id
      where c.organization_id = new.id
    ) then
      raise exception using
        errcode = '23514',
        message = 'non-customer organization cannot retain a subscription';
    end if;
  end if;

  return new;
end;
$$;
