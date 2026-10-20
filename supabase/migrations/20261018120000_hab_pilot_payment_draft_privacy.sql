-- HAB-PILOT-001-R2: drafts are private to their registrar.  A staff member may
-- collaborate only on a draft originally registered by staff; review access starts
-- when the payment is submitted.  Ledger and approval contracts are untouched.

create or replace function public.is_payment_staff_owner(target uuid, owner uuid)
returns boolean
language sql stable security definer set search_path=public set row_security=off as $$
  select exists (
    select 1 from public.condominium_memberships cm
    where cm.condominium_id=target and cm.user_id=owner
      and cm.role in ('condominium_admin','accountant','assistant')
  ) or exists (
    select 1 from public.condominiums c
    join public.organization_memberships om on om.organization_id=c.organization_id
    where c.id=target and om.user_id=owner and om.role='organization_owner'
  )
$$;

create or replace function public.can_manage_payment_draft(target uuid, owner uuid)
returns boolean
language sql stable security definer set search_path=public set row_security=off as $$
  select owner=auth.uid()
    or (public.can_register_payment_for(target) and public.is_payment_staff_owner(target, owner))
$$;

revoke all on function public.is_payment_staff_owner(uuid,uuid), public.can_manage_payment_draft(uuid,uuid) from public;
grant execute on function public.is_payment_staff_owner(uuid,uuid), public.can_manage_payment_draft(uuid,uuid) to authenticated, service_role;

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select using (
  (status <> 'draft' and (public.can_review_payments(condominium_id) or public.can_submit_payment(unit_id)))
  or (status = 'draft' and public.can_manage_payment_draft(condominium_id, submitted_by_user_id))
);

drop policy if exists proofs_read on public.payment_proofs;
create policy proofs_read on public.payment_proofs for select using (
  exists (
    select 1 from public.payments p
    where p.id=payment_id
      and (
        (p.status <> 'draft' and (public.can_review_payments(p.condominium_id) or public.can_submit_payment(p.unit_id)))
        or (p.status = 'draft' and public.can_manage_payment_draft(p.condominium_id, p.submitted_by_user_id))
      )
  )
);

create or replace function public.update_payment_draft(
  target uuid,target_payment uuid,target_method uuid,payment_on date,amount numeric,
  currency text,payer text,reference_value text,notes_value text
) returns public.payments
language plpgsql security definer set search_path=public set row_security=off as $$
declare p public.payments; method public.condominium_payment_methods;
begin
  select * into p from public.payments where id=target_payment and condominium_id=target for update;
  if p.id is null then raise exception 'payment update denied'; end if;
  if not public.can_manage_payment_draft(target,p.submitted_by_user_id) then
    raise exception using errcode='42501', message='payment update denied';
  end if;
  if p.status not in ('draft','correction_requested') or payment_on is null or amount is null
    or amount<=0 or amount<>round(amount,2) or currency !~ '^[A-Z]{3}$' or coalesce(trim(payer),'')='' then
    raise exception 'payment update denied';
  end if;
  select * into method from public.condominium_payment_methods
    where id=target_method and condominium_id=target and is_active;
  if method.id is null or method.currency_code<>currency then raise exception 'invalid payment method or currency'; end if;
  update public.payments set payment_method_id=target_method,payment_date=payment_on,
    original_amount=amount,original_currency_code=currency,payer_name=trim(payer),
    reference=nullif(trim(reference_value),''),notes=nullif(trim(notes_value),''),updated_at=now()
  where id=p.id returning * into p;
  return p;
end $$;

create or replace function public.submit_payment(target uuid,target_payment uuid) returns public.payments
language plpgsql security definer set search_path=public set row_security=off as $$
declare p public.payments; m public.condominium_payment_methods;
begin
  select * into p from public.payments where id=target_payment and condominium_id=target for update;
  if p.id is null then raise exception 'payment cannot be submitted'; end if;
  if not public.can_manage_payment_draft(target,p.submitted_by_user_id) then
    raise exception using errcode='42501', message='payment submission denied';
  end if;
  if p.status not in ('draft','correction_requested') then raise exception 'payment cannot be submitted'; end if;
  select * into m from public.condominium_payment_methods where id=p.payment_method_id;
  if m.requires_reference and coalesce(trim(p.reference),'')='' then raise exception 'payment reference required'; end if;
  if m.requires_proof and not exists(select 1 from public.payment_proofs where payment_id=p.id and superseded_at is null) then raise exception 'payment proof required'; end if;
  update public.payments set status='submitted',submitted_at=now(),updated_at=now(),correction_reason=null
  where id=p.id returning * into p;
  return p;
end $$;

create or replace function public.can_upload_payment_proof(target uuid,target_payment uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off as $$
  select exists(select 1 from public.payments p where p.id=target_payment and p.condominium_id=target
    and p.status in ('draft','correction_requested')
    and public.can_manage_payment_draft(target,p.submitted_by_user_id))
$$;

create or replace function public.record_payment_proof(
  target uuid,target_payment uuid,target_proof uuid,key_value text,filename text,mime text,bytes bigint,hash text
) returns public.payment_proofs
language plpgsql security definer set search_path=public set row_security=off as $$
declare p public.payments; proof public.payment_proofs; previous uuid;
begin
  select * into p from public.payments where id=target_payment and condominium_id=target for update;
  if p.id is null or p.status not in ('draft','correction_requested')
    or not public.can_manage_payment_draft(target,p.submitted_by_user_id)
    or bytes<=0 or bytes>10485760 or mime not in ('image/jpeg','image/png','image/webp','application/pdf')
    or key_value<>format('payments/%s',target_proof) then raise exception 'proof upload denied'; end if;
  select id into previous from public.payment_proofs where payment_id=p.id and superseded_at is null for update;
  if previous is not null then update public.payment_proofs set superseded_at=now(),superseded_by_proof_id=target_proof where id=previous; end if;
  insert into public.payment_proofs(id,condominium_id,payment_id,object_key,original_filename,content_type,size_bytes,sha256,uploaded_by)
  values(target_proof,target,p.id,key_value,filename,mime,bytes,hash,auth.uid()) returning * into proof;
  return proof;
end $$;
