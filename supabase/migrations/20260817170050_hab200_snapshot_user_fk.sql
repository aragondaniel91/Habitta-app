-- HAB-200: snapshot entitlements must reference real authenticated users.

alter table public.governance_eligibility_snapshots
  add constraint governance_eligibility_snapshot_user_fk
  foreign key (eligible_user_id) references auth.users(id);
