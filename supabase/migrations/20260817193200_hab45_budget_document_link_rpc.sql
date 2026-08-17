-- HAB-45: extend the existing related-record validator with authoritative budgets.

create or replace function public.link_community_document(
  target_document_id uuid,
  target_type public.community_document_link_type,
  target_id uuid
)
returns public.community_document_links
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_document public.community_documents;
  target_exists boolean := false;
  created public.community_document_links;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into target_document
  from public.community_documents d
  where d.id = target_document_id;

  if target_document.id is null
    or not public.can_manage_community_documents(target_document.condominium_id)
  then
    raise exception 'community document manager required';
  end if;

  case target_type
    when 'announcement' then
      select exists (
        select 1 from public.announcements a
        where a.id = target_id and a.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'service_request' then
      select exists (
        select 1 from public.service_requests r
        where r.id = target_id and r.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'expense' then
      select exists (
        select 1 from public.expenses e
        where e.id = target_id and e.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'assembly' then
      select exists (
        select 1 from public.assemblies a
        where a.id = target_id and a.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'proposal' then
      select exists (
        select 1 from public.governance_proposals p
        where p.id = target_id and p.condominium_id = target_document.condominium_id
      ) into target_exists;
    when 'budget' then
      select exists (
        select 1 from public.budget_periods b
        where b.id = target_id and b.condominium_id = target_document.condominium_id
      ) into target_exists;
  end case;

  if not target_exists then
    raise exception 'related record not found in condominium';
  end if;

  insert into public.community_document_links (
    document_id,
    condominium_id,
    target_type,
    target_id,
    created_by
  ) values (
    target_document.id,
    target_document.condominium_id,
    target_type,
    target_id,
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;
