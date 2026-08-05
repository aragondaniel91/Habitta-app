-- Make private attachment visibility explicit for creators and authorized managers.
-- This complements the existing entity policies while keeping outsiders isolated.

drop policy if exists governance_attachments_read on public.governance_attachments;
create policy governance_attachments_read on public.governance_attachments
for select using (
  created_by = auth.uid()
  or public.can_manage_governance(condominium_id)
  or public.can_read_governance(condominium_id)
);

drop policy if exists announcement_attachments_read on public.announcement_attachments;
create policy announcement_attachments_read on public.announcement_attachments
for select using (
  uploaded_by = auth.uid()
  or public.can_review_announcements(condominium_id)
  or public.can_access_announcement(announcement_id)
);
