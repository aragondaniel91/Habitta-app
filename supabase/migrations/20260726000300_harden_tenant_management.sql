-- Replaces the first-generation shared membership model without altering its historical migration.
drop policy if exists "organizations are isolated by membership" on public.organizations;
drop policy if exists "condominiums are isolated by organization" on public.condominiums;
drop policy if exists "memberships are isolated by organization" on public.memberships;
drop function if exists public.is_organization_member(uuid);
drop function if exists public.is_condominium_member(uuid);
drop table if exists public.memberships;
drop type if exists public.membership_role;

alter table public.buildings add constraint buildings_id_condominium_unique unique (id, condominium_id);
alter table public.units drop constraint if exists units_building_id_fkey;
alter table public.units add constraint units_building_condominium_fkey foreign key (building_id, condominium_id) references public.buildings(id, condominium_id) on delete set null (building_id);

create or replace function public.can_manage_condominium_structure(target uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_organization_owner((select organization_id from public.condominiums where id=target))
  or exists(select 1 from public.condominium_memberships where condominium_id=target and user_id=auth.uid() and role='condominium_admin');
$$;
revoke execute on function public.can_manage_condominium_structure(uuid) from public;
grant execute on function public.can_manage_condominium_structure(uuid) to authenticated, service_role;
drop policy if exists building_write on public.buildings;
drop policy if exists unit_write on public.units;
create policy building_write on public.buildings for all using (public.can_manage_condominium_structure(condominium_id)) with check (public.can_manage_condominium_structure(condominium_id));
create policy unit_write on public.units for all using (public.can_manage_condominium_structure(condominium_id)) with check (public.can_manage_condominium_structure(condominium_id));

create or replace function public.create_condominium(target_organization_id uuid, condominium_name text) returns public.condominiums language plpgsql security definer set search_path=public as $$
declare created public.condominiums;
begin
 if auth.uid() is null or not public.is_organization_owner(target_organization_id) then raise exception 'organization owner required'; end if;
 insert into public.condominiums(organization_id,name,created_by) values(target_organization_id,condominium_name,auth.uid()) returning * into created;
 insert into public.condominium_memberships(condominium_id,user_id,role) values(created.id,auth.uid(),'condominium_admin');
 return created;
end; $$;
revoke execute on function public.create_condominium(uuid,text) from public;
grant execute on function public.create_condominium(uuid,text) to authenticated, service_role;
