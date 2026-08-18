create table public.person_admin_note_revisions (
  id bigint generated always as identity primary key,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  person_id uuid not null,
  action text not null,
  content text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint person_admin_note_revisions_person_tenant_fkey
    foreign key (person_id, condominium_id)
    references public.people(id, condominium_id)
    on delete cascade,
  constraint person_admin_note_revisions_action_check
    check (action in ('saved', 'cleared')),
  constraint person_admin_note_revisions_content_check
    check (
      (action = 'saved' and content is not null and char_length(btrim(content)) between 1 and 4000)
      or (action = 'cleared' and content is null)
    )
);

create index person_admin_note_revisions_person_history_idx
  on public.person_admin_note_revisions (condominium_id, person_id, id desc);

alter table public.person_admin_note_revisions enable row level security;

revoke all on table public.person_admin_note_revisions from anon;
revoke all on table public.person_admin_note_revisions from authenticated;
grant select, insert on table public.person_admin_note_revisions to authenticated;

grant usage, select on sequence public.person_admin_note_revisions_id_seq to authenticated;

create policy person_admin_note_revisions_read
on public.person_admin_note_revisions
for select
to authenticated
using (public.can_manage_people(condominium_id));

create policy person_admin_note_revisions_insert
on public.person_admin_note_revisions
for insert
to authenticated
with check (
  public.can_manage_people(condominium_id)
  and created_by = auth.uid()
);

comment on table public.person_admin_note_revisions is
  'Append-only administrative notes for a person. Only roles allowed to manage People may read or append revisions.';
comment on column public.person_admin_note_revisions.action is
  'saved stores a new note body; cleared appends a tombstone without deleting prior history.';
comment on column public.person_admin_note_revisions.content is
  'Internal administration context only. Do not store credentials, authentication tokens, payment-card data or secrets.';
