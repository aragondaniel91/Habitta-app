-- HAB-200: establish the composite tenant key needed by governance snapshot FKs.
-- `id` is already the primary key, so this cannot reject existing rows; it only lets
-- child tables encode condominium_id in the FK and reject cross-condominium references.

alter table public.units
  add constraint units_id_condominium_unique unique (id, condominium_id);
