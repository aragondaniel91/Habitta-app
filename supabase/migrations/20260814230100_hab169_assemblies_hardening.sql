-- HAB-169 hardening kept separate so the lifecycle rules are explicit and independently reviewable.

alter table public.assembly_eligibility_snapshots
  add constraint assembly_eligibility_snapshot_scope_unique
  unique (id, assembly_id, condominium_id);

alter table public.assembly_attendance
  add constraint assembly_attendance_snapshot_scope_fkey
  foreign key (eligibility_snapshot_id, assembly_id, condominium_id)
  references public.assembly_eligibility_snapshots(id, assembly_id, condominium_id);

create or replace function public.assert_assembly_agenda_mutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.assembly_status;
  target_assembly_id uuid;
  target_condominium_id uuid;
begin
  if tg_op = 'DELETE' then
    target_assembly_id := old.assembly_id;
    target_condominium_id := old.condominium_id;
  else
    target_assembly_id := new.assembly_id;
    target_condominium_id := new.condominium_id;
  end if;

  select status into current_status
  from public.assemblies
  where id = target_assembly_id
    and condominium_id = target_condominium_id;

  if current_status not in ('draft', 'scheduled') then
    raise exception 'assembly agenda is frozen after the meeting starts';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create function public.assert_published_assembly_minutes_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.minutes_published_at is not null and (
    new.minutes_body is distinct from old.minutes_body
    or new.minutes_published_at is distinct from old.minutes_published_at
    or new.minutes_published_by is distinct from old.minutes_published_by
  ) then
    raise exception 'published assembly minutes are immutable';
  end if;

  return new;
end;
$$;

revoke execute on function public.assert_published_assembly_minutes_immutable() from public;

create trigger assemblies_minutes_immutable_after_publication
before update on public.assemblies
for each row execute function public.assert_published_assembly_minutes_immutable();
