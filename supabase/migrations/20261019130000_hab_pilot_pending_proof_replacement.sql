-- Versioned evidence replacement on pending payments, without changing payment lifecycle.
-- DB serializes replacements and approval by locking the payment row.
-- Superseded metadata remains audit-readable under existing RLS.
create or replace function public.can_upload_payment_proof(target uuid,target_payment uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off as $$
  select exists(select 1 from public.payments p where p.id=target_payment and p.condominium_id=target
    and p.status in ('draft','correction_requested','submitted','under_review')
    and public.can_manage_payment_draft(target,p.submitted_by_user_id))
$$;

create or replace function public.record_payment_proof(
  target uuid,target_payment uuid,target_proof uuid,key_value text,filename text,mime text,bytes bigint,hash text
) returns public.payment_proofs
language plpgsql security definer set search_path=public set row_security=off as $$
declare p public.payments; proof public.payment_proofs; previous uuid;
begin
  select * into p from public.payments where id=target_payment and condominium_id=target for update;
  if p.id is null or p.status not in ('draft','correction_requested','submitted','under_review')
    or not public.can_manage_payment_draft(target,p.submitted_by_user_id)
    or bytes<=0 or bytes>10485760 or mime not in ('image/jpeg','image/png','image/webp','application/pdf')
    or key_value<>format('payments/%s',target_proof) then raise exception 'proof upload denied'; end if;
  select id into previous from public.payment_proofs where payment_id=p.id and superseded_at is null for update;
  if previous is not null then update public.payment_proofs set superseded_at=now(),superseded_by_proof_id=target_proof where id=previous; end if;
  insert into public.payment_proofs(id,condominium_id,payment_id,object_key,original_filename,content_type,size_bytes,sha256,uploaded_by)
  values(target_proof,target,p.id,key_value,filename,mime,bytes,hash,auth.uid()) returning * into proof;
  return proof;
end $$;

revoke all on function public.can_upload_payment_proof(uuid,uuid),
  public.record_payment_proof(uuid,uuid,uuid,text,text,text,bigint,text) from public;
grant execute on function public.can_upload_payment_proof(uuid,uuid),
  public.record_payment_proof(uuid,uuid,uuid,text,text,text,bigint,text) to authenticated, service_role;
