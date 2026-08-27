begin;
select plan(4);

-- A tombstone that can be deleted is not a tombstone. `condominium_deletion_jobs` records that a
-- tenant was purged, and it has to outlive everything it documents -- including the organization,
-- which the pre-launch reset deletes right after purging its condominiums.

-- Structural, and the reason the table can be written at all after its condominium is gone.
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.condominium_deletion_jobs'::regclass
     and contype = 'f'
     and confrelid = 'public.condominiums'::regclass),
  0,
  'the audit has no foreign key to condominiums, so it survives the deletion it records'
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
  ('41900000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@hab418.test','x',now(),now());
insert into public.organizations(id,name,created_by) values
  ('41910000-0000-4000-8000-00000000000a','Org T','41900000-0000-0000-0000-00000000000a');

-- The condominium this job describes is already gone, which is the normal state of a tombstone.
insert into public.condominium_deletion_jobs(condominium_id, organization_id, condominium_name, requested_by, storage_keys)
values ('41920000-0000-4000-8000-00000000000a','41910000-0000-4000-8000-00000000000a','Condo T','41900000-0000-0000-0000-00000000000a','{}');

-- The organization going away must not take the record with it. It used to, through an ON DELETE
-- CASCADE, so deleting an organization erased the evidence that its condominiums were ever purged
-- -- at the moment that evidence stopped being reconstructible from anything else.
delete from public.organizations where id = '41910000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::integer from public.condominium_deletion_jobs
   where condominium_id = '41920000-0000-4000-8000-00000000000a'),
  1,
  'the tombstone survives the organization it belonged to'
);

-- And it still says which organization that was. The constraint was dropped, not the information.
select is(
  (select organization_id from public.condominium_deletion_jobs
   where condominium_id = '41920000-0000-4000-8000-00000000000a'),
  '41910000-0000-4000-8000-00000000000a'::uuid,
  'the tombstone still names an organization that no longer exists'
);

-- Stated as a property rather than as a one-off, so no future migration can quietly reattach a
-- cascade to this table from any direction.
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.condominium_deletion_jobs'::regclass
     and contype = 'f' and confdeltype = 'c'),
  0,
  'no cascade can reach the deletion audit'
);

select * from finish();
rollback;
