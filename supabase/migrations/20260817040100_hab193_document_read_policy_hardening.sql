-- HAB-193: make child-row authorization explicit instead of relying on
-- correlated RLS subqueries with similarly named condominium_id columns.

create function public.can_read_community_document(
  target_document_id uuid,
  target_condominium_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.community_documents d
    where d.id = target_document_id
      and d.condominium_id = target_condominium_id
      and public.can_read_community_document_scope(
        d.condominium_id,
        d.audience,
        d.status
      )
  );
$$;

revoke execute on function public.can_read_community_document(uuid, uuid) from public;
grant execute on function public.can_read_community_document(uuid, uuid)
  to authenticated, service_role;

drop policy community_document_versions_read on public.community_document_versions;
create policy community_document_versions_read
on public.community_document_versions
for select
using (public.can_read_community_document(document_id, condominium_id));

drop policy community_document_links_read on public.community_document_links;
create policy community_document_links_read
on public.community_document_links
for select
using (public.can_read_community_document(document_id, condominium_id));
