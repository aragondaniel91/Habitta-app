-- HAB-360: the community document catalog must be correctable.
--
-- Categories and folders could be created and never touched again. A typo in a folder name, a
-- category filed under the wrong default audience, or a folder that belongs under a different
-- parent were all permanent, and the only workaround was creating a duplicate beside the mistake.
--
-- Neither table is append-only, so correcting them is a real edit. Two rules make that safe:
--   * a folder can never become its own ancestor, which would detach a whole subtree from the
--     condominium and make it unreachable;
--   * archiving is refused while active documents still file under the category or folder, so
--     nothing disappears from the catalog with documents still pointing at it.

create or replace function public.update_community_document_category(
  target_condominium_id uuid,
  target_category_id uuid,
  target_name text,
  target_description text default null,
  target_default_audience public.community_document_audience default 'management',
  target_default_retention_days integer default null,
  target_is_active boolean default null
)
returns public.community_document_categories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_category public.community_document_categories;
  updated_category public.community_document_categories;
  next_name text := btrim(coalesce(target_name, ''));
  next_description text := nullif(btrim(coalesce(target_description, '')), '');
  next_active boolean;
begin
  if auth.uid() is null or not public.can_manage_community_documents(target_condominium_id) then
    raise exception 'community document manager required';
  end if;

  select * into current_category
  from public.community_document_categories
  where id = target_category_id
    and condominium_id = target_condominium_id
  for update;

  if current_category.id is null then
    raise exception 'document category unavailable';
  end if;

  next_active := coalesce(target_is_active, current_category.is_active);

  if char_length(next_name) not between 1 and 120 then
    raise exception 'invalid category name';
  end if;

  if target_default_retention_days is not null and target_default_retention_days <= 0 then
    raise exception 'invalid retention days';
  end if;

  if not next_active and current_category.is_active and exists (
    select 1
    from public.community_documents d
    where d.category_id = current_category.id
      and d.condominium_id = target_condominium_id
      and d.status = 'active'
  ) then
    raise exception 'document category still in use';
  end if;

  update public.community_document_categories
  set name = next_name,
      description = next_description,
      default_audience = target_default_audience,
      default_retention_days = target_default_retention_days,
      is_active = next_active,
      updated_at = now()
  where id = current_category.id
  returning * into updated_category;

  return updated_category;
end;
$$;

revoke all on function public.update_community_document_category(
  uuid, uuid, text, text, public.community_document_audience, integer, boolean
) from public, anon;

grant execute on function public.update_community_document_category(
  uuid, uuid, text, text, public.community_document_audience, integer, boolean
) to authenticated;

create or replace function public.update_community_document_folder(
  target_condominium_id uuid,
  target_folder_id uuid,
  target_name text,
  target_parent_folder_id uuid default null,
  target_description text default null,
  target_is_active boolean default null
)
returns public.community_document_folders
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_folder public.community_document_folders;
  updated_folder public.community_document_folders;
  next_name text := btrim(coalesce(target_name, ''));
  next_description text := nullif(btrim(coalesce(target_description, '')), '');
  next_active boolean;
begin
  if auth.uid() is null or not public.can_manage_community_documents(target_condominium_id) then
    raise exception 'community document manager required';
  end if;

  select * into current_folder
  from public.community_document_folders
  where id = target_folder_id
    and condominium_id = target_condominium_id
  for update;

  if current_folder.id is null then
    raise exception 'document folder unavailable';
  end if;

  next_active := coalesce(target_is_active, current_folder.is_active);

  if char_length(next_name) not between 1 and 120 then
    raise exception 'invalid folder name';
  end if;

  if target_parent_folder_id is not null then
    if target_parent_folder_id = current_folder.id then
      raise exception 'folder cannot contain itself';
    end if;

    if not exists (
      select 1
      from public.community_document_folders f
      where f.id = target_parent_folder_id
        and f.condominium_id = target_condominium_id
        and f.is_active
    ) then
      raise exception 'active parent folder required';
    end if;

    -- Reparenting a folder under one of its own descendants would cut the whole subtree loose
    -- from the condominium root, leaving those documents unreachable from the catalog.
    if exists (
      with recursive descendants as (
        select f.id
        from public.community_document_folders f
        where f.parent_folder_id = current_folder.id
          and f.condominium_id = target_condominium_id
        union all
        select child.id
        from public.community_document_folders child
        join descendants d on child.parent_folder_id = d.id
        where child.condominium_id = target_condominium_id
      )
      select 1 from descendants where id = target_parent_folder_id
    ) then
      raise exception 'folder cannot contain itself';
    end if;
  end if;

  if not next_active and current_folder.is_active then
    if exists (
      select 1
      from public.community_documents d
      where d.folder_id = current_folder.id
        and d.condominium_id = target_condominium_id
        and d.status = 'active'
    ) then
      raise exception 'document folder still in use';
    end if;

    if exists (
      select 1
      from public.community_document_folders f
      where f.parent_folder_id = current_folder.id
        and f.condominium_id = target_condominium_id
        and f.is_active
    ) then
      raise exception 'document folder still in use';
    end if;
  end if;

  update public.community_document_folders
  set name = next_name,
      parent_folder_id = target_parent_folder_id,
      description = next_description,
      is_active = next_active,
      updated_at = now()
  where id = current_folder.id
  returning * into updated_folder;

  return updated_folder;
end;
$$;

revoke all on function public.update_community_document_folder(
  uuid, uuid, text, uuid, text, boolean
) from public, anon;

grant execute on function public.update_community_document_folder(
  uuid, uuid, text, uuid, text, boolean
) to authenticated;
