-- Corrections retain relationship identity and lifecycle dates, while recording every before/after.
create table public.person_relationship_corrections (
  id bigint generated always as identity primary key,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  relationship_kind text not null check (relationship_kind in ('ownership', 'occupancy', 'community_role')),
  relationship_id uuid not null, person_id uuid not null references public.people(id) on delete restrict,
  before_value jsonb not null, after_value jsonb not null,
  corrected_by uuid not null references auth.users(id), corrected_at timestamptz not null default now()
);
create index person_relationship_corrections_lookup_idx on public.person_relationship_corrections (condominium_id, relationship_kind, relationship_id, corrected_at desc);
alter table public.person_relationship_corrections enable row level security;
revoke all on public.person_relationship_corrections from anon;
grant select on public.person_relationship_corrections to authenticated;
create policy person_relationship_corrections_read on public.person_relationship_corrections for select to authenticated using (public.can_manage_people(condominium_id));

create or replace function public.correct_unit_owner_percentage(target uuid, target_assignment uuid, next_percentage numeric)
returns public.unit_owners language plpgsql security definer set search_path = public set row_security = off as $$
declare assignment public.unit_owners;
begin
  if auth.uid() is null or not public.can_manage_people(target) then raise exception 'permission denied'; end if;
  if next_percentage <= 0 or next_percentage > 100 then raise exception 'invalid ownership percentage'; end if;
  select o.* into assignment from public.unit_owners o join public.units u on u.id=o.unit_id where o.id=target_assignment and u.condominium_id=target for update;
  if assignment.id is null then raise exception 'ownership assignment not found'; end if;
  if assignment.ends_at is not null then raise exception 'ownership assignment is already closed'; end if;
  if assignment.ownership_percentage is not distinct from next_percentage then return assignment; end if;
  insert into public.person_relationship_corrections(condominium_id, relationship_kind, relationship_id, person_id, before_value, after_value, corrected_by)
  values(target, 'ownership', assignment.id, assignment.person_id, jsonb_build_object('ownership_percentage', assignment.ownership_percentage), jsonb_build_object('ownership_percentage', next_percentage), auth.uid());
  perform set_config('habitta.audited_owner_correction', 'on', true);
  update public.unit_owners set ownership_percentage=next_percentage where id=assignment.id returning * into assignment;
  return assignment;
end $$;

-- Existing immutable-history guard remains in force; only the audited RPC above may change a percentage.
create or replace function public.guard_unit_owner_history() returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if tg_op = 'DELETE' and public.is_unit_condominium_purge_authorized(old.unit_id) then return old; end if;
  if tg_op = 'DELETE' then raise exception 'ownership history cannot be deleted'; end if;
  if tg_op = 'UPDATE' then
    if (new.unit_id, new.person_id, new.starts_at, new.is_primary_contact, new.created_by, new.created_at) is distinct from (old.unit_id, old.person_id, old.starts_at, old.is_primary_contact, old.created_by, old.created_at) then raise exception 'ownership history cannot be rewritten'; end if;
    if new.ownership_percentage is distinct from old.ownership_percentage and current_setting('habitta.audited_owner_correction', true) is distinct from 'on' then raise exception 'ownership percentage requires an audited correction'; end if;
    if old.ends_at is not null and new.ends_at is distinct from old.ends_at then raise exception 'closed ownership history cannot be changed'; end if;
    if new.ends_at is not null and new.ends_at < old.starts_at then raise exception 'ownership end date cannot precede start date'; end if;
  end if;
  return new;
end $$;

create or replace function public.correct_unit_occupancy_type(target uuid, target_assignment uuid, next_type public.occupancy_type)
returns public.unit_occupancies language plpgsql security definer set search_path = public set row_security = off as $$
declare assignment public.unit_occupancies;
begin
  if auth.uid() is null or not public.can_manage_people(target) then raise exception 'permission denied'; end if;
  select o.* into assignment from public.unit_occupancies o join public.units u on u.id=o.unit_id where o.id=target_assignment and u.condominium_id=target for update;
  if assignment.id is null then raise exception 'occupancy assignment not found'; end if;
  if assignment.ends_at is not null then raise exception 'occupancy assignment is already closed'; end if;
  if assignment.occupancy_type is not distinct from next_type then return assignment; end if;
  insert into public.person_relationship_corrections(condominium_id, relationship_kind, relationship_id, person_id, before_value, after_value, corrected_by)
  values(target, 'occupancy', assignment.id, assignment.person_id, jsonb_build_object('occupancy_type', assignment.occupancy_type), jsonb_build_object('occupancy_type', next_type), auth.uid());
  perform set_config('habitta.audited_occupancy_correction', 'on', true);
  update public.unit_occupancies set occupancy_type=next_type where id=assignment.id returning * into assignment;
  return assignment;
