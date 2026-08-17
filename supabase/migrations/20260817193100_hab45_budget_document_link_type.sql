-- HAB-45: Community Documents can now target the authoritative budget domain.
-- Keep this enum change in its own migration so PostgreSQL commits the value
-- before a later migration uses it in function bodies.

alter type public.community_document_link_type add value if not exists 'budget';
