create type public.condominium_person_relationship_type as enum (
  'board_member',
  'administrator_contact',
  'representative',
  'emergency_contact',
  'other'
);

-- Identity documents are optional, but when present they must identify a single
-- person inside a condominium even if punctuation/casing differs.
do $$
begin
  if exists (
    select 1
    from public.people
    where document_type is not null
      and btrim(document_type) <> ''
      and document_number is not null
      and btrim(document_number) <> ''
    group by
      condominium_id,
      upper(btrim(document_type)),
      upper(regexp_replace(btrim(document_number), '[^[:alnum:]]', '', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce person document identity: duplicate normalized documents exist';
  end if;
end
$$;

create unique index people_document_identity_unique
  on public.people (
    condominium_id,
    upper(btrim(document_type)),
    upper(regexp_replace(btrim(document_number), '[^[:alnum:]]', '', 'g'))
  )
  where document_type is not null
    and btrim(document_type) <> ''
    and document_number is not null
    and btrim(document_number) <> '';

create table public.condominium_person_relationships (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  person_id uuid not null,
  relationship_type public.condominium_person_relationship_type not null,
  title text,
  starts_at date not null default current_date,
  ends_at date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint condominium_person_relationships_person_tenant_fkey
    foreign key (person_id, condominium_id)
    references public.people(id, condominium_id)
    on delete cascade,
  constraint condominium_person_relationships_date_order
    check (ends_at is null or ends_at >= starts_at),
  constraint condominium_person_relationships_title_length
    check (title is null or char_length(btrim(title)) between 1 and 120)
);

create unique index condominium_person_relationships_active_unique
  on public.condominium_person_relationships (
    condominium_id,
    person_id,
    relationship_type
  )
  where ends_at is null;

create index condominium_person_relationships_condominium_history_idx
  on public.condominium_person_relationships (
    condominium_id,
    ends_at,
    relationship_type,
    starts_at desc
  );

create index condominium_person_relationships_person_history_idx
  on public.condominium_person_relationships (person_id, starts_at desc);

create or replace function public.touch_condominium_person_relationship_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_condominium_person_relationship_updated_at() from public;
revoke all on function public.touch_condominium_person_relationship_updated_at() from anon;
revoke all on function public.touch_condominium_person_relationship_updated_at() from authenticated;

create trigger condominium_person_relationships_touch_updated_at
before update on public.condominium_person_relationships
for each row
execute function public.touch_condominium_person_relationship_updated_at();

alter table public.condominium_person_relationships enable row level security;

revoke all on table public.condominium_person_relationships from anon;
revoke all on table public.condominium_person_relationships from authenticated;
grant select, insert, update on table public.condominium_person_relationships to authenticated;

create policy condominium_person_relationships_read
on public.condominium_person_relationships
for select
to authenticated
using (
  public.can_read_people(condominium_id)
  or exists (
    select 1
    from public.people p
    where p.id = condominium_person_relationships.person_id
      and p.condominium_id = condominium_person_relationships.condominium_id
      and p.auth_user_id = auth.uid()
  )
);

create policy condominium_person_relationships_insert
on public.condominium_person_relationships
for insert
to authenticated
with check (
  public.can_manage_people(condominium_id)
  and created_by = auth.uid()
);

create policy condominium_person_relationships_update
on public.condominium_person_relationships
for update
to authenticated
using (public.can_manage_people(condominium_id))
with check (
  public.can_manage_people(condominium_id)
  and created_by = auth.uid()
);

comment on table public.condominium_person_relationships is
  'Historical condominium-level relationships for people that do not require a unit assignment.';
comment on column public.condominium_person_relationships.ends_at is
  'Closing date. Relationships are ended rather than deleted so condominium history remains auditable.';
