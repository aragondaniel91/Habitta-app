-- Defense in depth: even privileged/manual inserts must not be able to pair a delivery event with
-- a condominium, person or unit different from the canonical resident invitation.
create unique index invitations_delivery_identity_unique
  on public.invitations (id, condominium_id, person_id, unit_id);

alter table public.resident_invitation_delivery_events
  add constraint resident_invitation_delivery_identity_fkey
  foreign key (invitation_id, condominium_id, person_id, unit_id)
  references public.invitations (id, condominium_id, person_id, unit_id)
  on delete cascade;
