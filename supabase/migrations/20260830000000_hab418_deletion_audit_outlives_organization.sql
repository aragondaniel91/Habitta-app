-- HAB-418: let the deletion tombstone outlive the organization it belonged to.
--
-- `condominium_deletion_jobs` is the record that a tenant was purged: who asked, when, which
-- storage keys were claimed, whether file cleanup finished. It deliberately has no foreign key to
-- `condominiums`, so it survives the very deletion it documents.
--
-- Its foreign key to `organizations` was ON DELETE CASCADE, which quietly undid that. Deleting an
-- organization erased every record that its condominiums had ever been purged -- exactly the
-- evidence somebody would go looking for afterwards, and gone at the moment it stopped being
-- reconstructible from anything else.
--
-- Found by the pre-launch reset rehearsal, whose verification asserts the audit survives. The
-- reset deletes organizations after purging their condominiums, so it would have destroyed its own
-- evidence and reported success.
--
-- `organization_id` stays NOT NULL, because a tombstone that forgets which organization it
-- belonged to answers less than one that remembers. The reference simply stops being enforced: the
-- organization may be gone, and the id it used to have is still a fact worth keeping.

alter table public.condominium_deletion_jobs
  drop constraint condominium_deletion_jobs_organization_id_fkey;

comment on column public.condominium_deletion_jobs.organization_id is
  'The organization that owned the purged condominium. Intentionally not a foreign key: this row is '
  'a tombstone and must outlive both the condominium and the organization it records.';