end $$;

create or replace function public.guard_unit_occupancy_history() returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if tg_op = 'DELETE' and public.is_unit_condominium_purge_authorized(old.unit_id) then return old; end if;
  if tg_op = 'DELETE' then raise exception 'occupancy history cannot be deleted'; end if;
  if (new.unit_id, new.person_id, new.starts_at, new.created_by, new.created_at) is distinct from (old.unit_id, old.person_id, old.starts_at, old.created_by, old.created_at) then raise exception 'occupancy history cannot be rewritten'; end if;
  if new.occupancy_type is distinct from old.occupancy_type and current_setting('habitta.audited_occupancy_correction', true) is distinct from 'on' then raise exception 'occupancy type requires an audited correction'; end if;
  if old.ends_at is not null and new.ends_at is distinct from old.ends_at then raise exception 'closed occupancy history cannot be changed'; end if;
  if new.ends_at is not null and new.ends_at < old.starts_at then raise exception 'occupancy end date cannot precede start date'; end if;
  return new;
end $$;

create trigger unit_occupancies_history_guard before update or delete on public.unit_occupancies
for each row execute function public.guard_unit_occupancy_history();

create or replace function public.correct_community_person_relationship(target uuid, target_relationship uuid, next_type public.condominium_person_relationship_type, next_title text)
returns public.condominium_person_relationships language plpgsql security definer set search_path = public set row_security = off as $$
declare relationship public.condominium_person_relationships;
begin
  if auth.uid() is null or not public.can_manage_people(target) then raise exception 'permission denied'; end if;
  if char_length(btrim(coalesce(next_title, ''))) > 120 then raise exception 'invalid relationship title'; end if;
  select * into relationship from public.condominium_person_relationships where id=target_relationship and condominium_id=target for update;
  if relationship.id is null then raise exception 'community relationship not found'; end if;
  if relationship.ends_at is not null then raise exception 'community relationship is already closed'; end if;
  if relationship.relationship_type is not distinct from next_type and relationship.title is not distinct from nullif(btrim(next_title), '') then return relationship; end if;
  insert into public.person_relationship_corrections(condominium_id, relationship_kind, relationship_id, person_id, before_value, after_value, corrected_by)
  values(target, 'community_role', relationship.id, relationship.person_id, jsonb_build_object('relationship_type', relationship.relationship_type, 'title', relationship.title), jsonb_build_object('relationship_type', next_type, 'title', nullif(btrim(next_title), '')), auth.uid());
  perform set_config('habitta.audited_community_role_correction', 'on', true);
  update public.condominium_person_relationships set relationship_type=next_type, title=nullif(btrim(next_title), '') where id=relationship.id returning * into relationship;
  return relationship;
end $$;

create or replace function public.guard_condominium_person_relationship_update() returns trigger language plpgsql set search_path = public as $$
begin
  if new.condominium_id is distinct from old.condominium_id or new.person_id is distinct from old.person_id or new.created_by is distinct from old.created_by then raise exception 'relationship identity and authorship are immutable'; end if;
  if new.starts_at is distinct from old.starts_at then raise exception 'relationship start date cannot be changed'; end if;
  if (new.relationship_type is distinct from old.relationship_type or new.title is distinct from old.title) and current_setting('habitta.audited_community_role_correction', true) is distinct from 'on' then raise exception 'relationship attributes require an audited correction'; end if;
  if old.ends_at is not null and new.ends_at is distinct from old.ends_at then raise exception 'closed relationship history cannot be changed'; end if;
  if new.ends_at is not null and new.ends_at < old.starts_at then raise exception 'relationship end date cannot precede start date'; end if;
  new.updated_at := now(); return new;
end $$;

revoke all on function public.correct_unit_owner_percentage(uuid, uuid, numeric) from public, anon;
revoke all on function public.correct_unit_occupancy_type(uuid, uuid, public.occupancy_type) from public, anon;
revoke all on function public.correct_community_person_relationship(uuid, uuid, public.condominium_person_relationship_type, text) from public, anon;
grant execute on function public.correct_unit_owner_percentage(uuid, uuid, numeric) to authenticated;
grant execute on function public.correct_unit_occupancy_type(uuid, uuid, public.occupancy_type) to authenticated;
grant execute on function public.correct_community_person_relationship(uuid, uuid, public.condominium_person_relationship_type, text) to authenticated;
