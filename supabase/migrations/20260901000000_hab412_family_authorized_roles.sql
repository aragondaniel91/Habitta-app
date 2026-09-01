-- HAB-412 / HAB-418, part one: the two enum values, and nothing else.
--
-- PostgreSQL refuses to use a new enum value in the same transaction that added it ("unsafe use of
-- new value"), and Supabase runs each migration file in its own transaction. So the values land
-- here alone and everything that compares against them lands in the next file. Keeping them apart
-- also keeps the security review legible: this migration grants nothing.
--
-- Adding a value to `condominium_role` is not, by itself, safe. Several authorization helpers ask
-- whether a role is *not* tenant, and both of these would answer "not tenant" while being the two
-- least privileged roles in the product. Part two replaces every one of those comparisons with an
-- explicit allowlist before any membership of these roles can exist.

alter type public.condominium_role add value if not exists 'family_member';
alter type public.condominium_role add value if not exists 'authorized_occupant';
